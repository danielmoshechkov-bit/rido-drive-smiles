// ============================================================================
// telephony-webhook — ZDARZENIA POŁĄCZEŃ PROSTO OD OPERATORA (SuperVoIP).
//
// Po co: dziś widzimy wyłącznie rozmowy, które doszły do ElevenLabs. Połączenie
// nieodebrane, odrzucone albo takie, przy którym padła integracja, nie zostawia
// żadnego śladu — a to są te połączenia, o których warsztat dowiaduje się
// od klienta, nie od nas. Webhook operatora przychodzi przy KAŻDYM.
//
// URL do wpisania w panelu SuperVoIP (Webhook: nazwa, URL, „call"):
//   https://<projekt>.supabase.co/functions/v1/telephony-webhook?t=<TOKEN>
//
// AUTORYZACJA TOKENEM W URL — nie dlatego, że to dobry pomysł, tylko dlatego,
// że panel operatora ma trzy pola: nazwę, URL i dwa checkboxy. Nie ma gdzie
// wpisać nagłówka ani sekretu. Token w query jest jedynym miejscem, jakie
// zostaje. Dlatego:
//   - token siedzi w SUPERVOIP_WEBHOOK_TOKEN i da się go wymienić bez zmiany kodu,
//   - porównanie jest stałoczasowe,
//   - dodatkowo logujemy adres źródłowy, żeby dało się zobaczyć nadużycie.
// Zapisujemy tu wyłącznie metadane połączeń — nie ma tędy drogi do zmiany
// czegokolwiek innego w systemie.
//
// FORMAT ŁADUNKU: dokumentacja SuperVoIP mówi „w Rest API wartości zmiennych
// będą wysyłane w formacie XML", ale nie pokazuje ani jednego przykładu
// żądania. Nie zgadujemy: przyjmujemy JSON, XML, form-urlencoded ORAZ parametry
// z query stringa, scalamy wszystko w jeden zbiór i CAŁOŚĆ zapisujemy w `raw`.
// Gdy operator przyśle coś innego, niż zakładamy, zobaczymy to w `raw`
// zamiast stracić zdarzenie.
// ============================================================================
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const enc = new TextEncoder();
function rownyStalyCzas(a: string, b: string): boolean {
  const ab = enc.encode(a), bb = enc.encode(b);
  if (ab.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i];
  return diff === 0;
}

/** Płaski XML `<klucz>wartość</klucz>` → obiekt. Bez zagnieżdżeń — operator ich nie używa. */
function zXml(tekst: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of tekst.matchAll(/<([A-Za-z_][\w.-]*)>([\s\S]*?)<\/\1>/g)) {
    const v = m[2].replace(/^<!\[CDATA\[([\s\S]*?)\]\]>$/, "$1").trim();
    if (v && !v.includes("<")) out[m[1]] = v;
  }
  return out;
}

