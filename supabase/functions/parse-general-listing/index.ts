import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    const { prompt, follow_up, previous_data } = await req.json();

    if (!prompt) {
      return new Response(
        JSON.stringify({ error: "Brak opisu ogłoszenia" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const systemPrompt = `Jesteś ekspertem AI platformy GetRido. Twoim zadaniem jest parsowanie naturalnego opisu ogłoszenia sprzedaży i generowanie struktury ogłoszenia.

Odpowiadaj TYLKO poprawnym JSON-em, bez markdown, bez komentarzy.

Format odpowiedzi:
{
  "title": "Tytuł SEO (max 80 znaków, z kluczowymi słowami)",
  "description": "Opis marketingowy (2-4 akapity, profesjonalny, z emoji)",
  "category_name": "Nazwa kategorii (np. Elektronika, Moda i odzież, Dom i ogród, Sport i hobby, Motoryzacja (akcesoria), Dziecko i mama, Zwierzęta, Książki i edukacja, Usługi, Inne)",
  "condition": "nowy|jak_nowy|dobry|dostateczny|do_naprawy",
  "price_suggestion": 0,
  "price_min": 0,
  "price_max": 0,
  "location": "Miasto",
  "missing_fields": ["pytanie 1", "pytanie 2"],
  "ai_score": 7.5,
  "ai_tips": ["tip 1", "tip 2"]
}

Zasady:
- Jeśli użytkownik nie podał stanu, ceny lub lokalizacji — dodaj do missing_fields pytanie
- ai_score od 1 do 10 (jakość ogłoszenia)
- ai_tips — max 4 wskazówki jak ulepszyć ogłoszenie
- price_min/price_max — oszacuj rynkowo na podstawie opisu
- Jeśli kategoria nie pasuje do żadnej z podanych — wymyśl nową
- Odpowiadaj PO POLSKU`;

    let userPrompt = prompt;
    if (follow_up && previous_data) {
      userPrompt = `Poprzednie dane ogłoszenia: ${JSON.stringify(previous_data)}
      
Użytkownik uzupełnił brakujące informacje: ${follow_up}

Zaktualizuj dane ogłoszenia uwzględniając nowe informacje. Zwróć pełny zaktualizowany JSON.`;
    }

    let responseText = "";

    // Try Anthropic first, fallback to Lovable AI Gateway
    if (ANTHROPIC_API_KEY) {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 2000,
          system: systemPrompt,
          messages: [{ role: "user", content: userPrompt }],
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        console.error("Anthropic error:", res.status, errText);
        throw new Error(`Anthropic error: ${res.status}`);
      }

      const data = await res.json();
      responseText = data.content?.[0]?.text || "";
    } else if (LOVABLE_API_KEY) {
      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
        }),
      });

      if (!res.ok) {
        if (res.status === 429) {
          return new Response(JSON.stringify({ error: "Zbyt wiele zapytań, spróbuj ponownie za chwilę" }),
            { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        if (res.status === 402) {
          return new Response(JSON.stringify({ error: "Brak kredytów AI, doładuj konto" }),
            { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        throw new Error(`AI Gateway error: ${res.status}`);
      }

      const data = await res.json();
      responseText = data.choices?.[0]?.message?.content || "";
    } else {
      return new Response(
        JSON.stringify({ error: "Brak skonfigurowanego klucza AI" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse JSON from response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error("Could not parse AI response:", responseText);
      return new Response(
        JSON.stringify({ error: "Nie udało się przetworzyć odpowiedzi AI", raw: responseText }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const parsed = JSON.parse(jsonMatch[0]);

    return new Response(
      JSON.stringify({ data: parsed }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("parse-general-listing error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Nieznany błąd" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
