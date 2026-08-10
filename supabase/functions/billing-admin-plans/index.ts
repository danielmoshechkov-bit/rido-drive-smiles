// Zarządzanie planami i macierzą plan × funkcja.
//
// Tabele billing_* mają odebrane granty zapisu dla `authenticated` — to jedyna
// droga do zmiany cennika. Brama jak w billing-admin-features: JWT →
// auth.getUser → rola platform_admin z user_roles.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders } from "../_shared/cors.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

/** Kod planu trafia do konfiguracji i integracji, więc trzymamy go w ryzach. */
const CODE_RE = /^[a-z][a-z0-9_]{2,48}$/;
const INTERVALS = ["month", "year", "one_time"];
const SUBSCRIBER_TYPES = ["service_provider", "fleet", "entity", "company", "user"];
const PRODUCT_LINES = ["warsztat", "agent", "other"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const accessToken = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
    if (!accessToken) return json({ error: "Unauthorized" }, 401);

    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    });
    const { data: userData } = await userClient.auth.getUser(accessToken);
    const caller = userData?.user;
    if (!caller) return json({ error: "Unauthorized" }, 401);

    const { data: roleRow, error: roleErr } = await admin
      .from("user_roles").select("role")
      .eq("user_id", caller.id).eq("role", "platform_admin").maybeSingle();
    if (roleErr) {
      console.error("billing-admin-plans: nie można potwierdzić roli", roleErr);
      return json({ error: "Nie można potwierdzić uprawnień" }, 503);
    }
    if (!roleRow) return json({ error: "Forbidden" }, 403);

    const body = await req.json().catch(() => null) as Record<string, any> | null;
    const action = body?.action;

    // ---------------------------------------------------------------- list
    if (action === "list") {
      const { data: plans, error } = await admin
        .from("billing_plans").select("*").order("sort_order");
      if (error) throw error;

      const { data: matrix, error: mErr } = await admin
        .from("billing_plan_features")
        .select("plan_id, feature_id, is_enabled, limit_value, soft_limit_value");
      if (mErr) throw mErr;

      return json({ plans: plans ?? [], matrix: matrix ?? [] });
    }

    // -------------------------------------------------------------- create
    if (action === "create") {
      const code = String(body?.code ?? "").trim();
      const name = String(body?.name ?? "").trim();
      if (!CODE_RE.test(code)) {
        return json({ error: "Kod: małe litery, cyfry i podkreślenia, 3–49 znaków" }, 400);
      }
      if (!name) return json({ error: "Nazwa jest wymagana" }, 400);

      const invalid = validatePricing(body);
      if (invalid) return json({ error: invalid }, 400);

      const { data, error } = await admin.from("billing_plans").insert(buildPatch(body, true)).select().single();
      if (error) {
        if (error.code === "23505") return json({ error: `Plan o kodzie "${code}" już istnieje` }, 409);
        throw error;
      }
      await audit(admin, caller.id, "plan.created", data.id, null, data);
      return json({ plan: data });
    }

    // -------------------------------------------------------------- update
    if (action === "update") {
      const id = body?.id;
      if (!id) return json({ error: "Brak identyfikatora" }, 400);

      const { data: before } = await admin.from("billing_plans").select("*").eq("id", id).maybeSingle();
      if (!before) return json({ error: "Plan nie istnieje" }, 404);

      const invalid = validatePricing({ ...before, ...body }, body);
      if (invalid) return json({ error: invalid }, 400);

      // `code` jest niezmienny — jak klucz funkcji, siedzi w konfiguracji
      // i integracjach; podmiana rozjechałaby powiązania bez śladu.
      const patch = buildPatch(body, false);

      // Zmiana ceny nie dotyka istniejących subskrypcji: one trzymają własny
      // price_snapshot. Ale zapisany stripe_price_id przestaje odpowiadać
      // cenie, więc go czyścimy — inaczej kolejna sprzedaż poszłaby po starej
      // cenie u operatora. Panel pokaże, że plan wymaga ponownej synchronizacji.
      const priceChanged =
        patch.price_net !== undefined && Number(patch.price_net) !== Number(before.price_net);
      if (priceChanged && before.stripe_price_id) {
        patch.stripe_price_id = null;
      }

      const { data, error } = await admin
        .from("billing_plans").update(patch).eq("id", id).select().single();
      if (error) throw error;

      await audit(admin, caller.id, priceChanged ? "plan.price_changed" : "plan.updated", id, before, data);
      return json({ plan: data, price_id_cleared: priceChanged && !!before.stripe_price_id });
    }

    // ---------------------------------------------------------- set_active
    if (action === "set_active") {
      const id = body?.id;
      const isActive = body?.is_active === true;
      if (!id) return json({ error: "Brak identyfikatora" }, 400);

      const { data: before } = await admin.from("billing_plans").select("*").eq("id", id).maybeSingle();
      if (!before) return json({ error: "Plan nie istnieje" }, 404);

      // Ile aktywnych subskrypcji straci plan — panel pokazuje to w potwierdzeniu.
      const { count } = await admin
        .from("billing_subscriptions")
        .select("id", { count: "exact", head: true })
        .eq("plan_id", id)
        .in("status", ["trialing", "active", "past_due"]);

      const { data, error } = await admin
        .from("billing_plans").update({ is_active: isActive }).eq("id", id).select().single();
      if (error) throw error;

      await audit(admin, caller.id, isActive ? "plan.activated" : "plan.deactivated", id, before, data);
      return json({ plan: data, active_subscriptions: count ?? 0 });
    }

    // -------------------------------------------------------- set_features
    // Podmiana CAŁEJ macierzy planu, atomowo (RPC billing_set_plan_features).
    if (action === "set_features") {
      const planId = body?.plan_id;
      const rows = Array.isArray(body?.features) ? body.features : null;
      if (!planId || !rows) return json({ error: "Brak planu lub listy funkcji" }, 400);

      const { data: before } = await admin
        .from("billing_plan_features")
        .select("feature_id, is_enabled, limit_value, soft_limit_value").eq("plan_id", planId);

      for (const r of rows) {
        if (!r?.feature_id) return json({ error: "Pozycja bez identyfikatora funkcji" }, 400);
        for (const [field, label] of [["limit_value", "Limit"], ["soft_limit_value", "Próg miękki"]]) {
          const v = r[field];
          if (v === null || v === undefined || v === "") continue;
          const n = Number(v);
          if (!Number.isFinite(n) || n < 0) {
            return json({ error: `${label} musi być liczbą nieujemną albo pusty` }, 400);
          }
        }
        // Próg miękki ostrzega, twardy blokuje. Próg wyższy od limitu nigdy by
        // się nie odpalił — to zawsze pomyłka, nie konfiguracja.
        if (
          r.limit_value !== null && r.limit_value !== undefined && r.limit_value !== "" &&
          r.soft_limit_value !== null && r.soft_limit_value !== undefined && r.soft_limit_value !== "" &&
          Number(r.soft_limit_value) > Number(r.limit_value)
        ) {
          return json({ error: "Próg miękki nie może być wyższy od limitu twardego" }, 400);
        }
      }

      const { data: count, error } = await admin.rpc("billing_set_plan_features", {
        p_plan_id: planId,
        p_rows: rows,
      });
      if (error) throw error;

      const { data: after } = await admin
        .from("billing_plan_features")
        .select("feature_id, is_enabled, limit_value, soft_limit_value").eq("plan_id", planId);

      await audit(admin, caller.id, "plan.features_set", planId, before, after);
      return json({ saved: count ?? 0 });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (e: any) {
    console.error("billing-admin-plans error:", e);
    return json({ error: e.message ?? "Unknown error" }, 500);
  }
});

