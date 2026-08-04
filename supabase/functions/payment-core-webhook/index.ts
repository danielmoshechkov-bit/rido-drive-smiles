// Webhook operatora płatności. Wejście publiczne (operator nie ma tokenu Supabase),
// dlatego cała kontrola opiera się na podpisie żądania.
//
// Wcześniej ta funkcja przepuszczała DOWOLNE ciało prosto do payment-core jako
// `confirm_webhook`, a weryfikacja podpisu była komentarzem TODO. Wystarczyło znać
// identyfikator płatności, żeby ustawić ją na "paid" i odebrać produkt za darmo.
//
// Teraz: bez poprawnego podpisu nie ma przekazania dalej, a bez skonfigurowanego
// klucza CRC funkcja jest wyłączona (503), zamiast działać bez kontroli.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Cache-Control": "no-store" } });

async function sha384Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-384", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Podpis powiadomienia Przelewy24: SHA-384 z JSON-a o ŚCIŚLE określonej kolejności
 * kluczy, z kluczem CRC na końcu. Kolejność jest częścią kontraktu operatora,
 * więc budujemy łańcuch ręcznie zamiast polegać na kolejności pól obiektu.
 */
async function p24Sign(b: Record<string, unknown>, crc: string): Promise<string> {
  const num = (v: unknown) => Number(v ?? 0);
  const str = (v: unknown) => String(v ?? "");
  const payload =
    `{"merchantId":${num(b.merchantId)},` +
    `"posId":${num(b.posId)},` +
    `"sessionId":${JSON.stringify(str(b.sessionId))},` +
    `"amount":${num(b.amount)},` +
    `"originAmount":${num(b.originAmount)},` +
    `"currency":${JSON.stringify(str(b.currency))},` +
    `"orderId":${num(b.orderId)},` +
    `"methodId":${num(b.methodId)},` +
    `"statement":${JSON.stringify(str(b.statement))},` +
    `"crc":${JSON.stringify(crc)}}`;
  return await sha384Hex(payload);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const crc = Deno.env.get("P24_CRC_KEY");
    if (!crc) {
      // Fail-closed: brak klucza = brak możliwości weryfikacji = brak wpuszczania.
      console.error("payment-core-webhook: P24_CRC_KEY nie jest ustawiony — webhook wyłączony");
      return json({ error: "Webhook niedostępny — brak konfiguracji podpisu" }, 503);
    }

    // Przelewy24 wysyła form-urlencoded albo JSON.
    let body: Record<string, unknown>;
    const contentType = req.headers.get("content-type") || "";
    if (contentType.includes("application/x-www-form-urlencoded")) {
      body = Object.fromEntries(new URLSearchParams(await req.text()).entries());
    } else {
      body = await req.json();
    }

    const provided = String(body.sign ?? "").toLowerCase();
    if (!provided || !body.sessionId) {
      return json({ error: "Brak podpisu lub sessionId" }, 400);
    }

    const expected = await p24Sign(body, crc);
    if (!timingSafeEqualHex(provided, expected)) {
      console.warn("payment-core-webhook: niepoprawny podpis dla sesji", String(body.sessionId));
      return json({ error: "Nieprawidłowy podpis" }, 403);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Dalej idą wyłącznie pola objęte podpisem — nie przekazujemy całego ciała,
    // żeby nadmiarowe klucze nie wpływały na logikę po drugiej stronie.
    const { data, error } = await supabase.functions.invoke("payment-core", {
      body: {
        action: "confirm_webhook",
        sessionId: String(body.sessionId),
        orderId: body.orderId ?? null,
      },
    });

    if (error) throw error;

    return json(data || { status: "ok" });
  } catch (e: any) {
    console.error("Webhook error:", e);
    return json({ error: e.message }, 500);
  }
});
