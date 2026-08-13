// Zarządzanie katalogiem funkcji billingowych (billing_features).
//
// Tabele billing_* mają odebrane granty INSERT/UPDATE/DELETE dla `authenticated`
// i wyłącznie polityki SELECT — każdy zapis musi przejść tędy. Ta funkcja jest
// jedyną drogą zapisu do katalogu funkcji.
//
// Bramka: ważny JWT → tożsamość z auth.getUser → rola `platform_admin` czytana
// z tabeli user_roles. Nigdy z tokenu ani z body.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders } from "../_shared/cors.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

/** Klucz funkcji trafia do kodu aplikacji (has_feature('...')), więc trzymamy go w ryzach. */
const KEY_RE = /^[a-z][a-z0-9_]{2,48}$/;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const accessToken = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
    if (!accessToken) return json({ error: "Unauthorized" }, 401);

    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    });
    const { data: userData } = await userClient.auth.getUser(accessToken);
    const caller = userData?.user;
    if (!caller) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(supabaseUrl, serviceKey);

    const { data: roleRow, error: roleErr } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id)
      .eq("role", "platform_admin")
      .maybeSingle();

    if (roleErr) {
      console.error("billing-admin-features: nie można potwierdzić roli", roleErr);
      return json({ error: "Nie można potwierdzić uprawnień" }, 503);
    }
    if (!roleRow) return json({ error: "Forbidden" }, 403);

    const body = await req.json().catch(() => null) as Record<string, any> | null;
    const action = body?.action;

    // ---------------------------------------------------------------- list
    if (action === "list") {
      const { data, error } = await admin
        .from("billing_features")
        .select("*")
        .order("sort_order");
      if (error) throw error;
      return json({ features: data ?? [] });
    }

    // -------------------------------------------------------------- create
    if (action === "create") {
      const key = String(body?.key ?? "").trim();
      const name = String(body?.name ?? "").trim();
      const kind = body?.kind === "metered" ? "metered" : "boolean";
      const unit = body?.unit ? String(body.unit).trim() : null;

      if (!KEY_RE.test(key)) {
        return json({ error: "Klucz: małe litery, cyfry i podkreślenia, 3–49 znaków" }, 400);
      }
      if (!name) return json({ error: "Nazwa jest wymagana" }, 400);
      // Ten sam warunek pilnuje CHECK w bazie; sprawdzamy wcześniej, żeby zwrócić
      // czytelny komunikat zamiast błędu ograniczenia.
      if (kind === "metered" && !unit) {
        return json({ error: "Funkcja z licznikiem wymaga jednostki (np. 'SMS')" }, 400);
      }

      const { data, error } = await admin
        .from("billing_features")
        .insert({
          key,
          name,
          description: body?.description ? String(body.description) : null,
          kind,
          unit,
          sort_order: Number.isInteger(body?.sort_order) ? body.sort_order : 999,
        })
        .select()
        .single();

      if (error) {
        if (error.code === "23505") return json({ error: `Funkcja o kluczu "${key}" już istnieje` }, 409);
        throw error;
      }

      await audit(admin, caller.id, "feature.created", data.id, null, data);
      return json({ feature: data });
    }

    // -------------------------------------------------------------- update
    if (action === "update") {
      const id = body?.id;
      if (!id) return json({ error: "Brak identyfikatora" }, 400);

      const { data: before, error: beforeErr } = await admin
        .from("billing_features").select("*").eq("id", id).maybeSingle();
      if (beforeErr) throw beforeErr;
      if (!before) return json({ error: "Funkcja nie istnieje" }, 404);

      // `key` jest celowo niezmienny: siedzi w kodzie aplikacji jako argument
      // has_feature(). Zmiana rozjechałaby uprawnienia bez śladu.
      const patch: Record<string, unknown> = {};
      if (body?.name !== undefined) patch.name = String(body.name).trim();
      if (body?.description !== undefined) patch.description = body.description ? String(body.description) : null;
      if (body?.kind !== undefined) patch.kind = body.kind === "metered" ? "metered" : "boolean";
      if (body?.unit !== undefined) patch.unit = body.unit ? String(body.unit).trim() : null;
      if (body?.sort_order !== undefined && Number.isInteger(body.sort_order)) patch.sort_order = body.sort_order;

      const nextKind = (patch.kind ?? before.kind) as string;
      const nextUnit = (patch.unit !== undefined ? patch.unit : before.unit) as string | null;
      if (nextKind === "metered" && !nextUnit) {
        return json({ error: "Funkcja z licznikiem wymaga jednostki" }, 400);
      }

      const { data, error } = await admin
        .from("billing_features").update(patch).eq("id", id).select().single();
      if (error) throw error;

      await audit(admin, caller.id, "feature.updated", id, before, data);
      return json({ feature: data });
    }

    // ---------------------------------------------------- deactivate / activate
    // Nigdy DELETE: funkcja może być przypisana do planów, a skasowanie jej
    // wierszem kaskadowym cicho odebrałoby uprawnienia klientom.
    if (action === "set_active") {
      const id = body?.id;
      const isActive = body?.is_active === true;
      if (!id) return json({ error: "Brak identyfikatora" }, 400);

      const { data: before } = await admin
        .from("billing_features").select("*").eq("id", id).maybeSingle();
      if (!before) return json({ error: "Funkcja nie istnieje" }, 404);

      // Ile planów straci tę funkcję — panel pokazuje to w potwierdzeniu
      // („dotyczy N planów"), zgodnie z admin-panel.md §3.
      const { count } = await admin
        .from("billing_plan_features")
        .select("plan_id", { count: "exact", head: true })
        .eq("feature_id", id);

      const { data, error } = await admin
        .from("billing_features").update({ is_active: isActive }).eq("id", id).select().single();
      if (error) throw error;

      await audit(admin, caller.id, isActive ? "feature.activated" : "feature.deactivated", id, before, data);
      return json({ feature: data, affected_plans: count ?? 0 });
    }

    // ------------------------------------------------------------ usage_info
    // Do okna potwierdzenia przed wyłączeniem: w ilu planach funkcja występuje.
    if (action === "usage_info") {
      const id = body?.id;
      if (!id) return json({ error: "Brak identyfikatora" }, 400);
      const { data, error } = await admin
        .from("billing_plan_features")
        .select("plan_id, billing_plans(code, name)")
        .eq("feature_id", id);
      if (error) throw error;
      return json({ plans: (data ?? []).map((r: any) => r.billing_plans).filter(Boolean) });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (e: any) {
    console.error("billing-admin-features error:", e);
    return json({ error: e.message ?? "Unknown error" }, 500);
  }
});

/**
 * Wpis audytowy. Zapisujemy przy każdej zmianie — przy sporze o zakres planu
 * to jedyny ślad, kto i kiedy ruszył katalog funkcji.
 */
async function audit(
  admin: any,
  actorId: string,
  action: string,
  targetId: string,
  before: unknown,
  after: unknown,
) {
  const { error } = await admin.from("billing_audit_log").insert({
    actor_id: actorId,
    action,
    target_table: "billing_features",
    target_id: targetId,
    before,
    after,
  });
  if (error) console.error("billing-admin-features: nie zapisano audytu", action, targetId, error);
}
