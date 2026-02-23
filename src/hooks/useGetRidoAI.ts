import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface GetRidoAIParams {
  feature: string;
  taskType: string;
  query?: string;
  mode?: "fast" | "accurate" | "action";
  tenantId?: string;
  messages?: Array<{ role: string; content: string }>;
  systemPrompt?: string;
  contextHints?: Record<string, unknown>;
  toolName?: string;
  toolParams?: Record<string, unknown>;
  stream?: boolean;
}

interface GetRidoAIResult {
  result: string;
  _brand: string;
  _cached?: boolean;
  _fallback?: boolean;
  error?: string;
  code?: string;
}

export function useGetRidoAI() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const execute = useCallback(async (params: GetRidoAIParams): Promise<GetRidoAIResult | null> => {
    setIsLoading(true);
    setError(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke("getrido-ai-execute", {
        body: params,
      });

      if (fnError) {
        const errMsg = fnError.message || "Błąd GetRido AI";
        
        if (errMsg.includes("429") || errMsg.includes("RATE_LIMITED")) {
          toast.error("Zbyt wiele zapytań AI. Spróbuj ponownie za chwilę.");
        } else if (errMsg.includes("402") || errMsg.includes("PAYMENT_REQUIRED")) {
          toast.error("Brak środków na AI. Doładuj konto.");
        } else if (errMsg.includes("FEATURE_DISABLED")) {
          toast.error("Ta funkcja AI jest wyłączona.");
        } else if (errMsg.includes("ENGINE_DISABLED")) {
          toast.error("GetRido AI Engine jest wyłączony.");
        } else {
          toast.error("Błąd GetRido AI");
        }
        
        setError(errMsg);
        return null;
      }

      if (data?.error) {
        setError(data.error);
        
        if (data.code === "FEATURE_DISABLED") {
          toast.error("Ta funkcja AI jest wyłączona przez administratora.");
        } else if (data.code === "LIMIT_EXCEEDED") {
          toast.error(data.error);
        } else if (data.code !== "RATE_LIMITED" && data.code !== "PAYMENT_REQUIRED") {
          toast.error(data.error);
        }
        
        return data;
      }

      return data;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Nieznany błąd";
      setError(msg);
      toast.error("Błąd połączenia z GetRido AI");
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
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/getrido-ai-execute`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ ...params, stream: true }),
      });

      if (!resp.ok || !resp.body) {
        throw new Error("Failed to start stream");
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let textBuffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        textBuffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
          let line = textBuffer.slice(0, newlineIndex);
          textBuffer = textBuffer.slice(newlineIndex + 1);

          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (line.startsWith(":") || line.trim() === "") continue;
          if (!line.startsWith("data: ")) continue;

          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") break;

          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) onDelta(content);
          } catch {
            textBuffer = line + "\n" + textBuffer;
            break;
          }
        }
      }

      onDone();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Stream error";
      setError(msg);
      toast.error("Błąd streamu GetRido AI");
      onDone();
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { execute, streamExecute, isLoading, error };
}
