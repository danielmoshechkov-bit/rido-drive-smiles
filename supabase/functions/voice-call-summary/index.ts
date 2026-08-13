// ============================================================================
// voice-call-summary — KRÓTKIE PODSUMOWANIE ROZMOWY, na żądanie karty zlecenia.
//
// Podsumowanie powstaje normalnie w voice-call-analyze, ale gdy tamta analiza
// zwróci uszkodzony JSON (np. przycięty na limicie tokenów), w bazie zostaje
// sam transkrypt: 38 wypowiedzi do przeczytania zamiast czterech punktów.
// W bazie produkcyjnej dotyczyło to 4 z 8 ostatnich rozmów.
//
// Ta funkcja odtwarza podsumowanie z ZAPISANEGO transkryptu — więc naprawia
// zarówno rozmowy przyszłe, jak i te, które już leżą bez podsumowania.
// Odpowiada wyłącznie na pytanie „co trzeba było zrobić": bez analizy błędów
// agenta i bez destylacji reguł, którymi zajmuje się analyze.
//
// Dostęp: rozmowa czytana na kliencie użytkownika, czyli decyduje RLS.
// ============================================================================
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getPhase1Secret } from "../_shared/voicePhase1SecretReader.ts";
import { corsHeaders } from "../_shared/cors.ts";

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const cleanKey = (k: string) => k.replace(/[^\x20-\x7E]/g, "");

const SYSTEM = `Streszczasz rozmowę telefoniczną klienta z warsztatem samochodowym dla pracownika, który tej rozmowy nie słyszał.
Zwróć 2-5 punktów, każdy od myślnika, każdy w jednej krótkiej linii. Bez wstępu, bez podsumowania na końcu, bez formatowania.
Odpowiadasz WYŁĄCZNIE na pytanie: czego klient potrzebował i co zostało ustalone.
Kolejność treści: czego dotyczy sprawa (usterka/usługa) -> auto -> ustalony termin -> co zostało obiecane lub co trzeba zrobić.
Pisz konkretami z rozmowy (marka, model, tablica, data, godzina). Nie zgaduj i nie dopowiadaj niczego, czego w rozmowie nie ma.
Jeśli czegoś nie ustalono, napisz to wprost, np. "- Termin nieustalony - klient ma oddzwonić".`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceRoleKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Brak autoryzacji" }, 401);

    const body = await req.json().catch(() => ({}));
    const callId = String(body?.call_id || "");
    const force = body?.force === true;
    if (!callId) return json({ error: "Brak call_id" }, 400);

    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: call } = await userClient.from("voice_calls").select("id, summary").eq("id", callId).maybeSingle();
    if (!call) return json({ error: "Nie znaleziono rozmowy" }, 404);
    if (call.summary && !force) return json({ ok: true, summary: call.summary, source: "cache" });

    const { data: tr } = await userClient.from("voice_transcripts")
      .select("id, turns, full_text").eq("call_id", callId).maybeSingle();
    const turns = Array.isArray(tr?.turns) ? tr!.turns : [];
    if (turns.length < 2 && !tr?.full_text) return json({ ok: false, error: "Brak transkryptu do streszczenia" }, 400);

    const tekst = turns.length
      ? turns.map((m: any) => `${m.role === "assistant" ? "AGENT" : "KLIENT"}: ${m.content ?? m.text ?? ""}`).join("\n")
      : String(tr?.full_text || "");

    const apiKey = await getPhase1Secret(admin, "ANTHROPIC_API_KEY");
    if (!apiKey) return json({ ok: false, error: "Brak klucza AI" }, 400);

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": cleanKey(apiKey), "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001", max_tokens: 500, temperature: 0.1,
        system: SYSTEM, messages: [{ role: "user", content: tekst.slice(0, 24_000) }],
      }),
      signal: AbortSignal.timeout(45_000),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      console.error("[voice-call-summary]", JSON.stringify({ event: "ai_failed", status: res.status, body: t.slice(0, 120) }));
      return json({ ok: false, error: `Model nie odpowiedział (kod ${res.status}).` }, 502);
    }
    const summary = String((await res.json())?.content?.[0]?.text || "").trim();
    if (!summary) return json({ ok: false, error: "Model zwrócił pustą odpowiedź." }, 502);

    // Zapis w obu miejscach, w których panel szuka podsumowania.
    await admin.from("voice_calls").update({ summary }).eq("id", callId);
    if (tr?.id) await admin.from("voice_transcripts").update({ summary }).eq("id", tr.id);

    return json({ ok: true, summary, source: "generated" });
  } catch (e) {
    return json({ ok: false, error: (e as Error).message }, 500);
  }
});