/** Wspólna walidacja ceny — te same reguły co CHECK-i w bazie, ale z czytelnym komunikatem. */
function validatePricing(p: Record<string, any>, raw: Record<string, any> = p): string | null {
  const isCustom = p?.is_custom === true;
  const price = p?.price_net;

  if (!isCustom && (price === null || price === undefined || price === "")) {
    return "Podaj cenę netto albo zaznacz „cena indywidualna”";
  }
  if (price !== null && price !== undefined && price !== "") {
    const n = Number(price);
    if (!Number.isFinite(n) || n < 0) return "Cena netto musi być liczbą nieujemną";
  }
  // Cena docelowa: kwota po zakończeniu promocji wprowadzającej. Pusta znaczy
  // „cennik nie zmienia się po promocji", nie zero. Sprawdzamy wyłącznie wartość
  // PRZYSŁANĄ — zapisana już raz przeszła walidację, a przy przełączeniu planu
  // na cenę indywidualną i tak zostanie wyczyszczona.
  const target = raw?.price_net_target;
  if (target !== null && target !== undefined && target !== "") {
    const t = Number(target);
    if (!Number.isFinite(t) || t < 0) return "Cena docelowa musi być liczbą nieujemną";
    if (isCustom) return "Plan z ceną indywidualną nie ma ceny docelowej";
  }
  if (p?.vat_rate !== undefined && p.vat_rate !== null) {
    const v = Number(p.vat_rate);
    if (!Number.isFinite(v) || v < 0 || v > 100) return "Stawka VAT musi mieścić się w 0–100";
  }
  if (p?.trial_days !== undefined && p.trial_days !== null) {
    const t = Number(p.trial_days);
    if (!Number.isInteger(t) || t < 0) return "Liczba dni triala musi być całkowita i nieujemna";
  }
  if (p?.billing_interval && !INTERVALS.includes(p.billing_interval)) {
    return "Nieznany interwał rozliczeniowy";
  }
  if (p?.subscriber_type && !SUBSCRIBER_TYPES.includes(p.subscriber_type)) {
    return "Nieznany typ podmiotu";
  }
  if (p?.product_line && !PRODUCT_LINES.includes(p.product_line)) {
    return "Nieznana linia produktowa";
  }
  return null;
}

