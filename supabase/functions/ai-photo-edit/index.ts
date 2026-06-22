import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Image } from "https://deno.land/x/imagescript@1.2.15/mod.ts";
import { checkAndDeductCredits, refundCredits } from "../_shared/creditGate.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const API4AI_KEY = Deno.env.get("API4AI_KEY");

// Predefiniowane tła (kategorie). Gemini generuje TYLKO tło (bez auta).
const BG_STYLES: Record<string, string> = {
  studio: "Profesjonalne studio fotograficzne do auta: gładkie ciemnoszare tło z gradientem, lśniąca podłoga z delikatnym odbiciem, miękkie światło studyjne. BEZ auta, bez przedmiotów, bez ludzi.",
  salon: "Nowoczesny salon samochodowy (showroom): jasne wnętrze, szklane ściany, wypolerowana posadzka, eleganckie oświetlenie. BEZ auta, bez ludzi.",
  elegancki: "Eleganckie luksusowe tło: ciepłe światło, marmurowa podłoga, wyrafinowana sceneria premium. BEZ auta, bez przedmiotów.",
  sportowy: "Dynamiczne sportowe tło: tor wyścigowy / asfalt, dramatyczne światło, wrażenie ruchu. BEZ auta, bez ludzi.",
};

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function bytesToB64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

interface PhotoEditRequest {
  imageUrl: string;
  instruction?: string;
  listingType: 'vehicle' | 'real_estate';
  listingId: string;
  photoIndex: number;
  userId?: string;
  featureKey?: string;            // 'vehicle_photo_enhance' | 'vehicle_photo_custom'
  backgroundStyle?: string;       // 'studio' | 'salon' | 'elegancki' | 'sportowy'
  backgroundPrompt?: string;      // własny opis tła (gdy custom)
}

// KROK 1: API4AI Cars Background Removal — zwraca PRAWDZIWE auto bez tła (base64 PNG).
async function removeCarBackground(imageUrl: string): Promise<string | null> {
  if (!API4AI_KEY) return null;
  try {
    const form = new FormData();
    form.append("url", imageUrl);
    const resp = await fetch("https://api4ai.cloud/img-bg-removal/v1/cars/results", {
      method: "POST",
      headers: { "X-API-KEY": API4AI_KEY },
      body: form,
    });
    if (!resp.ok) { console.error("[API4AI] error", resp.status, (await resp.text()).slice(0, 200)); return null; }
    const data = await resp.json();
    const entities = data?.results?.[0]?.entities ?? [];
    const b64 = entities.find((e: any) => e?.image)?.image;
    return b64 || null;
  } catch (e) { console.error("[API4AI] wyjątek:", (e as any)?.message); return null; }
}

