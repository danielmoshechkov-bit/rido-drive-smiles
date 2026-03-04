import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.56.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface AIRequest {
  feature: string;
  taskType: string;
  query: string;
  mode?: string; // rido_chat, rido_code, rido_create, rido_vision, rido_pro
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
  const startTime = Date.now();

  try {
    // Auth (optional)
    const authHeader = req.headers.get("Authorization");
    if (authHeader) {
      const token = authHeader.replace("Bearer ", "");
      const { data: { user } } = await supabase.auth.getUser(token);
      userId = user?.id || null;
    }

    const body: AIRequest = await req.json();
    const { feature, taskType, query, mode = "rido_chat", tenantId, messages, systemPrompt, contextHints, toolName, toolParams, stream = false } = body;

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
      return jsonResponse({ error: "Funkcja AI wyłączona", code: "FEATURE_DISABLED" }, 403);
    }

    // Check engine flag
    const { data: engineFlag } = await supabase
      .from("ai_feature_flags")
      .select("is_enabled")
      .eq("flag_key", "ai_engine_enabled")
      .maybeSingle();

    if (engineFlag && !engineFlag.is_enabled) {
      return jsonResponse({ error: "GetRido AI Engine wyłączony", code: "ENGINE_DISABLED" }, 403);
    }

    // 2) Check limits
    const limitCheck = await checkLimits(supabase, userId, tenantId);
    if (!limitCheck.allowed) {
      return jsonResponse({ error: limitCheck.message, code: "LIMIT_EXCEEDED" }, 429);
    }

    // 3) Check cache (skip for streaming chat)
    if (!stream && query) {
      const cacheKey = generateCacheKey(tenantId || "", feature, query, mode);
      const { data: cached } = await supabase
        .from("ai_response_cache")
        .select("response_data")
        .eq("cache_key", cacheKey)
        .gt("expires_at", new Date().toISOString())
        .maybeSingle();

      if (cached) {
        await logRequest(supabase, {
          actor_user_id: userId, tenant_id: tenantId,
          feature, task_type: taskType, mode,
          provider: "cache", model: "cache",
          status: "success", cache_hit: true,
          response_time_ms: Date.now() - startTime,
        });
        return jsonResponse({ ...cached.response_data, _cached: true, _brand: "Rido AI" });
      }
    }

    // 4) Get routing mode config
    const { data: routingMode } = await supabase
      .from("ai_routing_modes")
      .select("*")
      .eq("mode_key", mode)
      .eq("is_enabled", true)
      .maybeSingle();

    // 4b) Load provider API keys from DB for non-lovable providers
    const { data: providers } = await supabase
      .from("ai_providers")
      .select("provider_key, api_key_encrypted, default_model, is_enabled")
      .eq("is_enabled", true);
    
    const providerKeys: Record<string, string> = {};
    if (providers) {
      for (const p of providers) {
        if (p.api_key_encrypted) providerKeys[p.provider_key] = p.api_key_encrypted;
      }
    }

    // 5) Analyze complexity for smart routing
    const complexity = analyzeComplexity(query || "", messages);

    // 6) Determine provider, model, and system prompt based on mode + complexity
    const routing = resolveRouting(routingMode, complexity, LOVABLE_API_KEY, providerKeys);
    
    // Allow custom system prompt to override mode default
    const finalSystemPrompt = systemPrompt || routing.systemPrompt;

    // 7) Build context
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

    // 8) Build messages
    const aiMessages: Array<{ role: string; content: string }> = [];
    aiMessages.push({ role: "system", content: finalSystemPrompt + contextPrompt });

    if (messages && messages.length > 0) {
      // Filter out any system messages from client (we set our own)
      const clientMessages = messages.filter(m => m.role !== 'system');
      aiMessages.push(...clientMessages);
    } else if (query) {
      aiMessages.push({ role: "user", content: query });
    }

    // 9) Handle image generation for rido_create
    if ((mode === "rido_create" && taskType === "image") || feature === "ai_image") {
      const imageResult = await generateImage(query, LOVABLE_API_KEY);
      
      await logRequest(supabase, {
        actor_user_id: userId, tenant_id: tenantId,
        feature: "ai_image", task_type: "image", mode,
        provider: "lovable", model: "google/gemini-2.5-flash-image",
        status: imageResult.ok ? "success" : "failed",
        cache_hit: false, response_time_ms: Date.now() - startTime,
      });

      if (imageResult.ok) {
        return jsonResponse({
          result: imageResult.text || "Oto Twoja grafika! 🎨",
          images: imageResult.images,
          _brand: "Rido AI",
          _mode: mode,
          _model: "google/gemini-2.5-flash-image",
        });
      }
      // Fall through to text if image gen fails
      console.warn("[Rido AI] Image generation failed, falling back to text");
    }

    // 9b) Handle tools/actions
    let toolsPayload: unknown = undefined;
    let toolChoice: unknown = undefined;
    if (toolName && feature === "ai_tools") {
      toolsPayload = getToolDefinitions(toolName);
      toolChoice = { type: "function", function: { name: toolName } };
    }

    // 10) Call AI with fallback chain
    const result = await callWithFallback(
      routing, aiMessages, stream, toolsPayload, toolChoice, LOVABLE_API_KEY
    );

    if (!result.ok) {
      // Handle specific error codes
      if (result.status === 429) {
        await logRequest(supabase, {
          actor_user_id: userId, tenant_id: tenantId,
          feature, task_type: taskType, mode,
          provider: result.usedProvider, model: result.usedModel, status: "failed",
          error_message: "Rate limit exceeded",
          response_time_ms: Date.now() - startTime,
        });
        return jsonResponse({ error: "Zbyt wiele zapytań. Spróbuj ponownie za chwilę.", code: "RATE_LIMITED" }, 429);
      }
      if (result.status === 402) {
        return jsonResponse({ error: "Brak środków na AI. Doładuj konto.", code: "PAYMENT_REQUIRED" }, 402);
      }
      throw new Error(`AI provider error: ${result.status} - ${result.errorText}`);
    }

    // 11) Stream or JSON response
    if (stream && result.response) {
      await logRequest(supabase, {
        actor_user_id: userId, tenant_id: tenantId,
        feature, task_type: taskType, mode,
        provider: result.usedProvider, model: result.usedModel, status: "success",
        cache_hit: false, response_time_ms: Date.now() - startTime,
      });
      return new Response(result.response.body, {
        headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
      });
    }

    const data = result.data;
    const textResult = extractResult(data);
    const responseTime = Date.now() - startTime;

    // 12) Log
    await logRequest(supabase, {
      actor_user_id: userId, tenant_id: tenantId,
      feature, task_type: taskType, mode,
      provider: result.usedProvider, model: result.usedModel,
      status: "success", cache_hit: false,
      response_time_ms: responseTime,
      tokens_in: data?.usage?.prompt_tokens,
      tokens_out: data?.usage?.completion_tokens,
      cost_estimate: estimateCost(data?.usage?.prompt_tokens, data?.usage?.completion_tokens, result.usedModel),
    });

    // 13) Cache
    const cacheTTL = routingMode?.cache_ttl_minutes || 15;
    if (query && !stream && cacheTTL > 0) {
      const cacheKey = generateCacheKey(tenantId || "", feature, query, mode);
      await supabase.from("ai_response_cache").upsert({
        cache_key: cacheKey,
        tenant_id: tenantId || null,
        feature,
        query_hash: simpleHash(query),
        mode,
        response_data: { result: textResult },
        expires_at: new Date(Date.now() + cacheTTL * 60 * 1000).toISOString(),
      }, { onConflict: "cache_key" }).select();
    }

    return jsonResponse({
      result: textResult,
      _brand: "Rido AI",
      _mode: mode,
      _model: result.usedModel,
      _fallback: result.usedFallback,
      _complexity: complexity,
      _time_ms: responseTime,
    });

  } catch (e) {
    console.error("[Rido AI Engine] Error:", e);
    try {
      await logRequest(supabase, {
        actor_user_id: userId,
        feature: "unknown", task_type: "unknown", mode: "rido_chat",
        provider: "unknown", model: "unknown", status: "failed",
        error_message: e instanceof Error ? e.message : "Unknown error",
        response_time_ms: Date.now() - startTime,
      });
    } catch (_) { /* ignore */ }

    return jsonResponse({ error: e instanceof Error ? e.message : "Błąd Rido AI", _brand: "Rido AI" }, 500);
  }
});

