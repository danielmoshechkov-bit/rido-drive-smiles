import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export const SUPPORTED_LANGUAGES = [
  { code: "pl", label: "Polski", flag: "🇵🇱" },
  { code: "en", label: "English", flag: "🇬🇧" },
  { code: "de", label: "Deutsch", flag: "🇩🇪" },
  { code: "fr", label: "Français", flag: "🇫🇷" },
  { code: "es", label: "Español", flag: "🇪🇸" },
  { code: "ru", label: "Русский", flag: "🇷🇺" },
  { code: "uk", label: "Українська", flag: "🇺🇦" },
  { code: "cs", label: "Čeština", flag: "🇨🇿" },
  { code: "sk", label: "Slovenčina", flag: "🇸🇰" },
  { code: "ro", label: "Română", flag: "🇷🇴" },
  { code: "hu", label: "Magyar", flag: "🇭🇺" },
  { code: "it", label: "Italiano", flag: "🇮🇹" },
  { code: "nl", label: "Nederlands", flag: "🇳🇱" },
  { code: "pt", label: "Português", flag: "🇵🇹" },
  { code: "tr", label: "Türkçe", flag: "🇹🇷" },
  { code: "ar", label: "العربية", flag: "🇸🇦" },
  { code: "zh", label: "中文", flag: "🇨🇳" },
  { code: "ja", label: "日本語", flag: "🇯🇵" },
  { code: "ko", label: "한국어", flag: "🇰🇷" },
  { code: "hi", label: "हिन्दी", flag: "🇮🇳" },
] as const;

interface TranslationResult {
  translated_text: string;
  source_language: string;
  from_cache: boolean;
}

export function useMessageTranslation() {
  const [translations, setTranslations] = useState<Record<string, TranslationResult>>({});
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [showOriginal, setShowOriginal] = useState<Record<string, boolean>>({});

  const translateMessage = useCallback(async (
    messageId: string,
    text: string,
    targetLanguage: string,
    sourceLanguage?: string
  ): Promise<TranslationResult | null> => {
    const cacheKey = `${messageId}_${targetLanguage}`;

    // Already have it
    if (translations[cacheKey]) return translations[cacheKey];

    setLoading(prev => ({ ...prev, [cacheKey]: true }));

    try {
      const { data, error } = await supabase.functions.invoke("translate-message", {
        body: {
          message_id: messageId,
          text,
          target_language: targetLanguage,
          source_language: sourceLanguage,
        },
      });

      if (error) throw error;

      const result = data as TranslationResult;
      setTranslations(prev => ({ ...prev, [cacheKey]: result }));
      return result;
    } catch (e) {
      console.error("Translation error:", e);
      return null;
    } finally {
      setLoading(prev => ({ ...prev, [cacheKey]: false }));
    }
  }, [translations]);

  const toggleOriginal = useCallback((messageId: string) => {
    setShowOriginal(prev => ({ ...prev, [messageId]: !prev[messageId] }));
  }, []);

  const getTranslation = useCallback((messageId: string, targetLanguage: string) => {
    return translations[`${messageId}_${targetLanguage}`] || null;
  }, [translations]);

  const isLoading = useCallback((messageId: string, targetLanguage: string) => {
    return loading[`${messageId}_${targetLanguage}`] || false;
  }, [loading]);

  const isShowingOriginal = useCallback((messageId: string) => {
    return showOriginal[messageId] || false;
  }, [showOriginal]);

  return {
    translateMessage,
    getTranslation,
    isLoading,
    toggleOriginal,
    isShowingOriginal,
  };
}
