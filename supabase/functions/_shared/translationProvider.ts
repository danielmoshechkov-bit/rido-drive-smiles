// ============================================================================
// SHARED TRANSLATION PROVIDER
// Jedyne miejsce z detekcją providera + wywołaniem modelu (dawniej skopiowane
// ×4 w translate / translation-queue-worker / workshop-translate-batch / itp.).
// Używane przez edge `translate-content` (core).
// ============================================================================

export const LANG_NAMES: Record<string, string> = {
  pl: 'Polish', en: 'English', ru: 'Russian', ua: 'Ukrainian', uk: 'Ukrainian',
  de: 'German', vi: 'Vietnamese', kz: 'Kazakh', ro: 'Romanian', tr: 'Turkish',
  zh: 'Chinese (Simplified)', ar: 'Arabic', fr: 'French', es: 'Spanish',
  it: 'Italian', sk: 'Slovak', cs: 'Czech',
};

export function langName(code: string): string {
  return LANG_NAMES[(code || '').slice(0, 2)] || LANG_NAMES[code] || code;
}

/** Lekka heurystyka wykrywania języka źródłowego (gdy 'auto'). */
export function detectSourceLang(text: string): string {
  const s = (text || '').trim();
  if (!s) return 'pl';
  if (/[一-鿿]/.test(s)) return 'zh';
  if (/[؀-ۿ]/.test(s)) return 'ar';
  if (/[іїєґ]/i.test(s)) return 'ua';
  if (/[Ѐ-ӿ]/.test(s)) return 'ru';
  if (/[ăâîșț]/i.test(s)) return 'ro';
  if (/[ạảấầẩẫậắằẳẵặ]/i.test(s)) return 'vi';
  if (/[ąćęłńóśźż]/i.test(s)) return 'pl';
  if (/[äöüß]/i.test(s)) return 'de';
  return 'pl';
}

export type Provider = 'anthropic' | 'gemini' | 'kimi';

/** Oczyść klucz API: usuń znaki spoza drukowalnego ASCII (śmieci z wklejenia:
 *  smart-quotes, zero-width, nbsp, \r\n) — inaczej fetch rzuca „invalid ByteString". */
function cleanKey(v: string | undefined): string {
  return (v || '').replace(/[^\x20-\x7E]/g, '').trim();
}

/** Wykryj providera ze stringa modelu (np. 'claude-haiku-4-5' → anthropic). */
export function detectProvider(model: string): Provider {
  const m = (model || '').toLowerCase();
  if (/claude|haiku|sonnet|opus/.test(m)) return 'anthropic';
  if (/^google\/|^openai\/|gemini|gpt-/.test(m)) return 'gemini';
  return 'kimi';
}

export interface TranslateResult {
  /** Tłumaczenia w TEJ SAMEJ kolejności co wejściowe `texts`. */
  translations: string[];
  provider: Provider;
  /** false = błąd providera, zwrócono fallback (teksty źródłowe). */
  ok: boolean;
  error?: string;
}

/**
 * Przetłumacz batch tekstów źródłowych na jeden język docelowy.
 * Zwraca tablicę wyrównaną do wejścia. Przy błędzie providera: ok=false +
 * teksty źródłowe (caller decyduje co z tym zrobić).
 */