// === IMAGE GENERATION ===
async function generateImage(prompt: string, apiKey: string | undefined): Promise<{ ok: boolean; images?: string[]; text?: string }> {
  if (!apiKey) return { ok: false };
  
  try {
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-image",
        messages: [
          { role: "user", content: prompt }
        ],
        modalities: ["image", "text"],
      }),
    });

    if (!response.ok) {
      console.error("[Rido AI] Image gen error:", response.status);
      return { ok: false };
    }

    const data = await response.json();
    const message = data.choices?.[0]?.message;
    const text = message?.content || "";
    const images = (message?.images || []).map((img: any) => img?.image_url?.url).filter(Boolean);

    if (images.length === 0) return { ok: false };
    return { ok: true, images, text };
  } catch (e) {
    console.error("[Rido AI] Image gen exception:", e);
    return { ok: false };
  }
}

// === HELPER: JSON Response with CORS ===
function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// === COMPLEXITY ANALYSIS ===
function analyzeComplexity(query: string, messages?: Array<{ role: string; content: string }>): number {
  let score = 0;
  const text = query.toLowerCase();
  const totalLength = (messages || []).reduce((acc, m) => acc + m.content.length, 0) + query.length;

  // Length-based scoring
  if (totalLength > 2000) score += 3;
  else if (totalLength > 500) score += 1;

  // Code indicators
  if (/```|function |class |import |const |=>|async |await /.test(text)) score += 2;
  if (/debug|error|bug|fix|refactor/.test(text)) score += 1;

  // Complexity indicators
  if (/analizuj|przeanalizuj|porównaj|compare|analyze|research|zbadaj/.test(text)) score += 2;
  if (/stwórz.*aplikacj|zbuduj.*system|zaprojektuj|architektur/.test(text)) score += 3;
  
  // Multi-step / detailed requests
  if (/krok po kroku|step by step|szczegółow|dokładn/.test(text)) score += 1;
  
  // Simple queries
  if (totalLength < 50 && !/\n/.test(query)) score = Math.max(0, score - 1);

  // Conversation depth (more messages = more complex context)
  if (messages && messages.length > 10) score += 2;
  else if (messages && messages.length > 4) score += 1;

  return Math.min(10, score);
}

// === ROUTING RESOLVER ===
interface RoutingResult {
  apiUrl: string;
  apiKey: string | undefined;
  model: string;
  systemPrompt: string;
  provider: string;
  fallbackApiUrl: string;
  fallbackApiKey: string | undefined;
  fallbackModel: string;
  fallbackProvider: string;
  temperature: number;
  maxTokens: number;
}

function resolveRouting(
  routingMode: any,
  complexity: number,
  lovableKey: string | undefined,
  providerKeys: Record<string, string> = {},
): RoutingResult {
  const defaults: RoutingResult = {
    apiUrl: "https://ai.gateway.lovable.dev/v1/chat/completions",
    apiKey: lovableKey,
    model: "google/gemini-3-flash-preview",
    systemPrompt: "Jesteś RidoAI – inteligentny asystent platformy GetRido. Odpowiadaj po polsku, zwięźle i profesjonalnie. Nigdy nie wspominaj o zewnętrznych dostawcach AI – jesteś RidoAI. Formatuj odpowiedzi w markdown.",
    provider: "lovable",
    fallbackApiUrl: "https://ai.gateway.lovable.dev/v1/chat/completions",
    fallbackApiKey: lovableKey,
    fallbackModel: "google/gemini-2.5-flash",
    fallbackProvider: "lovable",
    temperature: 0.7,
    maxTokens: 4096,
  };

  if (!routingMode) return defaults;

  const primary = resolveProviderEndpoint(routingMode.primary_provider, routingMode.primary_model, lovableKey, providerKeys);
  const fallback = resolveProviderEndpoint(routingMode.fallback_provider || "lovable", routingMode.fallback_model || "google/gemini-2.5-flash", lovableKey, providerKeys);

  let result: RoutingResult = {
    ...primary,
    provider: routingMode.primary_provider,
    systemPrompt: routingMode.system_prompt || defaults.systemPrompt,
    fallbackApiUrl: fallback.apiUrl,
    fallbackApiKey: fallback.apiKey,
    fallbackModel: fallback.model,
    fallbackProvider: routingMode.fallback_provider || "lovable",
    temperature: Number(routingMode.temperature) || 0.7,
    maxTokens: routingMode.max_tokens || 4096,
  };

  if (complexity >= (routingMode.complexity_threshold || 99) && routingMode.upgraded_provider && routingMode.upgraded_model) {
    const upgraded = resolveProviderEndpoint(routingMode.upgraded_provider, routingMode.upgraded_model, lovableKey, providerKeys);
    result = { ...result, ...upgraded, provider: routingMode.upgraded_provider };
    console.log(`[Rido AI] Complexity ${complexity} >= ${routingMode.complexity_threshold}, upgraded to ${routingMode.upgraded_model}`);
  }

  return result;
}

function resolveProviderEndpoint(provider: string, model: string, lovableKey: string | undefined, providerKeys: Record<string, string> = {}) {
  switch (provider) {
    case "kimi":
      return {
        apiUrl: "https://api.moonshot.cn/v1/chat/completions",
        apiKey: providerKeys["kimi"] || Deno.env.get("KIMI_API_KEY") || lovableKey,
        model,
      };
    case "openai":
      return {
        apiUrl: "https://api.openai.com/v1/chat/completions",
        apiKey: providerKeys["openai"] || Deno.env.get("OPENAI_API_KEY") || lovableKey,
        model,
      };
    case "lovable":
    default:
      return {
        apiUrl: "https://ai.gateway.lovable.dev/v1/chat/completions",
        apiKey: lovableKey,
        model,
      };
  }
}

// === CALL WITH FALLBACK ===
interface CallResult {
  ok: boolean;
  status?: number;
  data?: any;
  response?: Response;
  errorText?: string;
  usedProvider: string;
  usedModel: string;
  usedFallback: boolean;
}

async function callWithFallback(
  routing: RoutingResult,
  messages: Array<{ role: string; content: string }>,
  stream: boolean,
  tools?: unknown,
  toolChoice?: unknown,
  lovableKey?: string | undefined,
): Promise<CallResult> {
  // Try primary
  const primaryResult = await callProvider(
    routing.apiUrl, routing.apiKey, routing.model,
    messages, stream, routing.temperature, routing.maxTokens, tools, toolChoice
  );

  if (primaryResult.ok) {
    return { ...primaryResult, usedProvider: routing.provider, usedModel: routing.model, usedFallback: false };
  }

  console.warn(`[Rido AI] Primary failed (${routing.provider}/${routing.model}): ${primaryResult.status}. Trying fallback...`);

  // Try fallback
  const fallbackResult = await callProvider(
    routing.fallbackApiUrl, routing.fallbackApiKey, routing.fallbackModel,
    messages, stream, routing.temperature, routing.maxTokens, tools, toolChoice
  );

  if (fallbackResult.ok) {
    return { ...fallbackResult, usedProvider: routing.fallbackProvider, usedModel: routing.fallbackModel, usedFallback: true };
  }

  // Last resort: Lovable gateway with basic model
  if (routing.provider !== "lovable" || routing.fallbackProvider !== "lovable") {
    console.warn("[Rido AI] Fallback failed. Last resort: Lovable gateway.");
    const lastResort = await callProvider(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      lovableKey,
      "google/gemini-2.5-flash",
      messages, stream, 0.7, 4096, tools, toolChoice
    );
    if (lastResort.ok) {
      return { ...lastResort, usedProvider: "lovable", usedModel: "google/gemini-2.5-flash", usedFallback: true };
    }
  }

  return { ok: false, status: fallbackResult.status, errorText: fallbackResult.errorText, usedProvider: routing.provider, usedModel: routing.model, usedFallback: true };
}

async function callProvider(
  apiUrl: string, apiKey: string | undefined, model: string,
  messages: Array<{ role: string; content: string }>,
  stream: boolean, temperature: number, maxTokens: number,
  tools?: unknown, toolChoice?: unknown,
): Promise<{ ok: boolean; status?: number; data?: any; response?: Response; errorText?: string }> {
  if (!apiKey) return { ok: false, status: 401, errorText: "No API key configured" };

  const aiBody: Record<string, unknown> = { model, messages, stream, temperature, max_tokens: maxTokens };
  if (tools) { aiBody.tools = tools; aiBody.tool_choice = toolChoice; }

  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(aiBody),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[Rido AI] Provider ${apiUrl} error ${response.status}:`, errText.slice(0, 200));
      return { ok: false, status: response.status, errorText: errText };
    }

    if (stream) {
      return { ok: true, response };
    }

    const data = await response.json();
    return { ok: true, data };
  } catch (e) {
    console.error(`[Rido AI] Provider ${apiUrl} network error:`, e);
    return { ok: false, status: 0, errorText: e instanceof Error ? e.message : "Network error" };
  }
}

