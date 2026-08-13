// ============================================================================
// voice-recordings-cleanup — KASOWANIE STARYCH NAGRAŃ ROZMÓW.
//
// Nagranie jest potrzebne, dopóki sprawa jest otwarta: reklamacja, spór o to,
// co ustalono przez telefon. Potem to już tylko megabajty. Jedna dwuminutowa
// rozmowa waży ok. 2 MB, więc bez sprzątania koszyk rośnie w nieskończoność.
//
// Co znika, decyduje funkcja bazy voice_recordings_expired — cała arytmetyka
// dat siedzi tam, więc da się ją sprawdzić zapytaniem, bez uruchamiania
// kasowania. Domyślnie: 90 dni po zakończeniu zlecenia, a rozmowy bez zlecenia
// twardo po 180 dniach. Warsztat może to zmienić w voice_recording_retention.
//
// ZNIKA WYŁĄCZNIE PLIK AUDIO. Transkrypcja i podsumowanie zostają przy zleceniu
// na zawsze — ważą tyle co nic, a to one mówią, co zostało ustalone.
//
// dry_run pokazuje, co BY zniknęło, i nie rusza niczego.
// ============================================================================
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getPhase1Secret } from "../_shared/voicePhase1SecretReader.ts";
import { corsHeaders } from "../_shared/cors.ts";

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const KOSZYK = "voice-recordings";
const PACZKA = 50;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceRoleKey);

    // Ta sama brama co w voice-call-reconcile: token z sejfu albo service-role.
    const expected = await getPhase1Secret(admin, "VOICE_LLM_TOKEN");
    const provided = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
    if (provided !== serviceRoleKey && (!expected || provided !== expected)) return json({ error: "unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const dryRun = body?.dry_run === true;
    const limit = Math.min(Number(body?.limit) || 500, 2000);

    const { data: doUsuniecia, error } = await admin.rpc("voice_recordings_expired", { p_limit: limit });
    if (error) return json({ error: error.message }, 500);
    const lista = (doUsuniecia || []) as Array<{ call_id: string; provider_id: string; recording_path: string; powod: string }>;

    if (dryRun) {
      const { data: ileSierot } = await admin.rpc("voice_calls_orphans_count");
      return json({
        dry_run: true, nagrania_do_usuniecia: lista.length,
        przyklady: lista.slice(0, 10).map((r) => ({ rozmowa: r.call_id.slice(0, 8), powod: r.powod })),
        rozmowy_po_usunietych_zleceniach: ileSierot ?? null,
      });
    }

    let usuniete = 0;
    let bledy = 0;
    for (let i = 0; i < lista.length && lista.length > 0; i += PACZKA) {
      const paczka = lista.slice(i, i + PACZKA);
      const { error: delErr } = await admin.storage.from(KOSZYK).remove(paczka.map((r) => r.recording_path));
      if (delErr) {
        // Nie oznaczamy jako usunięte czegoś, co nadal leży w koszyku — inaczej
        // plik zostałby na dysku na zawsze, bo nikt by go już nie wytypował.
        bledy += paczka.length;
        console.error("[voice-recordings-cleanup]", JSON.stringify({ event: "storage_remove_failed", ile: paczka.length, error: delErr.message }));
        continue;
      }
      const { error: updErr } = await admin.from("voice_calls").update({
        recording_path: null, recording_status: "deleted", recording_deleted_at: new Date().toISOString(),
      }).in("id", paczka.map((r) => r.call_id));
      if (updErr) {
        bledy += paczka.length;
        console.error("[voice-recordings-cleanup]", JSON.stringify({ event: "mark_failed", error: updErr.message }));
        continue;
      }
      usuniete += paczka.length;
    }

    // DRUGI KROK: rozmowy po usuniętych zleceniach. Dopiero teraz, gdy plik audio
    // jest już z koszyka usunięty — inaczej zostałby tam na zawsze, bo bez wiersza
    // nikt by nie wiedział, że tam leży.
    const { data: skasowaneRozmowy, error: purgeErr } = await admin.rpc("voice_calls_purge_orphans", { p_limit: 500 });
    if (purgeErr) console.error("[voice-recordings-cleanup]", JSON.stringify({ event: "purge_failed", error: purgeErr.message }));

    console.info("[voice-recordings-cleanup]", JSON.stringify({
      event: "sprzatanie", usuniete, bledy, rozmowy_skasowane: skasowaneRozmowy ?? 0,
    }));
    return json({
      usuniete, blad_kasowania: bledy,
      rozmowy_po_usunietych_zleceniach: skasowaneRozmowy ?? 0,
      blad_kasowania_rozmow: purgeErr?.message || null,
    });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
