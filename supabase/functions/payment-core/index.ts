import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Cache-Control": "no-store" } });

/** Porównanie sekretów po skrócie — stała długość, brak wycieku przez czas odpowiedzi. */
async function secretsMatch(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [ha, hb] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(a)),
    crypto.subtle.digest("SHA-256", enc.encode(b)),
  ]);
  const va = new Uint8Array(ha), vb = new Uint8Array(hb);
  let diff = 0;
  for (let i = 0; i < va.length; i++) diff |= va[i] ^ vb[i];
  return diff === 0;
}

type Caller =
  | { kind: "internal" }
  | { kind: "user"; userId: string };

/**
 * Ta funkcja pracuje na service_role, więc omija RLS — tożsamość MUSI być
 * ustalona tutaj, a nie przyjęta z body. Wcześniej nie było jej wcale:
 * `admin_grant` przyznawał kredyty komukolwiek na podstawie samego JSON-a.
 *
 * Wywołanie wewnętrzne (payment-core-webhook po weryfikacji podpisu) rozpoznajemy
 * po kluczu service_role w nagłówku Authorization.
 */
async function resolveCaller(req: Request, supabaseUrl: string, serviceKey: string): Promise<Caller | null> {
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;

  if (await secretsMatch(token, serviceKey)) return { kind: "internal" };

  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data } = await userClient.auth.getUser(token);
  return data?.user ? { kind: "user", userId: data.user.id } : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const body = await req.json();
    const { action } = body;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const caller = await resolveCaller(req, supabaseUrl, serviceKey);
    if (!caller) return json({ error: "Unauthorized" }, 401);

    if (action === "init" || action === "credits_check") {
      // Operacje zdejmują środki. Właściciel portfela to zalogowany wywołujący,
      // nigdy `user_id` z body — inaczej można wydać cudze saldo.
      if (caller.kind === "user") body.user_id = caller.userId;
      if (!body.user_id) return json({ error: "Brak user_id" }, 400);

      return action === "init"
        ? await handleInit(supabase, body)
        : await handleCreditsCheck(supabase, body);
    }

    if (action === "confirm_webhook") {
      // Wyłącznie wywołanie wewnętrzne z payment-core-webhook, i to dopiero po
      // weryfikacji podpisu operatora. Z zewnątrz oznaczenie płatności jako
      // opłaconej jest nieosiągalne.
      if (caller.kind !== "internal") {
        console.warn("payment-core: próba confirm_webhook spoza kanału wewnętrznego");
        return json({ error: "Forbidden" }, 403);
      }
      return await handleWebhook(supabase, body);
    }

    if (action === "admin_grant") {
      if (caller.kind === "user") {
        // Rola z bazy, nie z tokenu ani z body.
        const { data: row, error } = await supabase
          .from("drivers")
          .select("user_role")
          .eq("id", caller.userId)
          .maybeSingle();
        if (error) {
          console.error("payment-core: nie można potwierdzić roli", error);
          return json({ error: "Nie można potwierdzić uprawnień" }, 503);
        }
        if (row?.user_role !== "admin") {
          console.warn("payment-core: admin_grant odrzucony dla", caller.userId);
          return json({ error: "Forbidden" }, 403);
        }
        console.log("payment-core: admin_grant przez", caller.userId);
      }
      // Autora przekazujemy do księgi: nadanie bez wskazania, kto je zrobił,
      // nie jest wpisem audytowym. Kanał wewnętrzny (klucz serwisowy) daje null.
      return await handleAdminGrant(supabase, body, caller.kind === "user" ? caller.userId : null);
    }

    if (action === "welcome_credits_claim") {
      if (caller.kind !== "user") return json({ error: "Wymagane zalogowanie" }, 401);
      return await handleWelcomeCreditsClaim(supabase, caller.userId);
    }

    if (action === "admin_wallet_topup") {
      if (caller.kind === "user" && !(await isAdmin(supabase, caller.userId))) {
        console.warn("payment-core: admin_wallet_topup odrzucony dla", caller.userId);
        return json({ error: "Forbidden" }, 403);
      }
      return await handleAdminWalletTopup(supabase, body, caller.kind === "user" ? caller.userId : null);
    }

    return json({ error: "Unknown action" }, 400);
  } catch (e: any) {
    console.error("payment-core error:", e);
    return json({ error: e.message }, 500);
  }
});

