import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface GetRidoAIParams {
  feature?: string;
  taskType: string;
  query?: string;
  mode?: string;
  tenantId?: string;
  messages?: Array<{ role: string; content: string }>;
  systemPrompt?: string;
  contextHints?: Record<string, unknown>;
  toolName?: string;
  toolParams?: Record<string, unknown>;
  stream?: boolean;
  imageBase64?: string;
  maskBase64?: string;
}

interface GetRidoAIResult {
  result: string;
  _brand?: string;
  _cached?: boolean;
  _fallback?: boolean;
  error?: string;
  code?: string;
  images?: string[];
}

export function useGetRidoAI() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const execute = useCallback(async (params: GetRidoAIParams): Promise<GetRidoAIResult | null> => {
    setIsLoading(true);
    setError(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke('ai-chat', {
        body: { ...params, stream: false },
      });

      if (fnError) {
        const errMsg = fnError.message || 'Błąd GetRido AI';
        if (errMsg.includes('429')) {
          toast.error('Zbyt wiele zapytań AI. Spróbuj ponownie za chwilę.');
        } else if (errMsg.includes('402')) {
          toast.error('Brak środków na AI. Doładuj konto.');
        } else {
          toast.error('Błąd GetRido AI');
        }
        setError(errMsg);
        return null;
      }

      return data;
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Nieznany błąd';
      setError(msg);
      toast.error('Błąd połączenia z GetRido AI');
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const streamExecute = useCallback(async (
    params: GetRidoAIParams,
    onDelta: (text: string) => void,
    onDone: () => void,
  ) => {
    setIsLoading(true);
    setError(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({ ...params, stream: true }),
      });

      if (!resp.ok || !resp.body) {
        throw new Error('Failed to start stream');
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let textBuffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        textBuffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = textBuffer.indexOf('\n')) !== -1) {
          let line = textBuffer.slice(0, newlineIndex);
          textBuffer = textBuffer.slice(newlineIndex + 1);

          if (line.endsWith('\r')) line = line.slice(0, -1);
          if (line.startsWith(':') || line.trim() === '') continue;
          if (!line.startsWith('data: ')) continue;

          const jsonStr = line.slice(6).trim();
          if (jsonStr === '[DONE]') break;

          try {
            const parsed = JSON.parse(jsonStr);
            // Support both OpenAI and Anthropic streaming formats
            const content = parsed?.delta?.text || parsed?.choices?.[0]?.delta?.content || '';
            if (content) onDelta(content);
          } catch {
            textBuffer = line + '\n' + textBuffer;
            break;
          }
        }
      }

      onDone();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Stream error';
      setError(msg);
      onDelta('\n\n⚠️ Błąd połączenia. Sprawdź konfigurację w Centrum AI.');
      onDone();
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { execute, streamExecute, isLoading, error };
}
