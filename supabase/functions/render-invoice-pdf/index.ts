// Serwerowy render HTML faktury -> prawdziwy WEKTOROWY PDF (renderowany w Chrome,
// tryb druku) → identyczny z „Pobierz"/portalem. Używany i przez pobranie, i przez mail,
// żeby wyglądały TAK SAMO. Zastępuje rastrowy html2canvas (fallback po stronie klienta).
//
// Renderer: PDFShift (HTML->PDF API). Wymaga sekretu PDFSHIFT_API_KEY.
// Łatwo podmienić na inny serwis/headless — wystarczy zmienić blok fetch.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const apiKey = Deno.env.get("PDFSHIFT_API_KEY");
    if (!apiKey) return json({ error: "PDFSHIFT_API_KEY nie jest skonfigurowany" }, 500);

    const { html } = await req.json();
    if (!html || typeof html !== "string") return json({ error: "Brak HTML do renderu" }, 400);

    const resp = await fetch("https://api.pdfshift.io/v3/convert/pdf", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Basic " + btoa("api:" + apiKey),
      },
      body: JSON.stringify({
        source: html,
        format: "A4",
        margin: "0",        // marginesy steruje CSS @page faktury (jak druk przeglądarki)
        use_print: true,    // renderuj wg @media print → 1:1 z „Drukuj"/portalem
        sandbox: false,
      }),
    });

    if (!resp.ok) {
      const t = await resp.text();
      console.error("[render-invoice-pdf] PDFShift error", resp.status, t.slice(0, 300));
      return json({ error: `Renderer PDF ${resp.status}` }, 502);
    }

    const buf = new Uint8Array(await resp.arrayBuffer());
    let bin = "";
    const chunk = 0x8000;
    for (let i = 0; i < buf.length; i += chunk) {
      bin += String.fromCharCode.apply(null, Array.from(buf.subarray(i, i + chunk)) as any);
    }
    return json({ pdf_base64: btoa(bin) });
  } catch (e: any) {
    console.error("[render-invoice-pdf]", e);
    return json({ error: e.message || "Błąd renderu PDF" }, 500);
  }
});