/** Rola z bazy. Błąd odczytu = brak uprawnień (fail-closed). */
async function isAdmin(supabase: any, userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("drivers")
    .select("user_role")
    .eq("id", userId)
    .maybeSingle();
  if (error) {
    console.error("payment-core: nie można potwierdzić roli", error);
    return false;
  }
  return data?.user_role === "admin";
}

const WELCOME_CREDITS = 50;

/**
 * Bonus powitalny. Kwota jest stała po stronie serwera, a jednorazowości pilnuje
 * klucz główny tabeli credit_welcome_claims — nie obecność salda, którą
 * użytkownik mógł wcześniej skasować i odebrać bonus ponownie.
 */
async function handleWelcomeCreditsClaim(supabase: any, userId: string) {
  const { data: claimed, error: claimErr } = await supabase
    .from("credit_welcome_claims")
    .upsert({ user_id: userId, amount: WELCOME_CREDITS }, { onConflict: "user_id", ignoreDuplicates: true })
    .select("user_id");

  if (claimErr) {
    console.error("payment-core: błąd księgi bonusów", claimErr);
    return json({ error: "Nie można przyznać bonusu" }, 503);
  }

  const granted = Array.isArray(claimed) && claimed.length > 0;

  const { data: existing } = await supabase
    .from("user_credits")
    .select("id, credits_balance")
    .eq("user_id", userId)
    .maybeSingle();

  if (!granted) {
    // Bonus już był — zwracamy wyłącznie aktualny stan.
    return json({ granted: false, balance: existing?.credits_balance ?? 0 });
  }

  const balance = (existing?.credits_balance ?? 0) + WELCOME_CREDITS;

  const { error: writeErr } = existing
    ? await supabase.from("user_credits")
        .update({ credits_balance: balance, updated_at: new Date().toISOString() })
        .eq("id", existing.id)
    : await supabase.from("user_credits")
        .insert({ user_id: userId, credits_balance: balance });

  if (writeErr) {
    console.error("payment-core: nie zapisano bonusu", writeErr);
    return json({ error: "Nie można przyznać bonusu" }, 503);
  }

  console.log("payment-core: bonus powitalny dla", userId);
  return json({ granted: true, balance });
}

const MAX_ADMIN_TOPUP = 100_000;

/**
 * Ręczne doładowanie portfela przez administratora — zastępuje zapis wykonywany
 * dotąd wprost z panelu w przeglądarce.
 *
 * Wpis do księgi wiąże się z portfelem przez wallet_transactions.wallet_id, czyli
 * user_wallets.id. Panel wstawiał tam user_id, więc insert odbijał się od klucza
 * obcego JUŻ PO zmianie salda: saldo rosło, wpisu w księdze nie było, a admin
 * widział błąd.
 */
