import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { prompt, existingContent, corrections } = await req.json();

    const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
    if (!ANTHROPIC_API_KEY) {
      // Fallback to Lovable AI
      const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
      if (!LOVABLE_API_KEY) {
        throw new Error('No AI API key configured');
      }

      const systemPrompt = `Jesteś ekspertem prawnym. Generujesz profesjonalne polskie szablony dokumentów. Używaj pól zmiennych w formacie {{NAZWA_POLA}} wielkimi literami dla wszystkich danych do uzupełnienia (np. {{IMIE_NAZWISKO_KIEROWCY}}, {{PESEL}}, {{ADRES}}, {{NR_REJESTRACYJNY}}, {{DATA_UMOWY}}). Zwróć TYLKO treść dokumentu bez żadnych komentarzy ani markdown.`;

      let userMessage = prompt;
      if (existingContent && corrections) {
        userMessage = `Mam istniejący dokument:\n\n${existingContent}\n\nProszę o następujące poprawki:\n${corrections}`;
      }

      const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${LOVABLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage },
          ],
          max_tokens: 4000,
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error('Lovable AI error:', response.status, errText);
        throw new Error('AI generation failed');
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || '';

      return new Response(JSON.stringify({ content }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Use Anthropic Claude
    const sanitizedKey = ANTHROPIC_API_KEY.replace(/[\u2028\u2029\u00A0]/g, '').trim();

    const systemPrompt = `Jesteś ekspertem prawnym. Generujesz profesjonalne polskie szablony dokumentów. Używaj pól zmiennych w formacie {{NAZWA_POLA}} wielkimi literami dla wszystkich danych do uzupełnienia (np. {{IMIE_NAZWISKO_KIEROWCY}}, {{PESEL}}, {{ADRES}}, {{NR_REJESTRACYJNY}}, {{DATA_UMOWY}}). Zwróć TYLKO treść dokumentu bez żadnych komentarzy ani markdown.`;

    let userMessage = prompt;
    if (existingContent && corrections) {
      userMessage = `Mam istniejący dokument:\n\n${existingContent}\n\nProszę o następujące poprawki:\n${corrections}`;
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': sanitizedKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4000,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Anthropic error:', response.status, errText);
      throw new Error('AI generation failed');
    }

    const data = await response.json();
    const content = data.content?.[0]?.text || '';

    return new Response(JSON.stringify({ content }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
