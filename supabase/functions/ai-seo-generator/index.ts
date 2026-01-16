import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

interface SEORequest {
  listingType: 'vehicle' | 'real_estate';
  listingId: string;
  title: string;
  description: string;
  photos?: string[];
  additionalData?: Record<string, unknown>;
}

interface SEOResult {
  seo_title: string;
  seo_description: string;
  seo_h1: string;
  seo_schema_json: Record<string, unknown>;
  photo_alts: string[];
}

const SYSTEM_PROMPT = `Jesteś ekspertem SEO dla portalu ogłoszeń GetRido.
Twoim zadaniem jest generowanie zoptymalizowanych pod SEO metadanych dla ogłoszeń.

ZASADY:
1. SEO Title: max 60 znaków, zawiera główne słowo kluczowe na początku
2. Meta Description: max 160 znaków, zachęcająca do kliknięcia, zawiera CTA
3. H1: naturalny, zawiera lokalizację jeśli dostępna
4. Schema.org: poprawny JSON-LD dla typu ogłoszenia
5. ALT-y do zdjęć: opisowe, zawierają słowa kluczowe

Dla NIERUCHOMOŚCI używaj schema.org/RealEstateListing
Dla POJAZDÓW używaj schema.org/Vehicle lub schema.org/Car

ODPOWIADAJ TYLKO w formacie JSON:
{
  "seo_title": "...",
  "seo_description": "...",
  "seo_h1": "...",
  "seo_schema_json": {...},
  "photo_alts": ["...", "..."]
}`;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const request: SEORequest = await req.json();
    const { listingType, listingId, title, description, photos, additionalData } = request;

    if (!listingType || !listingId || !title) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: listingType, listingId, title' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Check AI settings
    const { data: settings } = await supabase
      .from('ai_settings')
      .select('ai_enabled, ai_seo_enabled, ai_model')
      .limit(1)
      .maybeSingle();

    if (!settings?.ai_enabled || !settings?.ai_seo_enabled) {
      return new Response(
        JSON.stringify({ error: 'AI SEO is disabled' }),
        { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build user prompt
    const photoCount = photos?.length || 0;
    const userPrompt = `Wygeneruj SEO dla ogłoszenia:

TYP: ${listingType === 'vehicle' ? 'Pojazd' : 'Nieruchomość'}
TYTUŁ: ${title}
OPIS: ${description || 'Brak opisu'}
LICZBA ZDJĘĆ: ${photoCount}
${additionalData ? `DODATKOWE DANE: ${JSON.stringify(additionalData)}` : ''}

Wygeneruj kompletne SEO z ${photoCount} ALT-ami dla zdjęć.`;

    console.log('[AI SEO] Generating SEO for:', listingType, listingId);

    // Call AI
    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: settings?.ai_model || 'openai/gpt-5.2',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt }
        ],
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('[AI SEO] API error:', aiResponse.status, errorText);
      
      if (aiResponse.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      return new Response(
        JSON.stringify({ error: 'AI service error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const aiData = await aiResponse.json();
    const aiContent = aiData.choices?.[0]?.message?.content || '';

    console.log('[AI SEO] Raw response:', aiContent.substring(0, 200));

    // Parse SEO result
    let seoResult: SEOResult;
    try {
      // Extract JSON from response
      let jsonStr = aiContent;
      const jsonMatch = aiContent.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1];
      }
      seoResult = JSON.parse(jsonStr.trim());
    } catch (parseError) {
      console.error('[AI SEO] Parse error:', parseError);
      
      // Generate fallback SEO
      seoResult = {
        seo_title: title.substring(0, 60),
        seo_description: (description || title).substring(0, 160),
        seo_h1: title,
        seo_schema_json: {
          "@context": "https://schema.org",
          "@type": listingType === 'vehicle' ? 'Vehicle' : 'RealEstateListing',
          "name": title,
          "description": description
        },
        photo_alts: photos?.map((_, i) => `Zdjęcie ${i + 1} - ${title}`) || []
      };
    }

    // Validate and sanitize
    seoResult.seo_title = (seoResult.seo_title || title).substring(0, 60);
    seoResult.seo_description = (seoResult.seo_description || description || title).substring(0, 160);
    seoResult.seo_h1 = seoResult.seo_h1 || title;
    seoResult.photo_alts = seoResult.photo_alts || [];

    // Ensure we have enough ALTs for all photos
    while (seoResult.photo_alts.length < photoCount) {
      seoResult.photo_alts.push(`${title} - zdjęcie ${seoResult.photo_alts.length + 1}`);
    }

    // Update listing in database
    const tableName = listingType === 'vehicle' ? 'vehicle_listings' : 'real_estate_listings';
    const { error: updateError } = await supabase
      .from(tableName)
      .update({
        seo_title: seoResult.seo_title,
        seo_description: seoResult.seo_description,
        seo_h1: seoResult.seo_h1,
        seo_schema_json: seoResult.seo_schema_json,
        photo_alts: seoResult.photo_alts
      })
      .eq('id', listingId);

    if (updateError) {
      console.error('[AI SEO] Update error:', updateError);
      // Don't fail - return the generated SEO anyway
    }

    // Log usage
    await supabase.from('ai_credit_history').insert({
      query_type: 'seo',
      ai_type: 'seo',
      model_used: settings?.ai_model || 'openai/gpt-5.2',
      query_summary: `SEO for ${listingType}: ${title.substring(0, 50)}`,
      credits_used: 1,
      was_free: false
    });

    console.log('[AI SEO] Generated successfully for:', listingId);

    return new Response(
      JSON.stringify({
        success: true,
        seo: seoResult,
        listingId,
        listingType
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[AI SEO] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
