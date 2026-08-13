// ============================================================================
// voice-call-audio — NAGRANIE ROZMOWY DO ODSŁUCHANIA PRZY ZLECENIU.
//
// Transkrypt odpowiada na pytanie „co padło", nagranie na „jak to zabrzmiało":
// czy klient się wahał, czy mechanik dobrze zrozumiał usterkę, kto się pomylił
// przy terminie. Przy sporze z klientem to jedyny materiał rozstrzygający.
//
// Nagranie leży u dostawcy telefonii i tylko przez okres jego retencji, więc
// ściągamy je RAZ — przy pierwszym odsłuchaniu — do naszego prywatnego koszyka.
// Potem wystawiamy podpisany link do NASZEGO pliku: bez ruchu do dostawcy
// i bez zależności od tego, jak długo on trzyma dane.
//
// Dostęp: sprawdzany na kliencie użytkownika, więc decydują polityki RLS na
// voice_calls (właściciel warsztatu, jego pracownik, admin). Kto nie widzi
// rozmowy w bazie, nie dostanie linku do nagrania.
// ============================================================================
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getPhase1Secret } from "../_shared/voicePhase1SecretReader.ts";
import { corsHeaders } from "../_shared/cors.ts";

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const cleanKey = (k: string) => k.replace(/[^\x20-\x7E]/g, "");

const KOSZYK = "voice-recordings";
const WAZNOSC_LINKU_S = 3600;
// Gdy dostawca nie ma audio, nie pytamy go ponownie przy każdym otwarciu karty.
const PRZERWA_PO_BRAKU_MS = 6 * 60 * 60 * 1000;

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
    if (!callId) return json({ error: "Brak call_id" }, 400);

    // Czytamy rozmowę OCZAMI UŻYTKOWNIKA — RLS jest tu kontrolą dostępu.
    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: call } = await userClient
      .from("voice_calls")
      .select("id, provider_id, elevenlabs_conversation_id, recording_path, recording_status, recording_checked_at, recording_deleted_at")
      .eq("id", callId)
      .maybeSingle();
    if (!call) return json({ error: "Nie znaleziono rozmowy" }, 404);

    // Ile nagranie u nas żyje — panel ma to napisać wprost przy odtwarzaczu.
    const { data: ust } = await admin.from("voice_recording_retention")
      .select("keep_days_after_order, keep_days_no_order").eq("provider_id", call.provider_id).maybeSingle();
    const retencja = {
      po_zakonczeniu_dni: ust?.keep_days_after_order ?? 90,
      bez_zlecenia_dni: ust?.keep_days_no_order ?? 30,
    };

    // 0) Nagranie skasowane przez sprzątanie NIE wraca. Ponowne ściągnięcie od
    //    dostawcy obchodziłoby zasadę przechowywania, którą warsztat sam ustawił.
    if (call.recording_status === "deleted") {
      return json({
        available: false, retencja,
        reason: `Nagranie zostało usunięte zgodnie z zasadą przechowywania — nagrania znikają razem z usuniętym zleceniem, a przy zakończonym ${retencja.po_zakonczeniu_dni} dni po jego zamknięciu. Transkrypcja i podsumowanie zostają.`,
      });
    }

    // 1) Mamy już plik u siebie — wystarczy podpisany link.
    if (call.recording_path) {
      const { data: signed, error } = await admin.storage.from(KOSZYK)
        .createSignedUrl(call.recording_path, WAZNOSC_LINKU_S);
      if (signed?.signedUrl) return json({ available: true, url: signed.signedUrl, source: "cache", retencja });
      console.error("[voice-call-audio]", JSON.stringify({ event: "signed_url_failed", call: callId.slice(0, 8), error: error?.message }));
    }

    // 2) Świeży wynik negatywny — nie męczymy dostawcy przy każdym wejściu w kartę.
    if (call.recording_status === "unavailable" && call.recording_checked_at
        && Date.now() - new Date(call.recording_checked_at).getTime() < PRZERWA_PO_BRAKU_MS) {
      return json({ available: false, reason: "Dostawca telefonii nie udostępnia nagrania tej rozmowy." });
    }

    const conversationId = call.elevenlabs_conversation_id;
    if (!conversationId) {
      return json({ available: false, reason: "Rozmowa nie ma identyfikatora u dostawcy — nagrania nie ma skąd pobrać." });
    }

    const elKey = await getPhase1Secret(admin, "ELEVENLABS_API_KEY");
    if (!elKey) return json({ available: false, reason: "Brak klucza do telefonii — nagrania nie da się pobrać." }, 200);

    // 3) Pobranie od dostawcy.
    const res = await fetch(`https://api.elevenlabs.io/v1/convai/conversations/${conversationId}/audio`, {
      headers: { "xi-api-key": cleanKey(elKey) },
      signal: AbortSignal.timeout(60_000),
    });

    if (!res.ok) {
      const status = res.status;
      await admin.from("voice_calls").update({
        recording_status: status === 404 ? "unavailable" : "error",
        recording_checked_at: new Date().toISOString(),
      }).eq("id", callId);
      console.error("[voice-call-audio]", JSON.stringify({ event: "provider_audio_failed", status, conversation: conversationId.slice(-8) }));
      return json({
        available: false,
        reason: status === 404
          ? "Dostawca telefonii nie ma nagrania tej rozmowy."
          : `Nie udało się pobrać nagrania od dostawcy (kod ${status}).`,
      });
    }

    const audio = new Uint8Array(await res.arrayBuffer());
    if (audio.byteLength < 1024) {
      await admin.from("voice_calls").update({ recording_status: "unavailable", recording_checked_at: new Date().toISOString() }).eq("id", callId);
      return json({ available: false, reason: "Dostawca zwrócił puste nagranie." });
    }

    // 4) Do naszego koszyka — układ katalogów per warsztat, żeby dało się
    //    czyścić dane jednego warsztatu bez ruszania pozostałych.
    const sciezka = `${call.provider_id}/${callId}.mp3`;
    const { error: upErr } = await admin.storage.from(KOSZYK)
      .upload(sciezka, audio, { contentType: "audio/mpeg", upsert: true });
    if (upErr) {
      console.error("[voice-call-audio]", JSON.stringify({ event: "upload_failed", error: upErr.message }));
      return json({ available: false, reason: "Nagranie pobrane, ale nie udało się go zapisać." }, 500);
    }

    await admin.from("voice_calls").update({
      recording_path: sciezka, recording_status: "available", recording_checked_at: new Date().toISOString(),
    }).eq("id", callId);

    const { data: signed } = await admin.storage.from(KOSZYK).createSignedUrl(sciezka, WAZNOSC_LINKU_S);
    console.info("[voice-call-audio]", JSON.stringify({
      event: "recording_cached", call: callId.slice(0, 8), bytes: audio.byteLength,
    }));
    return json({ available: true, url: signed?.signedUrl || null, source: "provider", bytes: audio.byteLength, retencja });
  } catch (e) {
    return json({ available: false, error: (e as Error).message }, 500);
  }
});
