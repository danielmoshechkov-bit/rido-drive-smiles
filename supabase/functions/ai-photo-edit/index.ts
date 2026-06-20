import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkAndDeductCredits, refundCredits } from "../_shared/creditGate.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const API4AI_KEY = Deno.env.get("API4AI_KEY"); // opcjonalny — wycięcie PRAWDZIWEGO auta

// KROK 1 pipeline: API4AI Cars Background Removal — zwraca PRAWDZIWE auto bez tła (PNG).
// Zwraca data-URL (base64 PNG) albo null gdy brak klucza / błąd.
async function removeCarBackground(imageUrl: string): Promise<string | null> {
  if (!API4AI_KEY) return null;
  try {
    const form = new FormData();
    form.append("url", imageUrl); // można podać URL zamiast pliku
    const resp = await fetch("https://api4ai.cloud/img-bg-removal/v1/cars/results", {
      method: "POST",
      headers: { "A4A-CLIENT-API-KEY": API4AI_KEY },
      body: form,
    });
    if (!resp.ok) {
      console.error("[API4AI] bg-removal error", resp.status, (await resp.text()).slice(0, 200));
      return null;
    }
    const data = await resp.json();
    const entities = data?.results?.[0]?.entities ?? [];
    const b64 = entities.find((e: any) => e?.image)?.image
      ?? entities.find((e: any) => e?.kind === "image")?.image;
    if (!b64) { console.error("[API4AI] brak obrazu w odpowiedzi"); return null; }
    return `data:image/png;base64,${b64}`;
  } catch (e) {
    console.error("[API4AI] wyjątek:", (e as any)?.message);
    return null;
  }
}

interface PhotoEditRequest {
  imageUrl: string;
  instruction: string;
  listingType: 'vehicle' | 'real_estate';
  listingId: string;
  photoIndex: number;
  userId?: string;       // ignorowane do rozliczen — userId bierzemy z JWT
  featureKey?: string;   // 'vehicle_photo_enhance' | 'vehicle_photo_custom' (tor aut)
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

    // Tozsamosc z JWT (gateway ma verify_jwt=false → weryfikujemy sami).
    const authHeader = req.headers.get('Authorization') ?? '';
    let authedUserId: string | null = null;
    if (authHeader) {
      const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user } } = await userClient.auth.getUser();
      authedUserId = user?.id ?? null;
    }

    // Rozliczenie SERWEROWE — tylko gdy caller podal featureKey (tor aut).
    // Koszt WYLACZNIE z ai_pricing (creditGate). Brak drugiego zrodla kosztu.
    let billed: { userId: string; cost: number; balanceAfter: number } | null = null;
    if (request.featureKey) {
      if (!authedUserId) {
        return new Response(
          JSON.stringify({ error: 'Unauthorized' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      const gate = await checkAndDeductCredits(supabase, authedUserId, request.featureKey, {
        modelUsed: 'google/gemini-2.5-flash-image-preview',
        querySummary: instruction.substring(0, 100),
      });
      if (!gate.allowed) {
        return new Response(
          JSON.stringify({ error: 'insufficient_credits', reason: gate.reason, balance: gate.balance, cost: gate.cost }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      billed = { userId: authedUserId, cost: gate.cost, balanceAfter: gate.balance_after };
    }

    console.log('[AI Photo] Editing photo with instruction:', instruction);
    console.log('[AI Photo] Image URL:', imageUrl.substring(0, 100) + '...');

    // Check for auto-enhance mode
    const isAutoEnhance = instruction.toLowerCase() === 'auto-enhance' || 
                          instruction.toLowerCase() === 'auto' ||
                          instruction.toLowerCase() === 'automatycznie popraw';
    
    // KROK 1: wytnij PRAWDZIWE auto z tła (API4AI). Gdy brak klucza/błąd → fallback do oryginału.
    const cutoutUrl = await removeCarBackground(imageUrl);
    const sourceImageUrl = cutoutUrl || imageUrl;
    const cutoutUsed = !!cutoutUrl;
    console.log(`[AI Photo] API4AI cutout: ${cutoutUsed ? 'OK (realne auto)' : 'BRAK (fallback do oryginału)'}`);

    // KROK 2: instrukcja dla Gemini.
    // Gdy mamy wycięte auto — KOMPONUJEMY (auto bez zmian, zmienia się TYLKO tło).
    const enhancedInstruction = cutoutUsed
      ? `Na obrazie jest auto już wycięte z tła (przezroczyste/białe tło).
Wstaw TO SAMO auto, BEZ ŻADNYCH ZMIAN, do profesjonalnego salonu/studia samochodowego:
- NIE przerysowuj, NIE zmieniaj auta: ten sam model, kolor, felgi, uszkodzenia, rysy, kąt, tablice rejestracyjne.
- Zmień WYŁĄCZNIE tło na czyste studyjne (gradient + delikatne odbicie na podłodze, profesjonalne światło).
- Auto ma pozostać pikselowo wierne wycięciu. Tablic NIE zamazuj.`
      : isAutoEnhance
        ? `Automatycznie popraw to zdjęcie pojazdu dla ogłoszenia: jasność, kontrast, nasycenie (bez przesady), usuń szum. NIE zmieniaj samego auta. Tablic nie zamazuj.`
        : `Edytuj to zdjęcie pojazdu: "${instruction}". Zachowaj auto bez zmian, profesjonalny wygląd. Tablic nie zamazuj.`;

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
              { type: 'image_url', image_url: { url: sourceImageUrl } }
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
      if (billed) await refundCredits(supabase, billed.userId, billed.cost); // model padl → zwrot

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
      if (billed) await refundCredits(supabase, billed.userId, billed.cost); // brak wyniku → zwrot
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

    // Koszt i log obsluzone przez creditGate (ai_pricing) PRZED wywolaniem modelu.
    // Brak innego zrodla kosztu — dawny hardcode credits_used:2 usuniety.

    return new Response(
      JSON.stringify({
        success: true,
        originalUrl: imageUrl,
        editedUrl: editedImageUrl,
        instruction,
        responseTimeMs: responseTime,
        aiMessage,
        balance_after: billed ? billed.balanceAfter : null,
        cost: billed ? billed.cost : 0
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