/** Wyciąga wartość po kilku możliwych nazwach pola, bez oglądania się na wielkość liter. */
function pole(dane: Record<string, string>, ...nazwy: string[]): string | null {
  const mapa = new Map(Object.entries(dane).map(([k, v]) => [k.toLowerCase(), v]));
  for (const n of nazwy) {
    const v = mapa.get(n.toLowerCase());
    if (v !== undefined && String(v).trim() !== "") return String(v).trim();
  }
  return null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = new URL(req.url);
  const oczekiwany = Deno.env.get("SUPERVOIP_WEBHOOK_TOKEN") || "";
  if (!oczekiwany) {
    // FAIL-CLOSED. Brak sekretu to nie jest powód, żeby wpuścić kogokolwiek.
    console.error("[telephony-webhook] BRAK SUPERVOIP_WEBHOOK_TOKEN — odrzucam");
    return json({ error: "webhook nieskonfigurowany" }, 503);
  }
  const podany = url.searchParams.get("t") || url.searchParams.get("token") || "";
  if (!rownyStalyCzas(podany, oczekiwany)) {
    console.warn("[telephony-webhook] zly token, ip=", req.headers.get("x-forwarded-for") || "?");
    return json({ error: "nieautoryzowane" }, 401);
  }

  // --- ładunek: bierzemy wszystko, co przyszło -------------------------------
  const surowy = req.method === "GET" ? "" : await req.text();
  const ctype = (req.headers.get("content-type") || "").toLowerCase();
  let dane: Record<string, string> = {};
  const zQuery = Object.fromEntries([...url.searchParams.entries()].filter(([k]) => k !== "t" && k !== "token"));

  if (surowy) {
    if (ctype.includes("json") || surowy.trimStart().startsWith("{")) {
      try {
        const o = JSON.parse(surowy);
        for (const [k, v] of Object.entries(o)) dane[k] = typeof v === "object" ? JSON.stringify(v) : String(v);
      } catch (e) {
        console.error("[telephony-webhook] cialo wyglada na JSON, ale sie nie parsuje:", (e as Error).message, surowy.slice(0, 200));
      }
    } else if (ctype.includes("xml") || surowy.trimStart().startsWith("<")) {
      dane = zXml(surowy);
      if (!Object.keys(dane).length) console.error("[telephony-webhook] XML bez rozpoznanych pol:", surowy.slice(0, 300));
    } else {
      for (const [k, v] of new URLSearchParams(surowy).entries()) dane[k] = v;
      if (!Object.keys(dane).length) console.error("[telephony-webhook] nierozpoznany format:", ctype, surowy.slice(0, 300));
    }
  }
  dane = { ...zQuery, ...dane };

  if (!Object.keys(dane).length) {
    console.error("[telephony-webhook] PUSTE zdarzenie —", req.method, ctype, "len=", surowy.length);
    return json({ error: "pusty ladunek" }, 400);
  }

  // --- mapowanie na kolumny (nazwy z dokumentacji SuperVoIP) -----------------
  const createdat = pole(dane, "createdat", "created_at", "timestamp");
  const sekundy = Number(createdat);
  const occurred = Number.isFinite(sekundy) && sekundy > 1_000_000_000
    ? new Date(sekundy * 1000).toISOString()
    : (createdat && !Number.isNaN(Date.parse(createdat)) ? new Date(createdat).toISOString() : new Date().toISOString());
  const bill = pole(dane, "billseconds", "bill_seconds", "duration");

  const wiersz = {
    provider: "supervoip",
    event_status: pole(dane, "status", "event"),
    direction: pole(dane, "direction"),
    caller_number: pole(dane, "numberA", "callerNumber", "caller"),
    called_number: pole(dane, "numberB", "calledNumber", "called"),
    sip_number: pole(dane, "sipnumber", "sip_number", "sip"),
    disposition: pole(dane, "disposition"),
    bill_seconds: bill !== null && Number.isFinite(Number(bill)) ? Math.trunc(Number(bill)) : null,
    call_id: pole(dane, "callid", "call_id"),
    unique_id: pole(dane, "uniqueid", "unique_id"),
    ivr_action: pole(dane, "IVRaction", "ivr_action"),
    occurred_at: occurred,
    raw: dane,
  };

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } },
  );

  // ON CONFLICT DO NOTHING — ponowienie webhooka nie ma tworzyć duplikatu.
  const { error } = await supabase.from("telephony_events").insert(wiersz);
  if (error) {
    // 23505 = zdarzenie już mamy. To nie jest błąd, to działający deduplikat.
    if (error.code === "23505") {
      console.log("[telephony-webhook] duplikat pominiety", wiersz.call_id, wiersz.event_status);
      return json({ ok: true, duplikat: true });
    }
    // Reszta MUSI być widoczna. Cichy catch przy zapisie to klasa błędu,
    // przez którą alert billingowy nie zapisywał się przez tydzień.
    console.error("[telephony-webhook] ZAPIS NIEUDANY:", error.code, error.message, error.details ?? "");
    return json({ error: "zapis nieudany", kod: error.code }, 500);
  }

  console.log("[telephony-webhook]", wiersz.event_status, wiersz.direction,
    "A=", wiersz.caller_number ? "***" + String(wiersz.caller_number).slice(-3) : "?",
    "B=", wiersz.called_number, "callid=", wiersz.call_id, "disp=", wiersz.disposition);
  return json({ ok: true });
});
