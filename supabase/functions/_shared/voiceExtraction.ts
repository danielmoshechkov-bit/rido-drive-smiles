// ============================================================================
// voiceExtraction — wyciągnięcie danych z transkryptu PO rozmowie.
//
// Dlaczego po rozmowie, a nie w trakcie: tura z zapisem trwała 10 752 ms,
// tura bez narzędzi 795 ms. Ekstrakcja nie ma presji czasu, więc może być
// dokładniejsza niż model wypełniający argumenty narzędzia w locie.
//
// Podział na dwie części jest celowy:
//   parseExtraction  — CZYSTA, bez sieci. Testowalna offline na zapisanych
//                      odpowiedziach modelu, także na tych zepsutych.
//   extractFromTranscript — wywołanie modelu, cienka warstwa nad parserem.
//
// ZASADA 12: błąd nie może wyglądać jak brak danych. Gdy model zwróci śmieci,
// parser zwraca `null` dla pól, których nie rozumie, i NIE zgaduje.
// ============================================================================
import type { ExtractedCall } from "./voiceReconcile.ts";

export type TranscriptTurn = { role?: string | null; message?: string | null };

export const EXTRACTION_SYSTEM = `Analizujesz transkrypt rozmowy telefonicznej klienta z recepcją warsztatu samochodowego.
Zwróć WYŁĄCZNIE obiekt JSON, bez komentarza i bez bloku kodu:
{
 "complaint": "z czym dzwoni klient, JEGO SŁOWAMI, zwięźle. Nie parafraza, nie diagnoza, nie kategoria.",
 "date": "RRRR-MM-DD albo null",
 "time": "GG:MM albo null",
 "first_name": "samo imię albo null",
 "last_name": "nazwisko albo null (klient NIE jest o nie pytany)",
 "phone": "cyfry albo null",
 "phone_provided_by_customer": true gdy klient ŚWIADOMIE podał numer inny niż ten, z którego dzwoni,
 "brand": "marka albo null",
 "model": "model albo null",
 "plate": "numer rejestracyjny albo null",
 "wants_cancel": true gdy klient chce ODWOŁAĆ istniejącą wizytę,
 "wants_reschedule": true gdy chce PRZEŁOŻYĆ istniejącą wizytę
}
Zasady:
- Czego nie ma w rozmowie, ustaw na null. NIE ZGADUJ i nie uzupełniaj z wiedzy ogólnej.
- Termin podaj tylko wtedy, gdy klient go POTWIERDZIŁ. Sama propozycja agenta to nie potwierdzenie.
- Jeśli klient poprawiał dane, weź WERSJĘ OSTATNIĄ.
- "complaint" ma być tym, co mechanik ma zobaczyć na zleceniu.`;

const asString = (v: unknown): string | null => {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t || t.toLowerCase() === "null" || t === "-") return null;
  return t;
};

/** RRRR-MM-DD — tylko realny kształt daty; wszystko inne odrzucamy zamiast poprawiać. */
const asDate = (v: unknown): string | null => {
  const s = asString(v);
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split("-").map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 2020 || y > 2100) return null;
  return s;
};

/** GG:MM; "9:00" i "09:00" znaczą to samo, "25:00" to śmieć. */
const asTime = (v: unknown): string | null => {
  const s = asString(v);
  if (!s) return null;
  const m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]), min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${m[2]}`;
};

export type ExtractionResult = ExtractedCall & {
  wants_cancel: boolean;
  wants_reschedule: boolean;
  /** Model zwrócił coś, czego nie dało się sparsować. Rozmowa idzie do kolejki. */
  parse_failed: boolean;
};

const EMPTY: ExtractionResult = {
  complaint: null, date: null, time: null,
  first_name: null, last_name: null, phone: null,
  brand: null, model: null, plate: null,
  phone_provided_by_customer: false,
  wants_cancel: false, wants_reschedule: false,
  parse_failed: true,
};

/**
 * Surowa odpowiedź modelu → dane. CZYSTA funkcja.
 *
 * Model bywa gadatliwy mimo instrukcji, więc wycinamy pierwszy obiekt JSON
 * zamiast zakładać, że cała odpowiedź nim jest.
 */
export const parseExtraction = (raw: string): ExtractionResult => {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return { ...EMPTY };
  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(raw.slice(start, end + 1));
  } catch (_) {
    return { ...EMPTY };
  }
  return {
    complaint: asString(obj.complaint),
    date: asDate(obj.date),
    time: asTime(obj.time),
    first_name: asString(obj.first_name),
    last_name: asString(obj.last_name),
    phone: asString(obj.phone),
    phone_provided_by_customer: obj.phone_provided_by_customer === true,
    brand: asString(obj.brand),
    model: asString(obj.model),
    plate: asString(obj.plate),
    wants_cancel: obj.wants_cancel === true,
    wants_reschedule: obj.wants_reschedule === true,
    parse_failed: false,
  };
};

/** Transkrypt → tekst dla modelu. Tury bez treści (same narzędzia) pomijamy. */
export const transcriptToText = (turns: TranscriptTurn[]): string =>
  turns
    .filter((t) => typeof t.message === "string" && t.message.trim())
    .map((t) => `${t.role === "agent" ? "AGENT" : "KLIENT"}: ${String(t.message).trim()}`)
    .join("\n");

export const extractFromTranscript = async (
  apiKey: string,
  model: string,
  turns: TranscriptTurn[],
): Promise<ExtractionResult> => {
  const text = transcriptToText(turns);
  if (!text) return { ...EMPTY };
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
    body: JSON.stringify({
      model, max_tokens: 800, temperature: 0,
      system: EXTRACTION_SYSTEM,
      messages: [{ role: "user", content: text }],
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    console.error("[voiceExtraction]", JSON.stringify({ event: "model_failed", status: res.status }));
    return { ...EMPTY };
  }
  const body = await res.json().catch(() => ({}));
  const raw = body?.content?.[0]?.text;
  return parseExtraction(typeof raw === "string" ? raw : "");
};
