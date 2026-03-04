import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.56.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface AIRequest {
  feature: string; // ai_search, ai_help, ai_ocr, ai_image, ai_description, ai_invoice, ai_agent, ai_tools
  taskType: string; // text, image, ocr, search
  query: string;
  mode?: string; // fast, accurate, action
  tenantId?: string;
  messages?: Array<{ role: string; content: string }>;
  systemPrompt?: string;
  contextHints?: Record<string, unknown>;
  toolName?: string;
  toolParams?: Record<string, unknown>;
  stream?: boolean;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

  let userId: string | null = null;
  let logId: string | null = null;
  const startTime = Date.now();

  try {
    // Auth (optional - some features may be public)
    const authHeader = req.headers.get("Authorization");
    if (authHeader) {
      const token = authHeader.replace("Bearer ", "");
      const { data: { user } } = await supabase.auth.getUser(token);
      userId = user?.id || null;
    }

    const body: AIRequest = await req.json();
    const { feature, taskType, query, mode = "fast", tenantId, messages, systemPrompt, contextHints, toolName, toolParams, stream = false } = body;

    if (!feature || !taskType) {
      throw new Error("Wymagane parametry: feature, taskType");
    }

    // 1) Check feature flag
    const featureFlagKey = mapFeatureToFlag(feature);
    const { data: flag } = await supabase
      .from("ai_feature_flags")
      .select("is_enabled")
      .eq("flag_key", featureFlagKey)
      .maybeSingle();

    if (flag && !flag.is_enabled) {
      return new Response(JSON.stringify({ error: "Funkcja AI wyłączona", code: "FEATURE_DISABLED" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Also check engine flag
    const { data: engineFlag } = await supabase
      .from("ai_feature_flags")
      .select("is_enabled")
      .eq("flag_key", "ai_engine_enabled")
      .maybeSingle();

    if (engineFlag && !engineFlag.is_enabled) {
      return new Response(JSON.stringify({ error: "GetRido AI Engine wyłączony", code: "ENGINE_DISABLED" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2) Check limits
    const limitCheck = await checkLimits(supabase, userId, tenantId);
    if (!limitCheck.allowed) {
      return new Response(JSON.stringify({ error: limitCheck.message, code: "LIMIT_EXCEEDED" }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3) Check cache
    const cacheKey = generateCacheKey(tenantId || "", feature, query || "", mode);
    const { data: cached } = await supabase
      .from("ai_response_cache")
      .select("response_data")
      .eq("cache_key", cacheKey)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();

    if (cached) {
      // Log cache hit
      await logRequest(supabase, {
        actor_user_id: userId,
        tenant_id: tenantId,
        feature, task_type: taskType, mode,
        provider: "cache", model: "cache",
        status: "success", cache_hit: true,
        response_time_ms: Date.now() - startTime,
      });
      return new Response(JSON.stringify({ ...cached.response_data, _cached: true, _brand: "GetRido AI" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 4) Get routing
    const { data: routing } = await supabase
      .from("ai_routing_rules")
      .select("primary_provider_key, secondary_provider_key, allow_fallback")
      .eq("task_type", taskType)
      .maybeSingle();

    const providerKey = routing?.primary_provider_key || "lovable";

    // 5) Get provider config
    const { data: provider } = await supabase
      .from("ai_providers")
      .select("*")
      .eq("provider_key", providerKey)
      .eq("is_enabled", true)
      .maybeSingle();

    // Determine API key and URL
    let apiKey = LOVABLE_API_KEY;
    let apiUrl = "https://ai.gateway.lovable.dev/v1/chat/completions";
    let model = "google/gemini-3-flash-preview";

    if (provider) {
      if (provider.provider_key === "openai" && provider.api_key_encrypted) {
        apiKey = provider.api_key_encrypted;
        apiUrl = "https://api.openai.com/v1/chat/completions";
        model = provider.default_model || "gpt-4o";
      } else if (provider.provider_key === "kimi" && provider.api_key_encrypted) {
        apiKey = provider.api_key_encrypted;
        apiUrl = "https://api.moonshot.cn/v1/chat/completions";
        model = provider.default_model || "moonshot-v1-8k";
      } else if (provider.provider_key === "gemini" && provider.api_key_encrypted) {
        // Use Lovable gateway with Gemini model
        model = provider.default_model || "google/gemini-3-flash-preview";
      } else if (provider.default_model) {
        model = provider.default_model;
      }
    }

    // Mode affects model selection
    if (mode === "accurate" && model.includes("flash")) {
      model = model.replace("flash", "pro");
    }

    if (!apiKey) {
      throw new Error("Brak klucza API. Skonfiguruj dostawcę AI w AI Hub.");
    }

    // 6) Get context
    let contextPrompt = "";
    if (tenantId) {
      const { data: tenantCtx } = await supabase
        .from("ai_tenant_context")
        .select("business_description, industry, pricing_notes, language")
        .eq("entity_id", tenantId)
        .maybeSingle();
      if (tenantCtx) {
        contextPrompt += `\nKontekst firmy: ${tenantCtx.business_description || ""} (branża: ${tenantCtx.industry || "nieznana"})`;
      }
    }
    if (userId) {
      const { data: userCtx } = await supabase
        .from("ai_user_context")
        .select("preferred_language, response_style")
        .eq("user_id", userId)
        .maybeSingle();
      if (userCtx) {
        contextPrompt += `\nStyl odpowiedzi: ${userCtx.response_style || "balanced"}. Język: ${userCtx.preferred_language || "pl"}`;
      }
    }

    // 7) Build messages
    const aiMessages: Array<{ role: string; content: string }> = [];

    const baseSystemPrompt = systemPrompt || "Jesteś asystentem GetRido AI. Odpowiadaj po polsku, zwięźle i pomocnie. Nigdy nie wspominaj o OpenAI, Gemini ani żadnych dostawcach AI – jesteś GetRido AI.";
    aiMessages.push({ role: "system", content: baseSystemPrompt + contextPrompt });

    if (messages && messages.length > 0) {
      aiMessages.push(...messages);
    } else if (query) {
      aiMessages.push({ role: "user", content: query });
    }

    // 8) Handle tools/actions
    let toolsPayload: unknown = undefined;
    let toolChoice: unknown = undefined;
    if (toolName && feature === "ai_tools") {
      toolsPayload = getToolDefinitions(toolName);
      toolChoice = { type: "function", function: { name: toolName } };
    }

    // 9) Call AI
    const aiBody: Record<string, unknown> = {
      model,
      messages: aiMessages,
      stream: stream,
    };
    if (toolsPayload) {
      aiBody.tools = toolsPayload;
      aiBody.tool_choice = toolChoice;
    }

    const aiResponse = await fetch(apiUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(aiBody),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error(`[GetRido AI] Provider error ${aiResponse.status}:`, errText);

      // Try fallback if allowed
      if (routing?.allow_fallback && routing.secondary_provider_key) {
        console.log("[GetRido AI] Attempting fallback...");
        // Simplified fallback - use Lovable gateway
        const fallbackResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ model: "google/gemini-3-flash-preview", messages: aiMessages }),
        });

        if (fallbackResponse.ok) {
          const fbData = await fallbackResponse.json();
          const result = extractResult(fbData);
          await logRequest(supabase, {
            actor_user_id: userId, tenant_id: tenantId,
            feature, task_type: taskType, mode,
            provider: "lovable", model: "google/gemini-3-flash-preview",
            status: "success", cache_hit: false,
            response_time_ms: Date.now() - startTime,
            tokens_in: fbData.usage?.prompt_tokens,
            tokens_out: fbData.usage?.completion_tokens,
          });
          return new Response(JSON.stringify({ result, _brand: "GetRido AI", _fallback: true }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }

      if (aiResponse.status === 429) {
        await logRequest(supabase, {
          actor_user_id: userId, tenant_id: tenantId,
          feature, task_type: taskType, mode,
          provider: providerKey, model, status: "failed",
          error_message: "Rate limit exceeded",
          response_time_ms: Date.now() - startTime,
        });
        return new Response(JSON.stringify({ error: "Zbyt wiele zapytań. Spróbuj ponownie za chwilę.", code: "RATE_LIMITED" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ error: "Brak środków na AI. Doładuj konto.", code: "PAYMENT_REQUIRED" }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      throw new Error(`AI provider error: ${aiResponse.status}`);
    }

    // 10) Stream or JSON response
    if (stream) {
      await logRequest(supabase, {
        actor_user_id: userId, tenant_id: tenantId,
        feature, task_type: taskType, mode,
        provider: providerKey, model, status: "success",
        cache_hit: false, response_time_ms: Date.now() - startTime,
      });
      return new Response(aiResponse.body, {
        headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
      });
    }

    const data = await aiResponse.json();
    const result = extractResult(data);
    const responseTime = Date.now() - startTime;

    // 11) Log
    await logRequest(supabase, {
      actor_user_id: userId, tenant_id: tenantId,
      feature, task_type: taskType, mode,
      provider: providerKey, model, status: "success",
      cache_hit: false, response_time_ms: responseTime,
      tokens_in: data.usage?.prompt_tokens,
      tokens_out: data.usage?.completion_tokens,
      cost_estimate: estimateCost(data.usage?.prompt_tokens, data.usage?.completion_tokens, model),
    });

    // 12) Cache (for expensive operations, 15-60 min)
    if (query && mode !== "action") {
      const cacheTTL = mode === "accurate" ? 60 : 15; // minutes
      await supabase.from("ai_response_cache").upsert({
        cache_key: cacheKey,
        tenant_id: tenantId || null,
        feature,
        query_hash: simpleHash(query),
        mode,
        response_data: { result },
        expires_at: new Date(Date.now() + cacheTTL * 60 * 1000).toISOString(),
      }, { onConflict: "cache_key" }).select();
    }

    return new Response(JSON.stringify({ result, _brand: "GetRido AI" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e) {
    console.error("[GetRido AI Engine] Error:", e);
    // Log failure
    try {
      await logRequest(supabase, {
        actor_user_id: userId,
        feature: "unknown", task_type: "unknown", mode: "fast",
        provider: "unknown", model: "unknown", status: "failed",
        error_message: e instanceof Error ? e.message : "Unknown error",
        response_time_ms: Date.now() - startTime,
      });
    } catch (_) { /* ignore logging errors */ }

    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Błąd GetRido AI", _brand: "GetRido AI" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// === Helper Functions ===

function mapFeatureToFlag(feature: string): string {
  const map: Record<string, string> = {
    ai_search: "ai_search_enabled",
    ai_help: "ai_text_enabled",
    ai_chat: "ai_text_enabled",
    ai_description: "ai_text_enabled",
    ai_ocr: "ai_ocr_enabled",
    ai_image: "ai_image_enabled",
    ai_invoice: "ai_text_enabled",
    ai_agent: "ai_agents_enabled",
    ai_tools: "ai_tools_enabled",
    ai_planner: "ai_planner_enabled",
    ai_rag: "ai_rag_enabled",
    ai_seo: "ai_text_enabled",
  };
  return map[feature] || "ai_engine_enabled";
}

function extractResult(data: any): string {
  if (data.choices?.[0]?.message?.tool_calls) {
    try {
      return JSON.parse(data.choices[0].message.tool_calls[0].function.arguments);
    } catch {
      return data.choices[0].message.tool_calls[0].function.arguments;
    }
  }
  return data.choices?.[0]?.message?.content || "";
}

function generateCacheKey(tenantId: string, feature: string, query: string, mode: string): string {
  return simpleHash(`${tenantId}:${feature}:${query}:${mode}`);
}

function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

function estimateCost(tokensIn?: number, tokensOut?: number, model?: string): number {
  if (!tokensIn && !tokensOut) return 0;
  // Rough estimates per 1K tokens in PLN
  const rates: Record<string, number> = {
    "gpt-4o": 0.05,
    "gpt-5": 0.08,
    "google/gemini-3-flash-preview": 0.01,
    "google/gemini-2.5-flash": 0.01,
    "google/gemini-2.5-pro": 0.04,
  };
  const rate = rates[model || ""] || 0.02;
  return Math.round(((tokensIn || 0) + (tokensOut || 0)) / 1000 * rate * 100) / 100;
}

async function checkLimits(supabase: any, userId: string | null, tenantId?: string): Promise<{ allowed: boolean; message?: string }> {
  // Get global limits
  const { data: globalLimit } = await supabase
    .from("ai_limits_config")
    .select("*")
    .eq("scope", "global")
    .is("scope_id", null)
    .maybeSingle();

  if (!globalLimit) return { allowed: true };

  // Count today's requests
  const today = new Date().toISOString().split("T")[0];
  const { count } = await supabase
    .from("ai_requests_log")
    .select("id", { count: "exact", head: true })
    .gte("created_at", today + "T00:00:00Z");

  if (globalLimit.max_requests_per_day && (count || 0) >= globalLimit.max_requests_per_day) {
    if (globalLimit.enforcement_mode === "block") {
      return { allowed: false, message: "Przekroczono dzienny limit zapytań AI" };
    }
  }

  return { allowed: true };
}

async function logRequest(supabase: any, data: Record<string, unknown>) {
  try {
    await supabase.from("ai_requests_log").insert(data);
  } catch (e) {
    console.error("[GetRido AI] Log error:", e);
  }
}

function getToolDefinitions(toolName: string): any[] {
  const tools: Record<string, any> = {
    create_task: {
      type: "function",
      function: {
        name: "create_task",
        description: "Utwórz nowe zadanie w systemie",
        parameters: {
          type: "object",
          properties: {
            title: { type: "string", description: "Tytuł zadania" },
            description: { type: "string", description: "Opis zadania" },
            priority: { type: "string", enum: ["low", "medium", "high", "critical"] },
            module: { type: "string" },
          },
          required: ["title"],
          additionalProperties: false,
        },
      },
    },
    generate_description: {
      type: "function",
      function: {
        name: "generate_description",
        description: "Wygeneruj opis ogłoszenia",
        parameters: {
          type: "object",
          properties: {
            type: { type: "string", enum: ["vehicle", "real_estate", "service"] },
            details: { type: "string" },
          },
          required: ["type", "details"],
          additionalProperties: false,
        },
      },
    },
  };
  return toolName in tools ? [tools[toolName]] : [];
}
