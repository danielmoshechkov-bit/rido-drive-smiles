// GetRido Maps - Voice Guidance Service (Web Speech API)

import { VoiceLanguage, VOICE_LANG_MAP, buildPhrase, VoicePhrases } from './voicePhrases';

export interface VoiceSettings {
  enabled: boolean;
  language: VoiceLanguage;
  volume: number; // 0-100
  rate: number;   // 0.8-1.2
}

interface VoiceState {
  initialized: boolean;
  enabled: boolean;
  settings: VoiceSettings;
  lastSpokenAt: number;
  availableVoices: SpeechSynthesisVoice[];
}

const DEFAULT_SETTINGS: VoiceSettings = {
  enabled: true,
  language: 'pl',
  volume: 80,
  rate: 1.0,
};

// Throttle: minimum time between voice commands (ms)
const MIN_COMMAND_INTERVAL = 2500;

let state: VoiceState = {
  initialized: false,
  enabled: true,
  settings: { ...DEFAULT_SETTINGS },
  lastSpokenAt: 0,
  availableVoices: [],
};

// Find best voice for language
function findVoiceForLanguage(lang: VoiceLanguage): SpeechSynthesisVoice | null {
  const locale = VOICE_LANG_MAP[lang];
  const langPrefix = locale.split('-')[0];
  
  // Priority: exact match > language prefix > any available
  let voice = state.availableVoices.find(v => v.lang === locale);
  if (!voice) {
    voice = state.availableVoices.find(v => v.lang.startsWith(langPrefix));
  }
  if (!voice && state.availableVoices.length > 0) {
    // Fallback to first available (usually system default)
    voice = state.availableVoices[0];
    console.warn(`[Voice] No voice for ${lang}, using fallback: ${voice.name}`);
  }
  
  return voice || null;
}

// Initialize voices
export function initVoices(): Promise<boolean> {
  return new Promise((resolve) => {
    if (!('speechSynthesis' in window)) {
      console.warn('[Voice] Web Speech API not supported');
      state.initialized = true;
      state.enabled = false;
      resolve(false);
      return;
    }

    const loadVoices = () => {
      state.availableVoices = speechSynthesis.getVoices();
      state.initialized = true;
      console.log(`[Voice] Loaded ${state.availableVoices.length} voices`);
      resolve(state.availableVoices.length > 0);
    };

    // Chrome loads voices async
    if (speechSynthesis.onvoiceschanged !== undefined) {
      speechSynthesis.onvoiceschanged = loadVoices;
    }
    
    // Try immediate load (Safari, Firefox)
    const voices = speechSynthesis.getVoices();
    if (voices.length > 0) {
      state.availableVoices = voices;
      state.initialized = true;
      resolve(true);
    } else {
      // Wait for async load
      setTimeout(() => {
        if (!state.initialized) {
          loadVoices();
        }
      }, 100);
    }
  });
}

// Speak text
export function speak(text: string, options?: Partial<VoiceSettings>): boolean {
  if (!state.initialized) {
    initVoices();
  }
  
  if (!state.enabled || !('speechSynthesis' in window)) {
    return false;
  }
  
  const settings = { ...state.settings, ...options };
  
  // Throttle check
  const now = Date.now();
  if (now - state.lastSpokenAt < MIN_COMMAND_INTERVAL) {
    console.log('[Voice] Throttled, skipping:', text);
    return false;
  }
  
  // Cancel any ongoing speech
  speechSynthesis.cancel();
  
  const utterance = new SpeechSynthesisUtterance(text);
  
  // Set voice
  const voice = findVoiceForLanguage(settings.language);
  if (voice) {
    utterance.voice = voice;
    utterance.lang = voice.lang;
  }
  
  // Set parameters
  utterance.volume = settings.volume / 100;
  utterance.rate = settings.rate;
  utterance.pitch = 1;
  
  // Event handlers
  utterance.onstart = () => {
    state.lastSpokenAt = Date.now();
  };
  
  utterance.onerror = (e) => {
    console.error('[Voice] Speech error:', e);
  };
  
  try {
    speechSynthesis.speak(utterance);
    console.log('[Voice] Speaking:', text);
    return true;
  } catch (e) {
    console.error('[Voice] Failed to speak:', e);
    return false;
  }
}

// Speak a phrase from the phrases dictionary
export function speakPhrase(
  key: keyof VoicePhrases,
  replacements?: Record<string, string | number>,
  options?: Partial<VoiceSettings>
): boolean {
  const lang = options?.language || state.settings.language;
  const text = buildPhrase(lang, key, replacements);
  return speak(text, options);
}

// Cancel ongoing speech
export function cancel(): void {
  if ('speechSynthesis' in window) {
    speechSynthesis.cancel();
    console.log('[Voice] Cancelled');
  }
}

// Set enabled state
export function setEnabled(enabled: boolean): void {
  state.enabled = enabled;
  if (!enabled) {
    cancel();
  }
  console.log('[Voice] Enabled:', enabled);
}

// Update settings
export function updateSettings(settings: Partial<VoiceSettings>): void {
  state.settings = { ...state.settings, ...settings };
  console.log('[Voice] Settings updated:', state.settings);
}

// Get current settings
export function getSettings(): VoiceSettings {
  return { ...state.settings };
}

// Get available voices for a language
export function getAvailableVoicesForLanguage(lang: VoiceLanguage): SpeechSynthesisVoice[] {
  const langPrefix = VOICE_LANG_MAP[lang].split('-')[0];
  return state.availableVoices.filter(v => v.lang.startsWith(langPrefix));
}

// Check if voice is available
export function isVoiceAvailable(): boolean {
  return state.initialized && state.availableVoices.length > 0;
}

// Re-export for convenience
export { type VoiceLanguage } from './voicePhrases';
