import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const body = await req.json();
    const { action } = body;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    if (action === "init") {
      return await handleInit(supabase, body);
    } else if (action === "confirm_webhook") {
      return await handleWebhook(supabase, body);
    } else if (action === "credits_check") {
      return await handleCreditsCheck(supabase, body);
    } else if (action === "admin_grant") {
      return await handleAdminGrant(supabase, body);
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), { status: 400, headers: CORS });
  } catch (e: any) {
    console.error("payment-core error:", e);
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: CORS });
  }
});

async function handleInit(supabase: any, body: any) {
  const {
    user_id, product_type, product_ref_id, amount, description,
    metadata, delivery_type, inpost_point_id, delivery_address, return_url,
    wallet_used: walletUsedRaw,
  } = body;

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

  // If wallet covers full amount, or no gateway configured — simulate paid
  if (amount_to_charge === 0 || !gw || !gw.merchant_id) {
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

  // TODO: Verify CRC signature with SHA384 for production
  // const crc = Deno.env.get("P24_CRC_KEY");
  // Verify: SHA384(sessionId|merchantId|amount|currency|crc)

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
      const smsAmount = metadata?.credits_amount || 50;
      await upsertCredits(supabase, userId, "sms", smsAmount);
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

async function upsertCredits(supabase: any, userId: string, creditType: string, amount: number) {
  const { data: existing } = await supabase
    .from("user_credits")
    .select("id, balance")
    .eq("user_id", userId)
    .eq("credit_type", creditType)
    .maybeSingle();

  if (existing) {
    await supabase
      .from("user_credits")
      .update({ balance: existing.balance + amount, updated_at: new Date().toISOString() })
      .eq("id", existing.id);
  } else {
    await supabase.from("user_credits").insert({
      user_id: userId,
      credit_type: creditType,
      balance: amount,
    });
  }
}

async function handleCreditsCheck(supabase: any, body: any) {
  const { user_id, credit_type, amount_needed } = body;

  const { data } = await supabase
    .from("user_credits")
    .select("id, balance")
    .eq("user_id", user_id)
    .eq("credit_type", credit_type)
    .maybeSingle();

  const balance = data?.balance || 0;

  if (balance >= amount_needed) {
    await supabase
      .from("user_credits")
      .update({ balance: balance - amount_needed, updated_at: new Date().toISOString() })
      .eq("id", data.id);

    return new Response(JSON.stringify({ ok: true, remaining: balance - amount_needed }), { headers: CORS });
  }

  return new Response(JSON.stringify({ ok: false, balance }), { headers: CORS });
}

async function handleAdminGrant(supabase: any, body: any) {
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
    // SMS credits live on service_providers.sms_balance
    const { data: sp } = await supabase
      .from("service_providers")
      .select("id, sms_balance")
      .eq("user_id", user_id)
      .maybeSingle();
    if (sp) {
      await supabase.from("service_providers")
        .update({ sms_balance: (sp.sms_balance || 0) + amount })
        .eq("id", sp.id);
    } else {
      // Fallback to user_credits if no provider record
      await upsertCredits(supabase, user_id, "sms", amount);
    }
  } else {
    await upsertCredits(supabase, user_id, credit_type, amount);
  }

  return new Response(JSON.stringify({ ok: true }), { headers: CORS });
}