// KROK 2: Gemini generuje SAMO tło (bez auta) wg stylu/promptu. Zwraca base64 obrazu.
async function generateBackground(stylePrompt: string): Promise<string | null> {
  const prompt = `Wygeneruj WYŁĄCZNIE tło do zdjęcia samochodu (sam scena, BEZ jakiegokolwiek auta, bez ludzi, bez napisów). ${stylePrompt} Format poziomy/pionowy uniwersalny, realistyczne, wysoka jakość.`;
  const resp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${LOVABLE_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'google/gemini-2.5-flash-image-preview',
      messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }],
      modalities: ['image', 'text'],
    }),
  });
  if (!resp.ok) { console.error("[Gemini bg] error", resp.status, (await resp.text()).slice(0, 200)); return null; }
  const data = await resp.json();
  const url: string | undefined = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;
  if (!url) return null;
  const comma = url.indexOf(",");
  return comma >= 0 ? url.slice(comma + 1) : url; // base64 bez prefiksu data:
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const request: PhotoEditRequest = await req.json();
    const { imageUrl, listingType, listingId, photoIndex, userId } = request;
    if (!imageUrl) {
      return new Response(JSON.stringify({ error: 'Missing imageUrl' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: settings } = await supabase.from('ai_settings').select('ai_enabled, ai_photo_enabled').limit(1).maybeSingle();
    if (!settings?.ai_enabled || !settings?.ai_photo_enabled) {
      return new Response(JSON.stringify({ error: 'AI Photo Editing is disabled' }), { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Tożsamość z JWT.
    const authHeader = req.headers.get('Authorization') ?? '';
    let authedUserId: string | null = null;
    if (authHeader) {
      const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: authHeader } } });
      const { data: { user } } = await userClient.auth.getUser();
      authedUserId = user?.id ?? null;
    }

    // Rozliczenie SERWEROWE (koszt z ai_pricing przez creditGate).
    let billed: { userId: string; cost: number; balanceAfter: number } | null = null;
    if (request.featureKey) {
      if (!authedUserId) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      const gate = await checkAndDeductCredits(supabase, authedUserId, request.featureKey, { modelUsed: 'api4ai+gemini-bg' });
      if (!gate.allowed) return new Response(JSON.stringify({ error: 'insufficient_credits', reason: gate.reason, balance: gate.balance, cost: gate.cost }), { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      billed = { userId: authedUserId, cost: gate.cost, balanceAfter: gate.balance_after };
    }

    const startTime = Date.now();

    // KROK 1: wytnij PRAWDZIWE auto. WYMAGANE — bez tego nie ma realnego auta.
    const cutoutB64 = await removeCarBackground(imageUrl);
    if (!cutoutB64) {
      if (billed) await refundCredits(supabase, billed.userId, billed.cost);
      return new Response(JSON.stringify({ error: 'cutout_failed', message: 'Nie udało się wyciąć auta (API4AI). Spróbuj inne zdjęcie.' }), { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // KROK 2: wygeneruj SAMO tło.
    const stylePrompt = (request.backgroundPrompt && request.backgroundPrompt.trim())
      ? request.backgroundPrompt.trim()
      : (BG_STYLES[request.backgroundStyle || 'studio'] || BG_STYLES.studio);
    const bgB64 = await generateBackground(stylePrompt);
    if (!bgB64) {
      if (billed) await refundCredits(supabase, billed.userId, billed.cost);
      return new Response(JSON.stringify({ error: 'background_failed', message: 'Nie udało się wygenerować tła.' }), { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // KROK 3: KOMPOZYCJA — realny cutout na tło. Gemini NIE dotyka auta.
    let editedImageUrl: string;
    try {
      const car = await Image.decode(b64ToBytes(cutoutB64));
      const bg = await Image.decode(b64ToBytes(bgB64));
      bg.resize(car.width, car.height);     // tło do rozmiaru auta
      bg.composite(car, 0, 0);               // realne auto na wierzch (alpha)
      const outBytes = await bg.encodeJPEG(90);
      // Zapis do car-photos (http URL zamiast ciężkiego data-url w bazie).
      const path = `${authedUserId || userId || 'anon'}/ai-${Date.now()}-${photoIndex || 0}.jpg`;
      const { data: up, error: upErr } = await supabase.storage.from('car-photos').upload(path, outBytes, { contentType: 'image/jpeg', upsert: true });
      if (upErr || !up) {
        editedImageUrl = `data:image/jpeg;base64,${bytesToB64(outBytes)}`; // fallback
      } else {
        editedImageUrl = supabase.storage.from('car-photos').getPublicUrl(up.path).data.publicUrl;
      }
    } catch (e) {
      console.error('[compose] error:', (e as any)?.message);
      if (billed) await refundCredits(supabase, billed.userId, billed.cost);
      return new Response(JSON.stringify({ error: 'compose_failed', message: 'Błąd składania zdjęcia.' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const responseTime = Date.now() - startTime;

    if (listingType && listingId) {
      await supabase.from('ai_photo_edits').insert({
        listing_type: listingType, listing_id: listingId, photo_index: photoIndex || 0,
        original_url: imageUrl,
        edited_url: editedImageUrl.startsWith('http') ? editedImageUrl : imageUrl,
        instruction: `bg:${request.backgroundStyle || 'studio'}`, created_by: authedUserId || userId || null,
      });
    }

    return new Response(JSON.stringify({
      success: true,
      originalUrl: imageUrl,
      editedUrl: editedImageUrl,
      responseTimeMs: responseTime,
      balance_after: billed ? billed.balanceAfter : null,
      cost: billed ? billed.cost : 0,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('[AI Photo] Error:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