function buildPatch(body: Record<string, any>, isCreate: boolean): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  if (isCreate) {
    patch.code = String(body.code).trim();
    patch.subscriber_type = body.subscriber_type ?? "service_provider";
    // Linia produktowa jest niezmienna po utworzeniu. Indeks jednej aktywnej
    // subskrypcji liczy się po linii, a subskrypcje trzymają ją zdenormalizowaną
    // — przestawienie planu przeniosłoby ofertę, ale nie klientów, i część
    // podmiotów zostałaby z dwiema subskrypcjami w tej samej linii.
    patch.product_line = body.product_line ?? "other";
  }
  if (body.name !== undefined) patch.name = String(body.name).trim();
  if (body.description !== undefined) patch.description = body.description ? String(body.description) : null;
  if (body.price_net !== undefined) {
    patch.price_net = body.price_net === null || body.price_net === "" ? null : Number(body.price_net);
  }
  if (body.price_net_target !== undefined) {
    patch.price_net_target =
      body.price_net_target === null || body.price_net_target === "" ? null : Number(body.price_net_target);
  }
  if (body.vat_rate !== undefined) patch.vat_rate = Number(body.vat_rate);
  if (body.billing_interval !== undefined) patch.billing_interval = body.billing_interval;
  if (body.trial_days !== undefined) patch.trial_days = Number(body.trial_days);
  if (body.is_custom !== undefined) {
    patch.is_custom = body.is_custom === true;
    if (patch.is_custom) patch.price_net_target = null;
  }
  if (body.sort_order !== undefined && Number.isInteger(body.sort_order)) patch.sort_order = body.sort_order;
  if (isCreate && body.is_active !== undefined) patch.is_active = body.is_active === true;
  return patch;
}

/** Przy sporze o cenę wpis audytowy jest jedynym dowodem, więc zapisujemy zawsze. */
async function audit(
  admin: any, actorId: string, action: string, targetId: string, before: unknown, after: unknown,
) {
  const { error } = await admin.from("billing_audit_log").insert({
    actor_id: actorId,
    action,
    target_table: action.startsWith("plan.features") ? "billing_plan_features" : "billing_plans",
    target_id: targetId,
    before,
    after,
  });
  if (error) console.error("billing-admin-plans: nie zapisano audytu", action, targetId, error);
}
