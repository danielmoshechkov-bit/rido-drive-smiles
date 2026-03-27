import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPPORTED_LANGUAGES: Record<string, string> = {
  pl: "Polish", en: "English", de: "German", fr: "French", es: "Spanish",
  ru: "Russian", uk: "Ukrainian", cs: "Czech", sk: "Slovak", ro: "Romanian",
  hu: "Hungarian", it: "Italian", nl: "Dutch", pt: "Portuguese", tr: "Turkish",
  ar: "Arabic", zh: "Chinese", ja: "Japanese", ko: "Korean", hi: "Hindi",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { message_id, text, target_language, source_language } = await req.json();

    if (!text || !target_language || !message_id) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const targetLangName = SUPPORTED_LANGUAGES[target_language];
    if (!targetLangName) {
      return new Response(JSON.stringify({ error: "Unsupported language" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check cache first
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: cached } = await supabase
      .from("workspace_message_translations")
      .select("translated_text, source_language")
      .eq("message_id", message_id)
      .eq("language_code", target_language)
      .single();

    if (cached) {
      return new Response(JSON.stringify({
        translated_text: cached.translated_text,
        source_language: cached.source_language,
        from_cache: true,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Call Kimi AI for translation
    const KIMI_API_KEY = Deno.env.get("KIMI_API_KEY");
    if (!KIMI_API_KEY) {
      return new Response(JSON.stringify({ error: "KIMI_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const response = await fetch("https://api.moonshot.cn/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${KIMI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "moonshot-v1-8k",
        messages: [
          {
            role: "system",
            content:
              "You are a translator. Translate the user message to the target language. Preserve @mentions, #task-links, URLs, and code blocks exactly as-is. Reply ONLY with the translated text, nothing else.",
          },
          {
            role: "user",
            content: `Translate to ${targetLangName}: ${text}`,
          },
        ],
        max_tokens: 500,
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Kimi API error:", response.status, errText);
      return new Response(JSON.stringify({ error: "Translation API error" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const translatedText = data.choices?.[0]?.message?.content?.trim();

    if (!translatedText) {
      return new Response(JSON.stringify({ error: "Empty translation" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Cache the translation
    await supabase.from("workspace_message_translations").insert({
      message_id,
      language_code: target_language,
      translated_text: translatedText,
      source_language: source_language || null,
    });

    return new Response(JSON.stringify({
      translated_text: translatedText,
      source_language: source_language || "auto",
      from_cache: false,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("translate-message error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