async function handleAdminWalletTopup(supabase: any, body: any, actorId: string | null) {
  const targetUserId = body?.target_user_id;
  const amount = Number(body?.amount);
  const reason = typeof body?.reason === "string" ? body.reason.slice(0, 200) : null;

  if (!targetUserId || typeof targetUserId !== "string") {
    return json({ error: "Brak identyfikatora użytkownika" }, 400);
  }
  if (!Number.isInteger(amount) || amount <= 0 || amount > MAX_ADMIN_TOPUP) {
    return json({ error: `Kwota musi być całkowita z zakresu 1–${MAX_ADMIN_TOPUP}` }, 400);
  }

  const { data: wallet, error: walletErr } = await supabase
    .from("user_wallets")
    .upsert({ user_id: targetUserId }, { onConflict: "user_id" })
    .select("id, balance")
    .single();

  if (walletErr || !wallet) {
    console.error("payment-core: brak portfela dla", targetUserId, walletErr);
    return json({ error: "Nie można odczytać portfela" }, 503);
  }

  const balance = (wallet.balance ?? 0) + amount;

  const { error: updErr } = await supabase
    .from("user_wallets")
    .update({ balance, updated_at: new Date().toISOString() })
    .eq("id", wallet.id);

  if (updErr) {
    console.error("payment-core: nie zapisano salda", updErr);
    return json({ error: "Nie można zapisać salda" }, 503);
  }

  const { error: txErr } = await supabase.from("wallet_transactions").insert({
    wallet_id: wallet.id,
    type: "topup",
    amount,
    description: reason || "Doładowanie przez administratora",
  });

  if (txErr) {
    // Saldo już zmienione — księga jest tu jedynym śladem, więc głośno logujemy.
    console.error("payment-core: saldo zmienione, wpis do księgi NIEUDANY", wallet.id, txErr);
    return json({ error: "Saldo doładowane, ale nie zapisano wpisu w historii", balance }, 500);
  }

  console.log("payment-core: doładowanie", amount, "dla", targetUserId, "przez", actorId ?? "kanał wewnętrzny");
  return json({ balance });
}