// === FEATURE FLAG MAPPING ===
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
  if (data?.choices?.[0]?.message?.tool_calls) {
    try {
      return JSON.parse(data.choices[0].message.tool_calls[0].function.arguments);
    } catch {
      return data.choices[0].message.tool_calls[0].function.arguments;
    }
  }
  return data?.choices?.[0]?.message?.content || "";
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
  const rates: Record<string, number> = {
    "gpt-4o": 0.05, "gpt-5": 0.08, "openai/gpt-5": 0.08, "openai/gpt-5.2": 0.10,
    "google/gemini-3-flash-preview": 0.01, "google/gemini-2.5-flash": 0.01,
    "google/gemini-2.5-pro": 0.04, "google/gemini-2.5-flash-image": 0.015,
    "moonshot-v1-8k": 0.02, "moonshot-v1-128k": 0.06,
  };
  const rate = rates[model || ""] || 0.02;
  return Math.round(((tokensIn || 0) + (tokensOut || 0)) / 1000 * rate * 100) / 100;
}

async function checkLimits(supabase: any, userId: string | null, tenantId?: string): Promise<{ allowed: boolean; message?: string }> {
  const { data: globalLimit } = await supabase
    .from("ai_limits_config")
    .select("*")
    .eq("scope", "global")
    .is("scope_id", null)
    .maybeSingle();

  if (!globalLimit) return { allowed: true };

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
  try { await supabase.from("ai_requests_log").insert(data); }
  catch (e) { console.error("[Rido AI] Log error:", e); }
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
