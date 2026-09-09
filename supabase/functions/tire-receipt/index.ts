import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

/**
 * Publiczne potwierdzenie przyjecia opon. Klient dostaje link SMS-em i
 * otwiera go bez logowania.
 *
 * Czytamy WYLACZNIE po kodzie z linku i zwracamy jeden rekord. Tabela jest
 * odcieta od klienta przegladarki (REVOKE), wiec nie da sie pobrac calej
 * listy potwierdzen ani przegladac cudzych.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const url = new URL(req.url);
    let kod = url.searchParams.get("kod") ?? "";
    if (!kod && req.method === "POST") {
      try {
        const body = await req.json();
        kod = typeof body?.kod === "string" ? body.kod : "";
      } catch { /* puste cialo */ }
    }

    kod = kod.trim().toUpperCase();

    // Kod ma staly ksztalt. Odrzucamy wszystko inne od razu, zeby zapytania
    // z przypadkowym tekstem nie schodzily do bazy.
    if (!/^[2-9A-HJ-NP-Z]{10}$/.test(kod)) {
      return json({ error: "NIEPRAWIDLOWY_KOD" }, 400);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const { data, error } = await admin
      .from("workshop_tire_receipts")
      .select("kod, dane, utworzono, odebrano_at, usunieto_at")
      .eq("kod", kod)
      .maybeSingle();

    if (error) throw error;
    if (!data) return json({ error: "NIE_ZNALEZIONO" }, 404);

    // Status liczymy tutaj, nie w przegladarce: klient ma zobaczyc to samo
    // niezaleznie od tego, kiedy otworzyl link i co ma w pamieci podrecznej.
    const termin = (data.dane as Record<string, unknown>)?.termin as string | null;
    const poTerminie = !!termin && new Date(termin) < new Date();

    const status = data.usunieto_at
      ? "usuniete"
      : data.odebrano_at
        ? "odebrane"
        : poTerminie
          ? "po_terminie"
          : "w_przechowaniu";

    return json({
      kod: data.kod,
      dane: data.dane,
      utworzono: data.utworzono,
      odebrano_at: data.odebrano_at,
      usunieto_at: data.usunieto_at,
      status,
    });
  } catch (e) {
    console.error("[tire-receipt]", e);
    return json({ error: "BLAD_SERWERA" }, 500);
  }
});