async function handleInit(supabase: any, body: any) {
  const {
    user_id, product_type, product_ref_id, amount, description,
    metadata, delivery_type, inpost_point_id, delivery_address, return_url,
    wallet_used: walletUsedRaw,
  } = body;

  // ⛔ KREDYTY SMS NIE SĄ SPRZEDAWANE TĄ DROGĄ.
  //
  // ═════════════════════════════════════════════════════════════════════════
  // CO BYŁO NIE TAK
  // ═════════════════════════════════════════════════════════════════════════
  // `/buy-credits` prowadził tędy drugą, równoległą sprzedaż SMS-ów: inny
  // cennik (`credit_packages`, poza gwarancją ceny), inny operator, a jednostki
  // lądowały w `user_credits` przez `upsertCredits`. Wysyłka SMS-a tej tabeli
  // NIE CZYTA — liczy się wyłącznie `check_usage` po pulach i paczkach
  // billingowych. Klient płacił i dostawał jednostki, których nie da się wydać.
  //
  // Dziś to uśpione (pakiety SMS w `credit_packages` mają `is_active = false`,
  // a do `/buy-credits` nie prowadzi żaden link), ale strona stoi pod adresem
  // i wystarczyłoby, żeby ktoś włączył pakiet.
  //
  // Odmowa stoi TUTAJ, przed utworzeniem płatności i przed zdjęciem salda —
  // czyli zanim klient cokolwiek zapłaci. Odmawianie dopiero przy wydaniu
  // towaru byłoby gorsze niż stan obecny: pieniądze pobrane, towar żaden.
  //
  // Właściwa droga zakupu: `billing-payu-order` → paczka w
  // `billing_addon_packs` → widoczna dla `check_usage` i dla wysyłki.
  if (product_type === "sms_credits") {
    console.error("payment-core: init odrzucony — sprzedaż SMS idzie przez billing-payu-order");
    return json({
      error: "Doładowanie SMS odbywa się w panelu, w liczniku SMS u góry ekranu.",
      code: "SMS_WRONG_CHANNEL",
    }, 400);
  }

  // ===== WALLET USAGE (max 80% of order) =====
  let wallet_used = Number(walletUsedRaw || 0);
  if (wallet_used < 0) wallet_used = 0;
  const cap = Math.floor(Number(amount) * 0.8 * 100) / 100;
  if (wallet_used > cap) wallet_used = cap;

  if (wallet_used > 0) {
    const { data: w } = await supabase
      .from("user_wallets")
      .select("pln_balance")
      .eq("user_id", user_id)
      .maybeSingle();
    const bal = Number(w?.pln_balance || 0);
    if (bal < wallet_used) wallet_used = bal;
  }
  const amount_to_charge = Math.max(0, Number(amount) - wallet_used);
  const enrichedMeta = { ...(metadata || {}), wallet_used, gross_amount: amount };

  // Get active gateway config
  const { data: gw } = await supabase
    .from("payment_gateway_config")
    .select("*")
    .eq("is_enabled", true)
    .limit(1)
    .maybeSingle();

  // Brak skonfigurowanej bramki NIE MOŻE oznaczać darmowego produktu.
  //
  // Niżej stoi gałąź, która przy `!gw` ustawiała płatność na "paid" z sesją
  // "SIM-", uruchamiała processPaymentSuccess i wypłacała prowizję referral —
  // czyli wydawała towar bez pobrania złotówki. A konfiguracja bramki jest dziś
  // pusta, bo formularz w panelu zapisuje kolumny pos_id i is_sandbox, których
  // ta tabela nie ma; każdy zapis kończy się błędem. Efektem było darmowe
  // przyznawanie WSZYSTKIEGO, co przechodzi przez init.
  //
  // Sprawdzamy to PRZED utworzeniem wiersza płatności i przed zdjęciem salda,
  // żeby odmowa nie zostawiała po sobie obciążonego portfela.
  //
  // Wyjątek: gdy saldo pokrywa całość (amount_to_charge === 0), operator nie jest
  // do niczego potrzebny — ta ścieżka zostaje i jest obsłużona niżej.
  if (amount_to_charge > 0 && (!gw || !gw.merchant_id)) {
    console.error("payment-core: init odrzucony — brak konfiguracji bramki płatniczej");
    return json({
      error: "Płatności są chwilowo niedostępne",
      code: "GATEWAY_NOT_CONFIGURED",
    }, 503);
  }

  // Create payment record
  const { data: payment, error: payErr } = await supabase
    .from("payments")
    .insert({
      user_id,
      product_type,
      product_ref_id,
      amount: amount_to_charge,
      description,
      metadata: enrichedMeta,
      status: "pending",
      gateway: gw?.provider || "przelewy24",
    })
    .select("id")
    .single();

  if (payErr) throw payErr;

  // Deduct wallet now and log transaction
  if (wallet_used > 0) {
    await supabase.rpc("ensure_referral_code", { p_user_id: user_id }).catch(() => {});
    const { data: w2 } = await supabase
      .from("user_wallets").select("pln_balance").eq("user_id", user_id).maybeSingle();
    const newBal = Math.max(0, Number(w2?.pln_balance || 0) - wallet_used);
    await supabase.from("user_wallets")
      .update({ pln_balance: newBal, updated_at: new Date().toISOString() })
      .eq("user_id", user_id);
    await supabase.from("wallet_pln_transactions").insert({
      user_id,
      type: "purchase_discount",
      amount: -wallet_used,
      description: `Płatność saldem — zamówienie ${payment.id.slice(0, 8)}`,
      related_order_id: payment.id,
    });
  }

  // Create marketplace order if applicable
  if (product_type === "marketplace_purchase" && product_ref_id) {
    const sellerId = enrichedMeta?.seller_id;
    if (sellerId) {
      await supabase.from("marketplace_orders").insert({
        payment_id: payment.id,
        buyer_id: user_id,
        seller_id: sellerId,
        listing_id: product_ref_id,
        amount,
        delivery_type: delivery_type || null,
        inpost_point_id: inpost_point_id || null,
        delivery_address: delivery_address || null,
        order_status: "new",
      });
    }
  }

  // Saldo pokryło całość — nie ma czego pobierać u operatora, zamówienie jest
  // opłacone. Warunek `!gw || !gw.merchant_id` został stąd usunięty: brak
  // konfiguracji bramki odrzucamy wyżej, zamiast wydawać towar za darmo.
  // Prefiks "SIM-" zostaje dla zgodności z istniejącymi wierszami.
  if (amount_to_charge === 0) {
    await supabase
      .from("payments")
      .update({ status: "paid", gateway_session_id: "SIM-" + payment.id, updated_at: new Date().toISOString() })
      .eq("id", payment.id);

    await processPaymentSuccess(supabase, payment.id, user_id, product_type, product_ref_id, enrichedMeta);
    await tryReferralCompletion(supabase, payment.id, user_id, Number(amount));

    return new Response(JSON.stringify({
      payment_id: payment.id,
      payment_url: null,
      simulated: true,
      status: "paid",
    }), { headers: CORS });
  }

  // continue with P24 using amount_to_charge
  const _amount = amount_to_charge;


  // Real Przelewy24 integration
  const isSandbox = gw.is_sandbox !== false;
  const baseUrl = isSandbox
    ? "https://sandbox.przelewy24.pl"
    : "https://secure.przelewy24.pl";

  // Get user email
  const { data: userData } = await supabase.auth.admin.getUserById(user_id);
  const userEmail = userData?.user?.email || "klient@getrido.pl";

  const merchantId = gw.merchant_id;
  const apiKey = gw.api_key_secret_name || "";
  const posId = gw.pos_id || merchantId;

  const registerBody = {
    merchantId: parseInt(merchantId),
    posId: parseInt(posId),
    sessionId: payment.id,
    amount: Math.round(_amount * 100),
    currency: "PLN",
    description: description || "Płatność GetRido",
    email: userEmail,
    country: "PL",
    language: "pl",
    urlReturn: `${return_url}?payment_id=${payment.id}`,
    urlStatus: `${Deno.env.get("SUPABASE_URL")}/functions/v1/payment-core-webhook`,
    encoding: "UTF-8",
  };

  const authHeader = "Basic " + btoa(`${merchantId}:${apiKey}`);

  const p24Resp = await fetch(`${baseUrl}/api/v1/transaction/register`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: authHeader,
    },
    body: JSON.stringify(registerBody),
  });

  const p24Data = await p24Resp.json();

  if (p24Data.data?.token) {
    const paymentUrl = `${baseUrl}/trnRequest/${p24Data.data.token}`;
    await supabase
      .from("payments")
      .update({ gateway_session_id: p24Data.data.token, updated_at: new Date().toISOString() })
      .eq("id", payment.id);

    return new Response(JSON.stringify({
      payment_id: payment.id,
      payment_url: paymentUrl,
      simulated: false,
    }), { headers: CORS });
  }

  // P24 registration failed
  await supabase
    .from("payments")
    .update({ status: "failed", metadata: { ...metadata, p24_error: p24Data }, updated_at: new Date().toISOString() })
    .eq("id", payment.id);

  return new Response(JSON.stringify({
    error: "Nie udało się zainicjować płatności",
    details: p24Data,
  }), { status: 400, headers: CORS });
}

