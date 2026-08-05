// Tworzy katalogi FTP importu CRM dla agencji nieruchomości.
//
// Wcześniej robił to front, wołając getrido.pl/crm-import/setup-agency.php
// z sekretem wpisanym wprost w kodzie komponentu — sekret był więc i w publicznym
// repozytorium, i w bundlu wysyłanym do każdej przeglądarki. Teraz sekret zna
// wyłącznie ta funkcja, a wywołanie wymaga zalogowanego właściciela agencji.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const SETUP_ENDPOINT = "https://getrido.pl/crm-import/setup-agency.php";
const UPSTREAM_TIMEOUT_MS = 15_000;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

const isUuid = (v: unknown): v is string =>
  typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const setupSecret = Deno.env.get("CRM_IMPORT_SECRET");
    // Fail-closed: bez skonfigurowanego sekretu nie wołamy endpointu bez niego.
    if (!setupSecret) {
      console.error("agency-crm-setup: CRM_IMPORT_SECRET nie jest ustawiony");
      return json({ error: "Endpoint niedostępny — brak konfiguracji" }, 503);
    }

    const accessToken = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
    if (!accessToken) return json({ error: "Unauthorized" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    });
    const { data: userData } = await userClient.auth.getUser(accessToken);
    const caller = userData?.user;
    if (!caller) return json({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => null) as { agency_id?: unknown } | null;
    const agencyId = body?.agency_id;
    if (!isUuid(agencyId)) return json({ error: "Nieprawidłowy identyfikator agencji" }, 400);

    // Właścicielstwo z bazy, nie z body — samo podanie cudzego agency_id nie wystarcza.
    const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: agency, error: agencyErr } = await admin
      .from("real_estate_agents")
      .select("id")
      .eq("id", agencyId)
      .eq("user_id", caller.id)
      .maybeSingle();

    if (agencyErr) {
      console.error("agency-crm-setup: nie można potwierdzić agencji", agencyErr);
      return json({ error: "Nie można potwierdzić uprawnień" }, 503);
    }
    if (!agency) return json({ error: "Forbidden" }, 403);

    const url = new URL(SETUP_ENDPOINT);
    url.searchParams.set("secret", setupSecret);
    url.searchParams.set("agency_id", agencyId);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
    let upstreamOk = false;
    let upstreamStatus = 0;
    try {
      const res = await fetch(url, { signal: controller.signal });
      upstreamOk = res.ok;
      upstreamStatus = res.status;
    } catch (e) {
      console.error("agency-crm-setup: setup-agency.php nieosiągalny", e);
      return json({ error: "Serwer importu nie odpowiedział" }, 502);
    } finally {
      clearTimeout(timer);
    }

    if (!upstreamOk) {
      // Treści odpowiedzi nie przekazujemy dalej — mogłaby ujawnić ścieżki serwera.
      console.error("agency-crm-setup: setup-agency.php zwrócił", upstreamStatus);
      return json({ error: "Serwer importu odrzucił żądanie" }, 502);
    }

    return json({ success: true });
  } catch (e) {
    console.error("agency-crm-setup error:", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
