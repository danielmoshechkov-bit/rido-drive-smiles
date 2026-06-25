import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.56.0";
import { corsHeaders } from "../_shared/cors.ts";
import { getSecret } from "../_shared/aiSecrets.ts";

// ============================================================================
// deepgram-transcribe — transkrypcja nagrania spotkania.
// Wejście: { meeting_id, audio_path } — ścieżka pliku w prywatnym buckecie
//          meeting-audio (NIE blob w body — spotkanie może być długie).
// Działanie: signed URL (service role) -> pre-recorded transcription (PL,
//            diaryzacja) -> transkrypt z etykietami mówców -> zapis do
//            meetings.transcript. Klucz silnika czytany z sekretu, nigdy do frontu.
// Branding: komunikaty błędów mówią "Asystent GetRido" — bez nazw dostawców.
// ============================================================================

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey);

  // Zapamiętane na wypadek błędu — żeby ŻADEN błąd nie zostawił rekordu w 'processing'.
  let mid: string | null = null;

  try {
    // Auth — tylko zalogowany użytkownik
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Brak autoryzacji");
    const token = authHeader.replace("Bearer ", "");
    const { data: { user } } = await admin.auth.getUser(token);
    if (!user) throw new Error("Nieautoryzowany");

    const { meeting_id, audio_path } = await req.json();
    mid = meeting_id || null;
    if (!audio_path) throw new Error("Brak ścieżki nagrania");

    // Klucz silnika transkrypcji — serwer-side, nigdy do frontu
    const dgKey = await getSecret(admin, "DEEPGRAM_API_KEY");
    if (!dgKey) throw new Error("Asystent GetRido: transkrypcja chwilowo niedostępna (brak konfiguracji)");

    // Prywatny bucket → krótkotrwały signed URL, z którego silnik pobierze audio
    const { data: signed, error: signErr } = await admin.storage
      .from("meeting-audio")
      .createSignedUrl(audio_path, 600); // 10 min
    if (signErr || !signed?.signedUrl) {
      console.error("[deepgram-transcribe] signed url error", signErr?.message);
      throw new Error("Asystent GetRido: nie udało się przygotować nagrania");
    }

    // Pre-recorded transcription: nova-2, PL, diaryzacja, interpunkcja, smart format
    const params = new URLSearchParams({
      model: "nova-2",
      language: "pl",
      diarize: "true",
      punctuate: "true",
      smart_format: "true",
    });
    const dgRes = await fetch(`https://api.deepgram.com/v1/listen?${params.toString()}`, {
      method: "POST",
      headers: { Authorization: `Token ${dgKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ url: signed.signedUrl }),
    });

    if (!dgRes.ok) {
      const t = await dgRes.text().catch(() => "");
      console.error("[deepgram-transcribe] engine error", dgRes.status, t.slice(0, 200));
      // Nagranie odrzucone (np. uszkodzony/niewspierany kontener) → błąd nagrania.
      if (meeting_id) {
        await admin.from("meetings")
          .update({ status: "failed", next_meeting_suggestion: { error: "recording" } })
          .eq("id", meeting_id);
      }
      throw new Error("Asystent GetRido: nie udało się przetworzyć nagrania");
    }

    const dg = await dgRes.json();
    const alt = dg?.results?.channels?.[0]?.alternatives?.[0];
    const plainTranscript: string = alt?.transcript || "";

    // Diaryzacja → tekst z etykietami mówców (wariant A: inline w transcript TEXT)
    const words: any[] = alt?.words || [];
    const utterances = buildUtterances(words);
    const formatted = utterances.length
      ? utterances.map((u) => `Mówca ${u.speaker + 1}: ${u.text}`).join("\n\n")
      : plainTranscript;

    // Pusty transkrypt mimo poprawnego audio = nie wykryto mowy (cisza/za cicho).
    // Nie zostawiamy w 'processing' — ustawiamy 'failed' z powodem 'no_speech'.
    if (!formatted.trim()) {
      if (meeting_id) {
        await admin.from("meetings")
          .update({ status: "failed", transcript: "", next_meeting_suggestion: { error: "no_speech" } })
          .eq("id", meeting_id);
      }
      return new Response(JSON.stringify({
        error: "Nie wykryto mowy w nagraniu",
        reason: "no_speech",
        meeting_id: meeting_id || null,
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Zapis do istniejącej tabeli meetings. Status zostaje 'processing' —
    // 'completed' ustawi dopiero krok streszczenia (meeting-ai).
    if (meeting_id) {
      await admin.from("meetings").update({
        transcript: formatted,
        status: "processing",
      }).eq("id", meeting_id);
    }

    return new Response(JSON.stringify({
      success: true,
      meeting_id: meeting_id || null,
      transcript: formatted,
      utterances,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("[deepgram-transcribe]", e);
    // Każdy nieobsłużony błąd (signed URL, sekret, sieć, parsowanie) → 'failed',
    // żeby rozmowa nie wisiała wiecznie w 'processing'.
    if (mid) {
      await admin.from("meetings")
        .update({ status: "failed", next_meeting_suggestion: { error: "recording" } })
        .eq("id", mid)
        .then(() => {}, () => {});
    }
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Błąd transkrypcji" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

/**
 * Scala słowa z diaryzacji w wypowiedzi wg mówcy (kolejne słowa tego samego
 * mówcy łączone w jeden akapit). Działa na alternatives[0].words (każde słowo
 * ma pole `speaker` przy diarize=true).
 */
function buildUtterances(
  words: any[],
): { speaker: number; text: string; start: number; end: number }[] {
  const out: { speaker: number; text: string; start: number; end: number }[] = [];
  for (const w of words) {
    const spk = typeof w.speaker === "number" ? w.speaker : 0;
    const tok = w.punctuated_word || w.word || "";
    if (!tok) continue;
    const last = out[out.length - 1];
    if (last && last.speaker === spk) {
      last.text += " " + tok;
      last.end = w.end ?? last.end;
    } else {
      out.push({ speaker: spk, text: tok, start: w.start ?? 0, end: w.end ?? 0 });
    }
  }
  return out;
}