async function handleWebhook(supabase: any, body: any) {
  const { sessionId, orderId } = body;

  // Find payment
  const { data: payment } = await supabase
    .from("payments")
    .select("*")
    .eq("id", sessionId)
    .maybeSingle();

  if (!payment) {
    return new Response(JSON.stringify({ error: "Payment not found" }), { status: 404, headers: CORS });
  }

  // Podpis operatora (SHA-384 z kluczem CRC) jest sprawdzany w payment-core-webhook,
  // zanim żądanie tu trafi. Ta ścieżka jest osiągalna wyłącznie kanałem wewnętrznym
  // — dispatcher wyżej odrzuca `confirm_webhook` od każdego innego wywołującego.

  // Mark as paid
  await supabase
    .from("payments")
    .update({
      status: "paid",
      gateway_transaction_id: String(orderId || ""),
      updated_at: new Date().toISOString(),
    })
    .eq("id", payment.id);

  await processPaymentSuccess(supabase, payment.id, payment.user_id, payment.product_type, payment.product_ref_id, payment.metadata);

  const grossAmt = Number(payment.metadata?.gross_amount || payment.amount || 0);
  await tryReferralCompletion(supabase, payment.id, payment.user_id, grossAmt);

  return new Response(JSON.stringify({ status: "ok" }), { headers: CORS });
}

