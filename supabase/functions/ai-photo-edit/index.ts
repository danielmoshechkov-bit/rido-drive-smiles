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

const BG_STYLES: Record<string, string> = {
  studio: "Profesjonalne studio fotograficzne do auta: gładkie ciemnoszare tło z gradientem, lśniąca podłoga z delikatnym odbiciem, miękkie światło studyjne.",
  salon: "Nowoczesny salon samochodowy (showroom): jasne wnętrze, szklane ściany, wypolerowana posadzka, eleganckie oświetlenie.",
  elegancki: "Eleganckie luksusowe tło: ciepłe światło, marmurowa/kamienna podłoga, wyrafinowana sceneria premium.",
  sportowy: "Dynamiczne sportowe tło: tor wyścigowy / gładki asfalt, dramatyczne światło.",
};

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function bytesToB64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 8192;
  for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(bin);
}

interface PhotoEditRequest {
  imageUrl: string;
  listingType: 'vehicle' | 'real_estate';
  listingId: string;
  photoIndex: number;
  userId?: string;
  featureKey?: string;
  backgroundStyle?: string;
  backgroundPrompt?: string;
  removePlates?: boolean;
  changeBackground?: boolean;
  backgroundImageUrl?: string; // spójne tło: reużyj tego samego tła dla całej partii
}

// img-anonymization hide-clp — zamazuje tablice; zwraca też czy tablica była wykryta.
async function anonymizePlates(imageUrl: string): Promise<{ ok: boolean; b64?: string; hasPlate?: boolean; status?: number }> {
  if (!API4AI_KEY) return { ok: false, status: 0 };
  try {
    const form = new FormData();
    form.append("url", imageUrl);
    form.append("mode", "hide-clp");
    const resp = await fetch("https://api4ai.cloud/img-anonymization/v1/results", { method: "POST", headers: { "X-API-KEY": API4AI_KEY }, body: form });
    if (!resp.ok) return { ok: false, status: resp.status };
    const data = await resp.json();
    const r = data?.results?.[0] ?? {};
    const b64 = (r.entities ?? []).find((e: any) => e?.image)?.image;
    const hidden = (r.entities ?? []).find((e: any) => e?.kind === "objects");
    const hasPlate = !!(hidden?.objects ?? []).some((o: any) =>
      (o?.entities ?? []).some((en: any) => en?.classes && Object.keys(en.classes).some(k => k.toLowerCase().includes("plate"))));
    return b64 ? { ok: true, b64, hasPlate } : { ok: false, status: 422 };
  } catch { return { ok: false, status: 500 }; }
}

// cars bg-removal — cutout PRAWDZIWEGO auta. Wejście: url albo bytes (plik).
async function removeCarBackground(input: { url?: string; bytes?: Uint8Array }): Promise<string | null> {
  if (!API4AI_KEY) return null;
  try {
    const form = new FormData();
    if (input.bytes) form.append("image", new Blob([input.bytes], { type: "image/jpeg" }), "car.jpg");
    else form.append("url", input.url!);
    const resp = await fetch("https://api4ai.cloud/img-bg-removal/v1/cars/results", { method: "POST", headers: { "X-API-KEY": API4AI_KEY }, body: form });
    if (!resp.ok) { console.error("[API4AI] bg", resp.status); return null; }
    const data = await resp.json();
    return (data?.results?.[0]?.entities ?? []).find((e: any) => e?.image)?.image || null;
  } catch (e) { console.error("[API4AI] bg ex", (e as any)?.message); return null; }
}

async function generateBackground(stylePrompt: string): Promise<string | null> {
  const prompt = `Wygeneruj WYŁĄCZNIE tło do zdjęcia samochodu (sama scena, BEZ jakiegokolwiek auta, bez ludzi, bez napisów). ${stylePrompt}
WAŻNE: wyraźna pozioma podłoga/posadzka w dolnej części kadru, naturalny horyzont i perspektywa, spójne miękkie światło. Realistyczne, wysoka jakość, format poziomy.`;
  const resp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${LOVABLE_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'google/gemini-2.5-flash-image-preview', messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }], modalities: ['image', 'text'] }),
  });
  if (!resp.ok) { console.error("[Gemini bg]", resp.status); return null; }
  const data = await resp.json();
  const url: string | undefined = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;
  if (!url) return null;
  const c = url.indexOf(","); return c >= 0 ? url.slice(c + 1) : url;
}

