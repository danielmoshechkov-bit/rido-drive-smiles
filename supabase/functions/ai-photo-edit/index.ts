import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

interface PhotoEditRequest {
  imageUrl: string;
  instruction: string;
  listingType: 'vehicle' | 'real_estate';
  listingId: string;
  photoIndex: number;
  userId?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const request: PhotoEditRequest = await req.json();
    const { imageUrl, instruction, listingType, listingId, photoIndex, userId } = request;

    if (!imageUrl || !instruction) {
      return new Response(
        JSON.stringify({ error: 'Missing imageUrl or instruction' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Check AI settings
    const { data: settings } = await supabase
      .from('ai_settings')
      .select('ai_enabled, ai_photo_enabled')
      .limit(1)
      .maybeSingle();

    if (!settings?.ai_enabled || !settings?.ai_photo_enabled) {
      return new Response(
        JSON.stringify({ error: 'AI Photo Editing is disabled' }),
        { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[AI Photo] Editing photo with instruction:', instruction);
    console.log('[AI Photo] Image URL:', imageUrl.substring(0, 100) + '...');

    // Check for auto-enhance mode
    const isAutoEnhance = instruction.toLowerCase() === 'auto-enhance' || 
                          instruction.toLowerCase() === 'auto' ||
                          instruction.toLowerCase() === 'automatycznie popraw';
    
    // Enhance instruction for better results
    const enhancedInstruction = isAutoEnhance
      ? `Automatycznie popraw to zdjęcie nieruchomości/pojazdu dla ogłoszenia:
- Zwiększ jasność i kontrast jeśli zdjęcie jest ciemne
- Popraw nasycenie kolorów (nie przesadzaj)
- Usuń szum i artefakty
- Wyprostuj perspektywę jeśli to potrzebne
- Zachowaj naturalny wygląd
- Wynik powinien wyglądać profesjonalnie
Zdjęcie powinno być gotowe do publikacji.`
      : `Edytuj to zdjęcie nieruchomości/pojazdu według instrukcji: "${instruction}". 
Zachowaj profesjonalny wygląd odpowiedni dla ogłoszenia. 
Wynik powinien wyglądać realistycznie i naturalnie.`;

    // Call Gemini Image API via Lovable Gateway
    const startTime = Date.now();
    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash-image-preview',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: enhancedInstruction },
              { type: 'image_url', image_url: { url: imageUrl } }
            ]
          }
        ],
        modalities: ['image', 'text']
      }),
    });

    const responseTime = Date.now() - startTime;

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('[AI Photo] API error:', aiResponse.status, errorText);
      
      if (aiResponse.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      if (aiResponse.status === 402) {
        return new Response(
          JSON.stringify({ error: 'AI credits depleted. Please add more credits.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      return new Response(
        JSON.stringify({ error: 'Image editing failed. Please try again.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const aiData = await aiResponse.json();
    const editedImageUrl = aiData.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    const aiMessage = aiData.choices?.[0]?.message?.content || '';

    if (!editedImageUrl) {
      console.error('[AI Photo] No edited image in response');
      return new Response(
        JSON.stringify({ 
          error: 'AI could not generate edited image. Try a different instruction.',
          aiMessage 
        }),
        { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[AI Photo] Image edited successfully in', responseTime, 'ms');

    // Save edit history
    if (listingType && listingId) {
      await supabase.from('ai_photo_edits').insert({
        listing_type: listingType,
        listing_id: listingId,
        photo_index: photoIndex || 0,
        original_url: imageUrl,
        edited_url: editedImageUrl,
        instruction: instruction,
        created_by: userId || null
      });
    }

    // Log usage
    await supabase.from('ai_credit_history').insert({
      user_id: userId || null,
      query_type: 'photo_edit',
      ai_type: 'photo_edit',
      model_used: 'google/gemini-2.5-flash-image-preview',
      response_time_ms: responseTime,
      query_summary: instruction.substring(0, 100),
      credits_used: 2, // Photo editing costs more
      was_free: false
    });

    return new Response(
      JSON.stringify({
        success: true,
        originalUrl: imageUrl,
        editedUrl: editedImageUrl,
        instruction,
        responseTimeMs: responseTime,
        aiMessage
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[AI Photo] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
