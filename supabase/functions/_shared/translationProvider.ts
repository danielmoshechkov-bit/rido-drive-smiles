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

export type Provider = 'anthropic' | 'gemini' | 'kimi';

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
    'You are a professional translator. Use correct professional domain terminology ' +
    '(especially automotive parts/repair and real-estate vocabulary). Keep brand names, ' +
    'model codes, OE/part numbers, prices, units and URLs EXACTLY as in the source. ' +
    'Never transliterate part codes.';

  const numbered = texts.map((t, i) => `[${i + 1}] ${t}`).join('\n---\n');
  const userPrompt =
`Translate each numbered text from ${sourceName} to ${targetName}.
${domainLine}
Rules:
- Translate naturally and professionally.
- Preserve part names, brand names, model codes, numbers and prices EXACTLY.
- Output ONLY a valid JSON object with numeric string keys "1","2",… mapping to the translated text. No markdown, no commentary.

Texts:
${numbered}`;

  try {
    let raw = '{}';

    if (provider === 'anthropic') {
      const key = Deno.env.get('ANTHROPIC_API_KEY');
      if (!key) throw new Error('ANTHROPIC_API_KEY missing');
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model,
          max_tokens: 4096,
          system,
          messages: [{ role: 'user', content: userPrompt + '\n\nReturn ONLY JSON.' }],
        }),
      });
      if (!r.ok) throw new Error(`Anthropic ${r.status}: ${await r.text()}`);
      const d = await r.json();
      raw = d.content?.[0]?.text?.trim() || '{}';
    } else if (provider === 'gemini') {
      // Lovable AI Gateway (Google Gemini / OpenAI — OpenAI-compatible)
      const key = Deno.env.get('LOVABLE_API_KEY');
      if (!key) throw new Error('LOVABLE_API_KEY missing');
      const gwModel = /^(google|openai)\//.test(model) ? model : `google/${model}`;
      const r = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
        body: JSON.stringify({
          model: gwModel,
          messages: [{ role: 'system', content: system }, { role: 'user', content: userPrompt }],
          response_format: { type: 'json_object' },
        }),
      });
      if (!r.ok) throw new Error(`Lovable ${r.status}: ${await r.text()}`);
      const d = await r.json();
      raw = d.choices?.[0]?.message?.content?.trim() || '{}';
    } else {
      // Kimi / Moonshot (default)
      const key = Deno.env.get('MOONSHOT_API_KEY') || Deno.env.get('KIMI_API_KEY');
      if (!key) throw new Error('MOONSHOT_API_KEY/KIMI_API_KEY missing');
      const r = await fetch('https://api.moonshot.ai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
        body: JSON.stringify({
          model,
          messages: [{ role: 'system', content: system }, { role: 'user', content: userPrompt }],
          max_tokens: 4096,
          temperature: 0.1,
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

/** Odczyt aktywnego modelu agenta z ai_agents_config (z domyślnym Haiku). */
export async function resolveModel(
  sb: { from: (t: string) => any },
  agentId = 'content_translation',
  fallback = 'claude-haiku-4-5-20251001',
): Promise<string> {
  try {
    const { data } = await sb
      .from('ai_agents_config')
      .select('model,is_active')
      .eq('agent_id', agentId)
      .maybeSingle();
    if (data?.model) return data.model as string;
  } catch (_) { /* ignore */ }
  return fallback;
}
