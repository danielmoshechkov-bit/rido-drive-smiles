// Parse Purchase Invoice - Claude Sonnet OCR + structured extraction
// Returns structured JSON + confidence score (0-1)
// Used by frontend to upload PDF/image and get parsed invoice data
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { phaseABlockedResponse } from "../_shared/phaseABlock.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SYSTEM_PROMPT = `Jesteś ekspertem OCR od polskich faktur VAT zakupowych.
Twoje zadanie: wyekstrahować WSZYSTKIE dane z faktury i zwrócić STRUKTURALNY JSON.

KRYTYCZNE ZASADY:
1. Zwracasz TYLKO czysty JSON. Bez markdown, bez backticks, bez komentarzy.
2. Daty zawsze w formacie YYYY-MM-DD.
3. NIP - tylko cyfry (10 cyfr), bez myślników i prefiksu PL.
4. Kwoty jako liczby (nie stringi). Separator dziesiętny: kropka.
5. Stawki VAT jako string: "23", "8", "5", "0", "zw" (zwolniona), "np" (nie podlega).
6. confidence: 0.0-1.0 - twoja pewność że dobrze rozpoznałeś WSZYSTKIE dane.
   - 1.0 = czysty PDF, wszystko czytelne
   - 0.7-0.9 = drobne wątpliwości (jakość zdjęcia, jedna pozycja niejasna)
   - <0.7 = poważne problemy (paragon, brak NIP, nieczytelne kwoty, ucięte)
7. Jeśli czegoś NIE WIDZISZ - daj null. Nie zgaduj.
8. Pozycje muszą się sumować do total_net/total_vat/total_gross. Jeśli nie - obniż confidence.`;

const USER_PROMPT = `Przeanalizuj tę fakturę zakupową i zwróć JSON o strukturze:

{
  "document_number": "FV/...",
  "issue_date": "YYYY-MM-DD",
  "sale_date": "YYYY-MM-DD",
  "due_date": "YYYY-MM-DD",
  "supplier": {
    "name": "string",
    "nip": "1234567890",
    "address": "ulica, kod miasto",
    "account": "PL00 0000 0000 ..."
  },
  "buyer": {
    "name": "string",
    "nip": "string"
  },
  "items": [
    {
      "name": "string",
      "sku": "string lub null",
      "quantity": 1.0,
      "unit": "szt./kg/m/usl.",
      "unit_price_net": 0.00,
      "vat_rate": "23",
      "total_net": 0.00,
      "total_vat": 0.00,
      "total_gross": 0.00
    }
  ],
  "vat_breakdown": {
    "23": {"net": 0.00, "vat": 0.00, "gross": 0.00},
    "8":  {"net": 0.00, "vat": 0.00, "gross": 0.00},
    "5":  {"net": 0.00, "vat": 0.00, "gross": 0.00},
    "0":  {"net": 0.00, "vat": 0.00, "gross": 0.00},
    "zw": {"net": 0.00, "vat": 0.00, "gross": 0.00}
  },
  "total_net": 0.00,
  "total_vat": 0.00,
  "total_gross": 0.00,
  "currency": "PLN",
  "payment_method": "przelew/gotówka/karta",
  "is_paid": false,
  "ai_category": "paliwo|części|usługi obce|media|biuro|leasing|inne",
  "confidence": 1.0,
  "notes": "uwagi jeśli coś jest niejasne"
}`;

function extractJson(text: string): any {
  try { return JSON.parse(text); } catch {}
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) {
    try { return JSON.parse(fenced[1].trim()); } catch {}
  }
  const brace = text.match(/\{[\s\S]*\}/);
  if (brace) {
    try { return JSON.parse(brace[0]); } catch {}
  }
  throw new Error('Could not parse JSON from AI response');
}

serve(async (req) => {
  return phaseABlockedResponse(req, "parse-purchase-invoice");

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { fileBase64, mimeType, fileName } = await req.json();

    if (!fileBase64 || !mimeType) {
      return new Response(
        JSON.stringify({ success: false, error: 'fileBase64 and mimeType are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const ANTHROPIC_API_KEY = (Deno.env.get('ANTHROPIC_API_KEY') || '').trim();
    if (!ANTHROPIC_API_KEY) {
      return new Response(
        JSON.stringify({ success: false, error: 'AI key not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const contentParts: any[] = [];
    if (mimeType === 'application/pdf') {
      contentParts.push({
        type: 'document',
        source: { type: 'base64', media_type: 'application/pdf', data: fileBase64 },
      });
    } else {
      const safeMime = mimeType.startsWith('image/') ? mimeType : 'image/jpeg';
      contentParts.push({
        type: 'image',
        source: { type: 'base64', media_type: safeMime, data: fileBase64 },
      });
    }
    contentParts.push({ type: 'text', text: USER_PROMPT });

    console.log(`[parse-purchase-invoice] Processing ${fileName || 'file'} (${mimeType})`);

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 8192,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: contentParts }],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[parse-purchase-invoice] Anthropic error:', response.status, errorText);
      return new Response(
        JSON.stringify({ success: false, error: `AI error ${response.status}: ${errorText.substring(0, 200)}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const result = await response.json();
    const textContent = result.content?.find((c: any) => c.type === 'text')?.text || '';

    const parsed = extractJson(textContent);

    // Sanity check: jeśli sumy pozycji nie zgadzają się z deklarowanymi - obniż confidence
    if (parsed.items && parsed.total_net) {
      const sumNet = parsed.items.reduce((s: number, it: any) => s + (Number(it.total_net) || 0), 0);
      const diff = Math.abs(sumNet - Number(parsed.total_net));
      if (diff > 0.5) {
        parsed.confidence = Math.min(parsed.confidence ?? 1.0, 0.6);
        parsed.notes = (parsed.notes || '') + ` [Auto: Suma pozycji ${sumNet.toFixed(2)} != deklarowana ${parsed.total_net}]`;
      }
    }

    // Brakuje krytycznych danych = needs_review
    const missingCritical = !parsed.document_number || !parsed.supplier?.nip || !parsed.total_gross;
    if (missingCritical) {
      parsed.confidence = Math.min(parsed.confidence ?? 1.0, 0.5);
    }

    return new Response(
      JSON.stringify({ success: true, data: parsed }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[parse-purchase-invoice] error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