async function tryReferralCompletion(supabase: any, paymentId: string, userId: string, grossAmount: number) {
  try {
    if (!(grossAmount >= 30)) return;

    // Verify this is the user's FIRST paid purchase
    const { count } = await supabase
      .from("payments")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("status", "paid")
      .neq("id", paymentId);
    if ((count ?? 0) > 0) return;

    const { data: refResult, error: refErr } = await supabase.rpc("complete_referral_on_first_purchase", {
      p_referred_user_id: userId,
      p_order_amount_pln: grossAmount,
      p_order_id: paymentId,
    });
    if (refErr) {
      console.error("Referral completion error:", refErr);
      return;
    }
    if (refResult?.completed) {
      console.log("Referral completed:", refResult);
      try {
        await supabase.functions.invoke("rido-mail", {
          body: {
            to_user_id: refResult.referrer_user_id,
            subject: "🎁 Otrzymałeś nagrodę za polecenie — GetRido",
            template: "referral_reward",
            data: { reward_amount: refResult.amount_pln, reward_type: refResult.reward_type },
          },
        });
      } catch (e) { console.error("Referral email failed:", e); }
    }
  } catch (e) {
    console.error("Referral hook failed:", e);
  }
}


async function processPaymentSuccess(
  supabase: any, paymentId: string, userId: string,
  productType: string, productRefId: string | null, metadata: any
) {
  switch (productType) {
    case "marketplace_purchase":
      await supabase
        .from("marketplace_orders")
        .update({ order_status: "paid", updated_at: new Date().toISOString() })
        .eq("payment_id", paymentId);
      if (productRefId) {
        await supabase
          .from("general_listings")
          .update({ status: "sold" })
          .eq("id", productRefId);
        // Create pending review
        const sellerId = metadata?.seller_id;
        if (sellerId) {
          await supabase.from("pending_reviews").insert({
            buyer_id: userId,
            seller_id: sellerId,
            listing_id: productRefId,
          }).onConflict("id").doNothing;
        }
      }
      break;

    case "ai_photo_package": {
      const creditsAmount = metadata?.photos_count || 5;
      await upsertCredits(supabase, userId, "ai_photo", creditsAmount);
      break;
    }

    case "sms_credits": {
      // Nowych płatności tego typu już nie ma — `handleInit` ich nie wpuszcza.
      // Ta gałąź obsługuje wyłącznie to, co mogło być w locie w chwili wdrożenia:
      // pieniądze POBRANE, więc odmowa nic by tu nie dała. Wydajemy poprawnie,
      // do paczek billingowych, zamiast do `user_credits`, których wysyłka
      // nie czyta.
      const smsAmount = metadata?.credits_amount || 50;

      const { data: warsztat } = await supabase
        .from("service_providers")
        .select("id")
        .eq("user_id", userId)
        // Konto może mieć więcej niż jeden warsztat — bez limitu `maybeSingle`
        // zwróciłby błąd i wydanie po cichu by przepadło.
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (!warsztat) {
        // Bez warsztatu nie ma gdzie zapisać SMS-ów tak, żeby dało się je wysłać.
        // Zapis do `user_credits` wyglądałby na dostawę, a nią nie jest —
        // zostawiamy głośny ślad do ręcznego rozliczenia.
        console.error("payment-core: OPŁACONE SMS-y bez warsztatu — do rozliczenia ręcznego", {
          payment_id: paymentId, user_id: userId, sms: smsAmount,
        });
        break;
      }

      const { error: bladWydania } = await supabase.rpc("grant_sms_credits", {
        p_provider_id: warsztat.id,
        p_ile: smsAmount,
        p_powod: "zakup",
        p_actor: null,
        p_opis: `Zakup przez payment-core, płatność ${paymentId}`,
      });
      if (bladWydania) {
        console.error("payment-core: grant_sms_credits po opłaconym zamówieniu", bladWydania);
      }
      break;
    }

    case "ai_credits": {
      const aiAmount = metadata?.credits_amount || 10;
      await upsertCredits(supabase, userId, "ai", aiAmount);
      break;
    }

    case "listing_featured":
      if (productRefId) {
        const featuredUntil = new Date();
        featuredUntil.setDate(featuredUntil.getDate() + 7);
        await supabase
          .from("general_listings")
          .update({ featured: true, featured_until: featuredUntil.toISOString() })
          .eq("id", productRefId);
      }
      break;
  }

  // Send confirmation email
  try {
    await supabase.functions.invoke("rido-mail", {
      body: {
        to_user_id: userId,
        subject: "Potwierdzenie płatności — GetRido",
        template: "payment_confirmation",
        data: { product_type: productType, amount: metadata?.amount || 0 },
      },
    });
  } catch (e) {
    console.error("Email send failed:", e);
  }
}

