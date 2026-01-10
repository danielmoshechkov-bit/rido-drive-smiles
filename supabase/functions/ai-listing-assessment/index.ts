import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    
    if (!LOVABLE_API_KEY) {
      console.log("LOVABLE_API_KEY not configured, returning mock assessment");
      return new Response(
        JSON.stringify({ 
          assessment: null,
          message: "AI assessment not available - API key not configured"
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { listing } = await req.json();

    if (!listing) {
      return new Response(
        JSON.stringify({ error: "Missing listing data" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Generating AI assessment for listing:", listing.title);

    const systemPrompt = `Jesteś Rido AI - asystentem sztucznej inteligencji platformy RIDO specjalizującym się w ocenie nieruchomości.
Twoim zadaniem jest przeanalizowanie oferty nieruchomości i przygotowanie krótkiej, rzeczowej oceny.

Odpowiadaj ZAWSZE w języku polskim.
Bądź obiektywny i konstruktywny.
Skup się na faktach, nie na spekulacjach.`;

    const userPrompt = `Przeanalizuj poniższą ofertę nieruchomości i przygotuj ocenę:

Tytuł: ${listing.title}
Cena: ${listing.price?.toLocaleString('pl-PL')} zł ${listing.priceType === 'rent_monthly' ? '/miesiąc' : ''}
Powierzchnia: ${listing.areaM2 || 'nie podano'} m²
Cena za m²: ${listing.pricePerM2?.toLocaleString('pl-PL') || 'nie obliczono'} zł/m²
Liczba pokoi: ${listing.rooms || 'nie podano'}
Piętro: ${listing.floor !== undefined ? listing.floor : 'nie podano'}
Rok budowy: ${listing.buildYear || 'nie podano'}
Lokalizacja: ${listing.district || ''} ${listing.location || ''}
Typ: ${listing.propertyType || 'nie podano'}

Udogodnienia:
- Balkon: ${listing.hasBalcony ? 'tak' : 'nie/brak informacji'}
- Winda: ${listing.hasElevator ? 'tak' : 'nie/brak informacji'}
- Parking: ${listing.hasParking ? 'tak' : 'nie/brak informacji'}
- Ogród: ${listing.hasGarden ? 'tak' : 'nie/brak informacji'}
${listing.amenities?.length ? `- Inne: ${listing.amenities.join(', ')}` : ''}

Przygotuj ocenę w formacie JSON zgodnie z poniższą strukturą:`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
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
        tools: [
          {
            type: "function",
            function: {
              name: "property_assessment",
              description: "Zwróć ocenę nieruchomości",
              parameters: {
                type: "object",
                properties: {
                  rating: {
                    type: "number",
                    description: "Ocena od 1 do 5 (może zawierać ułamki, np. 3.7)",
                  },
                  pros: {
                    type: "array",
                    items: { type: "string" },
                    description: "Lista 2-4 zalet nieruchomości (krótkie frazy)",
                  },
                  cons: {
                    type: "array",
                    items: { type: "string" },
                    description: "Lista 1-3 wad lub uwag (krótkie frazy)",
                  },
                  summary: {
                    type: "string",
                    description: "Krótkie podsumowanie (1-2 zdania) dla kogo ta nieruchomość jest idealna",
                  },
                },
                required: ["rating", "pros", "cons", "summary"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "property_assessment" } },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI Gateway error:", response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded, please try again later" }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Payment required, please add credits" }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      return new Response(
        JSON.stringify({ assessment: null, message: "AI assessment temporarily unavailable" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const aiResponse = await response.json();
    console.log("AI response received");

    // Extract the tool call result
    const toolCall = aiResponse.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall?.function?.arguments) {
      const assessment = JSON.parse(toolCall.function.arguments);
      
      // Validate and sanitize
      assessment.rating = Math.max(1, Math.min(5, Number(assessment.rating) || 3));
      assessment.pros = (assessment.pros || []).slice(0, 4);
      assessment.cons = (assessment.cons || []).slice(0, 3);
      assessment.summary = assessment.summary || "Brak podsumowania";

      return new Response(
        JSON.stringify({ assessment }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ assessment: null, message: "Could not parse AI response" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error in ai-listing-assessment:", error);
    return new Response(
      JSON.stringify({ 
        assessment: null, 
        error: error instanceof Error ? error.message : "Unknown error" 
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
