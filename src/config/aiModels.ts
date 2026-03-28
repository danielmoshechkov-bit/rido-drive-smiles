/**
 * Centralna lista modeli AI dostępnych w portalu GetRido.
 * Jedno źródło prawdy — importuj we wszystkich panelach.
 *
 * Modele pogrupowane wg dostawcy:
 * - lovable: dostępne przez Lovable AI Gateway (LOVABLE_API_KEY) — zawsze aktywne
 * - anthropic: wymagają ANTHROPIC_API_KEY
 * - kimi: wymagają KIMI_API_KEY
 */

export interface AIModel {
  value: string;
  label: string;
  provider: 'lovable' | 'anthropic' | 'kimi';
  speed: 'fast' | 'balanced' | 'slow';
  tier: 'budget' | 'standard' | 'premium';
}

export const AI_MODELS: AIModel[] = [
  // Lovable AI Gateway — Google
  { value: 'google/gemini-3-flash-preview', label: 'Gemini 3 Flash (szybki, zalecany)', provider: 'lovable', speed: 'fast', tier: 'standard' },
  { value: 'google/gemini-2.5-flash', label: 'Gemini 2.5 Flash', provider: 'lovable', speed: 'fast', tier: 'budget' },
  { value: 'google/gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite (najtańszy)', provider: 'lovable', speed: 'fast', tier: 'budget' },
  { value: 'google/gemini-2.5-pro', label: 'Gemini 2.5 Pro', provider: 'lovable', speed: 'slow', tier: 'premium' },
  { value: 'google/gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro (najnowszy)', provider: 'lovable', speed: 'balanced', tier: 'premium' },

  // Lovable AI Gateway — OpenAI
  { value: 'openai/gpt-5-nano', label: 'GPT-5 Nano (najtańszy)', provider: 'lovable', speed: 'fast', tier: 'budget' },
  { value: 'openai/gpt-5-mini', label: 'GPT-5 Mini', provider: 'lovable', speed: 'fast', tier: 'standard' },
  { value: 'openai/gpt-5', label: 'GPT-5', provider: 'lovable', speed: 'balanced', tier: 'premium' },
  { value: 'openai/gpt-5.2', label: 'GPT-5.2 (najnowszy)', provider: 'lovable', speed: 'slow', tier: 'premium' },

  // Anthropic (własny klucz ANTHROPIC_API_KEY)
  { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5 (szybki)', provider: 'anthropic', speed: 'fast', tier: 'budget' },
  { value: 'claude-sonnet-4-6', label: 'Claude Sonnet 4', provider: 'anthropic', speed: 'balanced', tier: 'standard' },

  // Kimi / Moonshot (własny klucz KIMI_API_KEY)
  { value: 'moonshot-v1-8k', label: 'Kimi Moonshot v1', provider: 'kimi', speed: 'fast', tier: 'standard' },
];

/** Domyślny model do nowych konfiguracji */
export const DEFAULT_AI_MODEL = 'google/gemini-3-flash-preview';

/** Pobierz label modelu po wartości */
export function getModelLabel(value: string): string {
  return AI_MODELS.find(m => m.value === value)?.label ?? value;
}