/**
 * Dopisanie kredytów po opłaconej płatności.
 *
 * NAPRAWA 15.08. Funkcja czytała i zapisywała kolumny `balance` i `credit_type`,
 * których w `user_credits` NIE MA — tabela ma wyłącznie `credits_balance`.
 * PostgREST zwracał błąd, `fail("odczyt salda")` logował i funkcja kończyła się
 * po cichu: płatność przechodziła, kredyty nie wchodziły. Sprawdzone na
 * produkcji — nikt nigdy nie kupił kredytów, więc nie ma sald do korekty.
 *
 * `creditType` ZOSTAJE w sygnaturze, ale nie trafia do bazy: saldo jest jedno
 * i wspólne dla wszystkich rodzajów. Rozdzielenie typów to decyzja z podetapu
 * 4.4, razem z uzgodnieniem trzech magazynów SMS — do tego czasu nie zgadujemy
 * i nie dokładamy kolumny. Typ jest logowany, żeby po 4.4 dało się odtworzyć,
 * co komu naliczono.
 */
async function upsertCredits(supabase: any, userId: string, creditType: string, amount: number) {
  const fail = (stage: string, error: unknown) =>
    console.error(
      `payment-core: NIE PRZYZNANO kredytów (${stage}) — user=${userId} typ=${creditType} ilosc=${amount}`,
      error,
    );

  const { data: existing, error: readErr } = await supabase
    .from("user_credits")
    .select("id, credits_balance")
    .eq("user_id", userId)
    .maybeSingle();

  if (readErr) {
    fail("odczyt salda", readErr);
    return;
  }

  if (existing) {
    const { error } = await supabase
      .from("user_credits")
      .update({
        credits_balance: (existing.credits_balance ?? 0) + amount,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);
    if (error) fail("aktualizacja salda", error);
    else console.log(`payment-core: przyznano ${amount} kredytów (typ ${creditType}) — user=${userId}`);
    return;
  }

  const { error } = await supabase.from("user_credits").insert({
    user_id: userId,
    credits_balance: amount,
  });
  if (error) fail("utworzenie salda", error);
  else console.log(`payment-core: utworzono saldo ${amount} kredytów (typ ${creditType}) — user=${userId}`);
}

/**
 * Sprawdzenie i pobranie kredytów. Te same nieistniejące kolumny co wyżej —
 * akcja kończyła się błędem ZAWSZE, więc żadne zużycie nigdy się nie zapisało.
 *
 * `credit_type` przyjmowany dla zgodności z wołającymi, ale saldo jest jedno.
 * Rozdzielenie typów: podetap 4.4.
 */
async function handleCreditsCheck(supabase: any, body: any) {
  const { user_id, credit_type, amount_needed } = body;
  const potrzeba = Number(amount_needed ?? 0);

  const { data, error } = await supabase
    .from("user_credits")
    .select("id, credits_balance")
    .eq("user_id", user_id)
    .maybeSingle();

  if (error) {
    // Fail-closed: gdy nie umiemy odczytać salda, nie wydajemy produktu.
    console.error(`payment-core: nie odczytano salda — user=${user_id}`, error);
    return new Response(JSON.stringify({ ok: false, balance: 0, error: "Nie udało się odczytać salda" }), {
      status: 503,
      headers: CORS,
    });
  }

  const balance = data?.credits_balance ?? 0;

  if (data && balance >= potrzeba) {
    const { error: updErr } = await supabase
      .from("user_credits")
      .update({ credits_balance: balance - potrzeba, updated_at: new Date().toISOString() })
      .eq("id", data.id);

    if (updErr) {
      // Zdjęcie salda nie może zawieść po cichu — inaczej klient dostaje
      // produkt, za który nie zapłacił.
      console.error(`payment-core: NIE ZDJĘTO kredytów — user=${user_id} ilosc=${potrzeba} typ=${credit_type}`, updErr);
      return new Response(JSON.stringify({ ok: false, balance, error: "Nie udało się pobrać kredytów" }), {
        status: 503,
        headers: CORS,
      });
    }

    return new Response(JSON.stringify({ ok: true, remaining: balance - potrzeba }), { headers: CORS });
  }

  return new Response(JSON.stringify({ ok: false, balance }), { headers: CORS });
}

async function handleAdminGrant(supabase: any, body: any, actorId: string | null = null) {
  const { user_id, credit_type, amount } = body;

  if (credit_type === "vehicle_lookup") {
    // Top up vehicle lookup credits (RegCheck VIN/plate)
    const { data: existing } = await supabase
      .from("vehicle_lookup_credits")
      .select("remaining_credits, total_credits_purchased")
      .eq("user_id", user_id)
      .maybeSingle();
    if (existing) {
      await supabase.from("vehicle_lookup_credits").update({
        remaining_credits: (existing.remaining_credits || 0) + amount,
        total_credits_purchased: (existing.total_credits_purchased || 0) + amount,
        updated_at: new Date().toISOString(),
      }).eq("user_id", user_id);
    } else {
      await supabase.from("vehicle_lookup_credits").insert({
        user_id, remaining_credits: amount, total_credits_purchased: amount,
      });
    }
    await supabase.from("vehicle_lookup_credit_transactions").insert({
      user_id, type: "admin_grant", credits: amount, source: "admin", note: `Admin grant ${amount} credits`,
    });
  } else if (credit_type === "sms") {
    // Saldo SMS żyje na `service_providers.sms_balance`, ale zmieniamy je
    // WYŁĄCZNIE przez `grant_sms_credits` — funkcja zapisuje saldo i wiersz
    // księgi w jednej transakcji. Wcześniej był tu goły UPDATE, przez co
    // nadanie nie zostawiało ŻADNEGO śladu (przy kredytach VIN zostawia)
    // i na pytanie „skąd to saldo" nie dało się odpowiedzieć z bazy.
    const { data: sp } = await supabase
      .from("service_providers")
      .select("id")
      .eq("user_id", user_id)
      // Konto może mieć więcej niż jeden warsztat — bez limitu `maybeSingle`
      // zwróciłby błąd i nadanie po cichu poszłoby do gałęzi zapasowej.
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!sp) {
      // Bez warsztatu nie ma gdzie zapisać SMS-ów. Gałąź zapasowa dopisywała
      // je do `user_credits`, gdzie NIKT ich nie czyta przy wysyłce — kredyty
      // znikały w tabeli, z której nie da się ich wydać.
      console.error("payment-core: nadanie SMS bez warsztatu dla", user_id);
      return new Response(
        JSON.stringify({ error: "Konto nie ma warsztatu — nie ma gdzie zapisać SMS-ów." }),
        { status: 400, headers: CORS },
      );
    }

    const { error: bladNadania } = await supabase.rpc("grant_sms_credits", {
      p_provider_id: sp.id,
      p_ile: amount,
      p_powod: "nadanie_admin",
      p_actor: actorId ?? null,
      p_opis: "Nadanie z panelu administratora",
    });
    if (bladNadania) {
      console.error("payment-core: grant_sms_credits", bladNadania);
      return new Response(JSON.stringify({ error: "Nie udało się nadać SMS-ów" }), { status: 503, headers: CORS });
    }
  } else {
    await upsertCredits(supabase, user_id, credit_type, amount);
  }

  return new Response(JSON.stringify({ ok: true }), { headers: CORS });
}
