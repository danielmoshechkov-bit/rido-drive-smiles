// ============================================================================
// voice-audio-diagnose — NARZĘDZIE DIAGNOSTYCZNE, NIE CZĘŚĆ ŚCIEŻKI ROZMOWY.
//
// Po co istnieje: od trzech dni spieramy się o to, czy rozmówca słyszy to,
// co model wyprodukował. Dotąd jedynym sędzią było ucho — a trzy moje pomiary
// akustyczne z rzędu okazały się mierzyć co innego, niż zakładałem
// (sybilanty zamiast artefaktów, tempo zamiast usterki).
//
// Ta funkcja stawia trzeciego, niezależnego świadka: bierze NAGRANIE rozmowy
// od dostawcy telefonii i przepuszcza je przez NASZ silnik transkrypcji, ten
// sam, którym transkrybujemy spotkania. Potem porównujemy trzy wersje tego
// samego zdania:
//   (a) co model wyprodukował jako tekst     — original_message
//   (b) co dostawca zapisał w transkrypcie   — message
//   (c) co NASZ silnik odczytał Z DŹWIĘKU    — wynik tej funkcji
//
// Jeśli (c) odbiega od (a) i (b), to nie jest już „Daniel słyszy dziwnie",
// tylko „maszyna czyta z tego dźwięku co innego, niż zostało wygenerowane".
//
// KLUCZE NIE OPUSZCZAJĄ SERWERA. Zarówno klucz dostawcy telefonii, jak i klucz
// silnika transkrypcji czytane są tutaj, po stronie serwera, z magazynu sekretów.
// Wywołujący nie musi ich mieć i nigdy ich nie zobaczy.
//
// Dostęp: ten sam token, którym uwierzytelnia się ścieżka głosowa. Funkcja
// niczego nie zapisuje — wyłącznie czyta nagranie i zwraca tekst.
// ============================================================================
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { getSecret } from "../_shared/aiSecrets.ts";

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const czysty = (k: string) => k.replace(/[^\x20-\x7E]/g, "");

// Porównanie stałoczasowe — token nie ma wyciekać przez czas odpowiedzi.
const rowne = (a: string, b: string) => {
  const A = new TextEncoder().encode(a), B = new TextEncoder().encode(b);
  if (A.length !== B.length) return false;
  let d = 0;
  for (let i = 0; i < A.length; i++) d |= A[i] ^ B[i];
  return d === 0;
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "POST" }, 405);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const podany = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  const oczekiwany = czysty(Deno.env.get("VOICE_LLM_TOKEN") || (await getSecret(admin, "VOICE_LLM_TOKEN")) || "");
  if (!oczekiwany || !rowne(podany, oczekiwany)) return json({ error: "unauthorized" }, 401);

  // `surowy` wyłącza upiększanie transkrypcji. Bez tego silnik zamienia
  // „osiemnastego sierpnia" na „18 sierpnia", a „szesnastej" na „szesnaście:zero"
  // — i porównanie tekstów pokazuje rozjazd tam, gdzie różni się WYŁĄCZNIE zapis.
  // Pierwszy przebieg dał z tego powodu 26 fałszywych rozjazdów na 66 tur.
  const { conversation_id, od_s, do_s, surowy, audio_b64, mime } = await req.json().catch(() => ({}));
  // `audio_b64` pozwala sprawdzić DOWOLNE audio, nie tylko nagranie rozmowy —
  // np. próbki zsyntezowane na dwa różne sposoby, żeby porównać, który psuje.
  // Bez tego nie da się rozstrzygnąć, czy wina jest w strumieniowaniu tekstu
  // do syntezy, bo nagrań takich prób po prostu nie ma u dostawcy.
  if (!conversation_id && !audio_b64) return json({ error: "brak conversation_id albo audio_b64" }, 400);

  const elKey = czysty((await getSecret(admin, "ELEVENLABS_API_KEY")) || "");
  const dgKey = czysty((await getSecret(admin, "DEEPGRAM_API_KEY")) || "");
  // ZASADA 12: brak klucza to BŁĄD, nie pusty wynik. Bez tego funkcja zwróciłaby
  // pustą transkrypcję i wyglądałoby to jak „nagranie nieme".
  if (!elKey && !audio_b64) return json({ error: "brak klucza dostawcy telefonii w magazynie sekretów" }, 503);
  if (!dgKey) return json({ error: "brak klucza silnika transkrypcji w magazynie sekretów" }, 503);

  let audio: Uint8Array;
  if (audio_b64) {
    audio = Uint8Array.from(atob(audio_b64 as string), (c) => c.charCodeAt(0));
  } else {
    const audioRes = await fetch(
      `https://api.elevenlabs.io/v1/convai/conversations/${conversation_id}/audio`,
      { headers: { "xi-api-key": elKey } });
    if (!audioRes.ok) return json({ error: "nagranie niedostępne", status: audioRes.status }, 502);
    audio = new Uint8Array(await audioRes.arrayBuffer());
  }

  // Znaczniki czasu przy KAŻDYM słowie — bez nich nie da się wskazać, które
  // słowo w której sekundzie zostało odczytane inaczej niż wygenerowane.
  const p = new URLSearchParams(surowy
    ? { model: "nova-2", language: "pl", punctuate: "false", smart_format: "false",
        numerals: "false", diarize: "true", utterances: "true" }
    : { model: "nova-2", language: "pl", punctuate: "true", smart_format: "true",
        diarize: "true", utterances: "true" });
  const dgRes = await fetch(`https://api.deepgram.com/v1/listen?${p}`, {
    method: "POST",
    headers: { Authorization: `Token ${dgKey}`, "Content-Type": (mime as string) || "audio/mpeg" },
    body: audio,
  });
  if (!dgRes.ok) {
    return json({ error: "silnik transkrypcji odrzucił nagranie", status: dgRes.status,
                  detal: (await dgRes.text().catch(() => "")).slice(0, 200) }, 502);
  }
  const dg = await dgRes.json();
  const alt = dg?.results?.channels?.[0]?.alternatives?.[0];

  const wypowiedzi = (dg?.results?.utterances || []).map((u: Record<string, unknown>) => ({
    od: u.start, do: u.end, mowca: u.speaker, pewnosc: u.confidence, tekst: u.transcript,
  }));
  const slowa = (alt?.words || [])
    .filter((w: Record<string, number>) =>
      (od_s == null || w.end >= od_s) && (do_s == null || w.start <= do_s))
    .map((w: Record<string, unknown>) => ({ od: w.start, do: w.end, pewnosc: w.confidence,
                                            slowo: w.punctuated_word ?? w.word }));

  return json({
    ok: true,
    conversation_id,
    bajtow_audio: audio.length,
    transkrypt: alt?.transcript || "",
    pewnosc_calosci: alt?.confidence ?? null,
    wypowiedzi,
    slowa,
  });
});