export async function translateTexts(opts: {
  texts: string[];
  sourceLang: string;
  targetLang: string;
  model: string;
  systemPrompt?: string;
  domainHint?: string;
}): Promise<TranslateResult> {
  const { texts, sourceLang, targetLang, model } = opts;
  const provider = detectProvider(model);

  if (texts.length === 0) return { translations: [], provider, ok: true };

  const sourceName = langName(sourceLang);
  const targetName = langName(targetLang);
  const domainLine = opts.domainHint
    ? `Domain: ${opts.domainHint}. Use correct professional terminology for this domain.`
    : '';

  const system = opts.systemPrompt ||
    'You are a faithful, literal translation engine for an automotive / services / real-estate ' +
    'marketplace. Translate ONLY what is in the source — never add information, words, explanations ' +
    'or causes that are not there, never guess reasons, never expand a short fragment into a full ' +
    'sentence. Use correct professional domain terminology (e.g. PL "wahacz"=control arm, "klocki ' +
    'hamulcowe"=brake pads, "płyn chłodniczy"=coolant). Keep brand names, model/OE/part codes, ' +
    'numbers, prices, units and URLs EXACTLY. On a typo, translate the nearest sensible intended ' +
    'word but never invent meaning. Output only the translation.';

  const numbered = texts.map((t, i) => `[${i + 1}] ${t}`).join('\n---\n');
  const userPrompt =
`Translate each numbered text from ${sourceName} to ${targetName}.
${domainLine}
STRICT RULES:
- Translate LITERALLY and FAITHFULLY. Output ONLY the meaning present in the source.
- Do NOT add any words, explanations or causes not in the source. Do NOT guess reasons.
- Do NOT expand a short fragment into a full sentence. A short phrase stays a short phrase of equal length and meaning.
- Preserve brand names, model/OE/part codes, numbers, prices, units and URLs EXACTLY.
- On a typo, translate the nearest sensible intended word — never invent extra meaning.
- Output ONLY a valid JSON object with numeric string keys "1","2",… mapping to the translated text. No markdown, no commentary.

Texts:
${numbered}`;

  try {
    let raw = '{}';

    if (provider === 'anthropic') {
      const key = cleanKey(Deno.env.get('ANTHROPIC_API_KEY'));
      if (!key) throw new Error('ANTHROPIC_API_KEY missing');
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model,
          max_tokens: 4096,
          temperature: 0,
          system,
          messages: [{ role: 'user', content: userPrompt + '\n\nReturn ONLY JSON.' }],
        }),
      });
      if (!r.ok) throw new Error(`Anthropic ${r.status}: ${await r.text()}`);
      const d = await r.json();
      raw = d.content?.[0]?.text?.trim() || '{}';
    } else if (provider === 'gemini') {
      // Lovable AI Gateway (Google Gemini / OpenAI — OpenAI-compatible)
      const key = cleanKey(Deno.env.get('LOVABLE_API_KEY'));
      if (!key) throw new Error('LOVABLE_API_KEY missing');
      const gwModel = /^(google|openai)\//.test(model) ? model : `google/${model}`;
      const r = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
        body: JSON.stringify({
          model: gwModel,
          temperature: 0,
          messages: [{ role: 'system', content: system }, { role: 'user', content: userPrompt }],
          response_format: { type: 'json_object' },
        }),
      });
      if (!r.ok) throw new Error(`Lovable ${r.status}: ${await r.text()}`);
      const d = await r.json();
      raw = d.choices?.[0]?.message?.content?.trim() || '{}';
    } else {
      // Kimi / Moonshot (default)
      const key = cleanKey(Deno.env.get('MOONSHOT_API_KEY') || Deno.env.get('KIMI_API_KEY'));
      if (!key) throw new Error('MOONSHOT_API_KEY/KIMI_API_KEY missing');
      const r = await fetch('https://api.moonshot.ai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
        body: JSON.stringify({
          model,
          messages: [{ role: 'system', content: system }, { role: 'user', content: userPrompt }],
          max_tokens: 4096,
          temperature: 0,
          response_format: { type: 'json_object' },
        }),
      });
      if (!r.ok) throw new Error(`Kimi ${r.status}: ${await r.text()}`);
      const d = await r.json();
      raw = d.choices?.[0]?.message?.content?.trim() || '{}';
    }

    const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim()) as Record<string, string>;
    const translations = texts.map((src, i) => {
      const v = parsed[String(i + 1)] ?? parsed[(i + 1) as unknown as string];
      return (typeof v === 'string' && v.length > 0) ? v : src;
    });
    return { translations, provider, ok: true };
  } catch (e) {
    console.error('translateTexts failed:', e);
    return { translations: [...texts], provider, ok: false, error: String(e) };
  }
}

/** Odczyt aktywnego agenta z ai_agents_config: model + system_prompt
 *  (panel admina realnie steruje promptem i modelem). Domyślnie Haiku. */
export async function resolveAgent(
  sb: { from: (t: string) => any },
  agentId = 'content_translation',
  fallbackModel = 'claude-haiku-4-5-20251001',
): Promise<{ model: string; systemPrompt?: string }> {
  try {
    const { data } = await sb
      .from('ai_agents_config')
      .select('model,system_prompt')
      .eq('agent_id', agentId)
      .maybeSingle();
    if (data?.model) return { model: data.model as string, systemPrompt: data.system_prompt || undefined };
  } catch (_) { /* ignore */ }
  return { model: fallbackModel };
}
