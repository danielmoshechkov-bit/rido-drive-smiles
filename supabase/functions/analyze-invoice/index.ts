import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { fileBase64, mimeType } = await req.json();

    if (!fileBase64 || !mimeType) {
      return new Response(
        JSON.stringify({ success: false, error: 'fileBase64 and mimeType are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
    if (!ANTHROPIC_API_KEY) {
      console.error('ANTHROPIC_API_KEY not configured');
      return new Response(
        JSON.stringify({ success: false, error: 'AI key not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userPrompt = `Przeanalizuj tę fakturę zakupową i zwróć dane w formacie JSON:
{
  "numer_faktury": "string",
  "data_wystawienia": "YYYY-MM-DD",
  "data_sprzedazy": "YYYY-MM-DD",
  "termin_platnosci": "YYYY-MM-DD",
  "sprzedawca": {
    "nazwa": "string",
    "nip": "string (tylko cyfry)",
    "adres": "string",
    "numer_konta": "string (nr rachunku bankowego)",
    "bank": "string"
  },
  "nabywca": {
    "nazwa": "string",
    "nip": "string",
    "adres": "string"
  },
  "pozycje": [
    {
      "nazwa": "string",
      "ilosc": 1,
      "jednostka": "szt.",
      "cena_netto": 0.00,
      "vat_proc": "23",
      "wartosc_netto": 0.00,
      "wartosc_vat": 0.00,
      "wartosc_brutto": 0.00
    }
  ],
  "suma_netto": 0.00,
  "suma_vat": 0.00,
  "suma_brutto": 0.00,
  "waluta": "PLN"
}
Odpowiedz TYLKO czystym JSON. Bez markdown, bez komentarzy, bez backticks.`;

    // Build content array
    const contentParts: any[] = [];
    
    if (mimeType === 'application/pdf') {
      contentParts.push({
        type: 'document',
        source: { type: 'base64', media_type: 'application/pdf', data: fileBase64 },
      });
    } else {
      contentParts.push({
        type: 'image',
        source: { type: 'base64', media_type: mimeType.startsWith('image/') ? mimeType : 'image/jpeg', data: fileBase64 },
      });
    }
    
    contentParts.push({ type: 'text', text: userPrompt });

    console.log('Calling Anthropic API with model claude-sonnet-4-20250514...');

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        system: 'Jesteś ekspertem OCR od polskich faktur. Zwróć TYLKO czysty JSON bez żadnych komentarzy ani backticks.',
        messages: [{ role: 'user', content: contentParts }],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Anthropic API error:', response.status, errorText);
      return new Response(
        JSON.stringify({ success: false, error: 'AI error: ' + response.status }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const result = await response.json();
    const textContent = result.content?.find((c: any) => c.type === 'text')?.text || '';

    console.log('Raw AI response:', textContent.substring(0, 300));

    let parsed;
    try {
      parsed = JSON.parse(textContent);
    } catch {
      const jsonMatch = textContent.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[1].trim());
      } else {
        const braceMatch = textContent.match(/\{[\s\S]*\}/);
        if (braceMatch) {
          parsed = JSON.parse(braceMatch[0]);
        } else {
          throw new Error('Could not parse JSON from AI response');
        }
      }
    }

    return new Response(
      JSON.stringify({ success: true, data: parsed }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('analyze-invoice error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