// bbox nieprzezroczystego auta w cutoucie (skan co 4 px).
function carBBox(img: any): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = img.width, minY = img.height, maxX = 0, maxY = 0;
  for (let y = 0; y < img.height; y += 4) for (let x = 0; x < img.width; x += 4) {
    if ((img.getPixelAt(x + 1, y + 1) & 0xff) > 24) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
  }
  if (maxX <= minX) { minX = 0; maxX = img.width; minY = 0; maxY = img.height; }
  return { minX, minY, maxX, maxY };
}

// miękki eliptyczny cień kontaktowy pod autem (osadza auto na podłożu).
function drawContactShadow(bg: any, bbox: { minX: number; maxX: number; maxY: number }) {
  const cx = (bbox.minX + bbox.maxX) / 2;
  const by = Math.min(bbox.maxY + 6, bg.height - 2);
  const ew = (bbox.maxX - bbox.minX) * 0.55;
  const eh = Math.max(8, (bbox.maxX - bbox.minX) * 0.07);
  const y0 = Math.max(1, Math.floor(by - eh)), y1 = Math.min(bg.height, Math.ceil(by + eh));
  const x0 = Math.max(1, Math.floor(cx - ew)), x1 = Math.min(bg.width, Math.ceil(cx + ew));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const d = ((x - cx) / ew) ** 2 + ((y - by) / eh) ** 2;
      if (d < 1) {
        const a = (1 - d) * 0.45;
        const p = bg.getPixelAt(x, y);
        const r = ((p >> 24) & 0xff) * (1 - a), g = ((p >> 16) & 0xff) * (1 - a), b = ((p >> 8) & 0xff) * (1 - a);
        bg.setPixelAt(x, y, Image.rgbaToColor(r, g, b, 255));
      }
    }
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const request: PhotoEditRequest = await req.json();
    const { imageUrl, listingType, listingId, photoIndex, userId } = request;
    if (!imageUrl) return new Response(JSON.stringify({ error: 'Missing imageUrl' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: settings } = await supabase.from('ai_settings').select('ai_enabled, ai_photo_enabled').limit(1).maybeSingle();
    if (!settings?.ai_enabled || !settings?.ai_photo_enabled) return new Response(JSON.stringify({ error: 'AI Photo Editing is disabled' }), { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const authHeader = req.headers.get('Authorization') ?? '';
    let authedUserId: string | null = null;
    if (authHeader) {
      const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: authHeader } } });
      const { data: { user } } = await userClient.auth.getUser();
      authedUserId = user?.id ?? null;
    }

    let billed: { userId: string; cost: number; balanceAfter: number } | null = null;
    if (request.featureKey) {
      if (!authedUserId) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      const gate = await checkAndDeductCredits(supabase, authedUserId, request.featureKey, { modelUsed: 'api4ai+gemini' });
      if (!gate.allowed) return new Response(JSON.stringify({ error: 'insufficient_credits', reason: gate.reason, balance: gate.balance, cost: gate.cost }), { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      billed = { userId: authedUserId, cost: gate.cost, balanceAfter: gate.balance_after };
    }
    const refund = async () => { if (billed) await refundCredits(supabase, billed.userId, billed.cost); };

    const changeBackground = request.changeBackground !== false;
    const removePlates = !!request.removePlates;

    const uploadJpeg = async (bytes: Uint8Array): Promise<string> => {
      const path = `${authedUserId || userId || 'anon'}/ai-${Date.now()}-${photoIndex || 0}-${Math.floor(bytes.length % 9973)}.jpg`;
      const { data: up, error } = await supabase.storage.from('car-photos').upload(path, bytes, { contentType: 'image/jpeg', upsert: true });
      if (error || !up) return `data:image/jpeg;base64,${bytesToB64(bytes)}`;
      return supabase.storage.from('car-photos').getPublicUrl(up.path).data.publicUrl;
    };

    // ── TRYB A: tylko ukrycie tablic (tło bez zmian) ──
    if (!changeBackground && removePlates) {
      const anon = await anonymizePlates(imageUrl);
      if (!anon.ok) {
        await refund();
        const msg = anon.status === 403 ? 'Anonimizacja tablic niedostępna dla tego klucza API4AI.' : 'Nie udało się przetworzyć zdjęcia.';
        return new Response(JSON.stringify({ error: 'plates_failed', status: anon.status, message: msg }), { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      // #2: brak wykrytej tablicy → ZWROT kredytu, pomiń (zwróć oryginał).
      if (!anon.hasPlate) {
        await refund();
        return new Response(JSON.stringify({ success: true, skipped: true, noPlate: true, originalUrl: imageUrl, editedUrl: imageUrl, cost: 0, balance_after: billed ? billed.balanceAfter + billed.cost : null }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      let outBytes: Uint8Array;
      try { outBytes = await (await Image.decode(b64ToBytes(anon.b64!))).encodeJPEG(90); } catch { outBytes = b64ToBytes(anon.b64!); }
      const editedUrl = await uploadJpeg(outBytes);
      return new Response(JSON.stringify({ success: true, originalUrl: imageUrl, editedUrl, balance_after: billed ? billed.balanceAfter : null, cost: billed ? billed.cost : 0 }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ── TRYB B: zmiana tła (opcjonalnie + ukrycie tablic najpierw) ──
    let cutoutB64: string | null;
    if (removePlates) {
      const anon = await anonymizePlates(imageUrl); // najpierw zamaż tablicę
      if (anon.ok && anon.b64) {
        const anonBytes = await (await Image.decode(b64ToBytes(anon.b64))).encodeJPEG(92);
        cutoutB64 = await removeCarBackground({ bytes: anonBytes }); // cutout z zamazanej
      } else {
        cutoutB64 = await removeCarBackground({ url: imageUrl });
      }
    } else {
      cutoutB64 = await removeCarBackground({ url: imageUrl });
    }
    if (!cutoutB64) { await refund(); return new Response(JSON.stringify({ error: 'cutout_failed', message: 'Nie udało się wyciąć auta. Spróbuj inne zdjęcie.' }), { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }); }

    // tło: reużyj wspólnego (spójność partii) albo wygeneruj raz
    let bgB64: string | null = null;
    let backgroundUsedUrl: string | null = request.backgroundImageUrl || null;
    if (request.backgroundImageUrl) {
      try { const r = await fetch(request.backgroundImageUrl); bgB64 = bytesToB64(new Uint8Array(await r.arrayBuffer())); } catch { bgB64 = null; }
    }
    if (!bgB64) {
      const stylePrompt = (request.backgroundPrompt && request.backgroundPrompt.trim()) ? request.backgroundPrompt.trim() : (BG_STYLES[request.backgroundStyle || 'studio'] || BG_STYLES.studio);
      bgB64 = await generateBackground(stylePrompt);
      if (!bgB64) { await refund(); return new Response(JSON.stringify({ error: 'background_failed', message: 'Nie udało się wygenerować tła.' }), { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }); }
    }

    let editedImageUrl: string;
    try {
      const car = await Image.decode(b64ToBytes(cutoutB64));
      const bg = await Image.decode(b64ToBytes(bgB64));
      bg.resize(car.width, car.height);
      const bbox = carBBox(car);            // #6: cień kontaktowy → osadzenie na podłożu
      drawContactShadow(bg, bbox);
      bg.composite(car, 0, 0);              // realne auto na wierzch (alpha)
      const outBytes = await bg.encodeJPEG(90);
      editedImageUrl = await uploadJpeg(outBytes);
      // zachowaj wspólne tło do reużycia (spójność partii)
      if (!backgroundUsedUrl) { try { backgroundUsedUrl = await uploadJpeg(await bg.encodeJPEG(85)); } catch { /* opcjonalne */ } }
    } catch (e) {
      await refund();
      return new Response(JSON.stringify({ error: 'compose_failed', message: 'Błąd składania zdjęcia.' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (listingType && listingId) {
      await supabase.from('ai_photo_edits').insert({ listing_type: listingType, listing_id: listingId, photo_index: photoIndex || 0, original_url: imageUrl, edited_url: editedImageUrl.startsWith('http') ? editedImageUrl : imageUrl, instruction: `bg:${request.backgroundStyle || 'studio'}${removePlates ? '+hide-clp' : ''}`, created_by: authedUserId || userId || null }).then(() => {}, () => {});
    }

    return new Response(JSON.stringify({ success: true, originalUrl: imageUrl, editedUrl: editedImageUrl, backgroundUsedUrl, balance_after: billed ? billed.balanceAfter : null, cost: billed ? billed.cost : 0 }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
