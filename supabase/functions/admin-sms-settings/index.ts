import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DEFAULT_PROVIDER = "justsend";
const DEFAULT_API_URL = "https://justsend.io/api/sender/bulk/send";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });

const sanitizeSenderName = (value: string) => value.replace(/[^a-zA-Z0-9.\-]/g, "").slice(0, 11);

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY");

    if (!supabaseUrl || !serviceRoleKey || !anonKey) {
      throw new Error("Brak konfiguracji Supabase w Edge Function");
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ success: false, error: "Brak autoryzacji" }, 401);
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: {
        headers: {
          Authorization: authHeader,
        },
      },
    });

    const {
      data: { user },
      error: authError,
    } = await userClient.auth.getUser();

    if (authError || !user) {
      return json({ success: false, error: "Brak autoryzacji" }, 401);
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
    const { data: adminRole, error: roleError } = await supabaseAdmin
      .from("user_roles")
      .select("id")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .limit(1)
      .maybeSingle();

    if (roleError) {
      throw roleError;
    }

    if (!adminRole) {
      return json({ success: false, error: "Brak uprawnień administratora" }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const action = body?.action || "get";

    if (action === "get") {
      const { data: settings, error } = await supabaseAdmin
        .from("sms_settings")
        .select("id, provider, api_url, api_key_secret_name, api_key, sender_name, is_active, created_at, updated_at")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (error) {
        throw error;
      }

      if (!settings) {
        return json({ success: true, settings: null });
      }

      const { api_key, ...safeSettings } = settings;
      return json({
        success: true,
        settings: {
          ...safeSettings,
          has_api_key: Boolean(api_key || safeSettings.api_key_secret_name),
        },
      });
    }

    if (action === "save") {
      const senderName = sanitizeSenderName(body?.sender_name || "GetRido.pl") || "GetRido.pl";
      const nextProvider = typeof body?.provider === "string" && body.provider.trim()
        ? body.provider.trim()
        : DEFAULT_PROVIDER;
      const nextApiUrl = typeof body?.api_url === "string" && body.api_url.trim()
        ? body.api_url.trim()
        : DEFAULT_API_URL;
      const nextApiKey = typeof body?.api_key === "string" ? body.api_key.trim() : "";

      const payload: Record<string, unknown> = {
        provider: nextProvider,
        api_url: nextApiUrl,
        sender_name: senderName,
        is_active: Boolean(body?.is_active),
        api_key_secret_name: "SMSAPI_TOKEN",
        updated_at: new Date().toISOString(),
      };

      if (nextApiKey) {
        payload.api_key = nextApiKey;
      }

      const { data: existing, error: existingError } = await supabaseAdmin
        .from("sms_settings")
        .select("id")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (existingError) {
        throw existingError;
      }

      let savedSettings: any = null;

      if (existing?.id) {
        const { data, error } = await supabaseAdmin
          .from("sms_settings")
          .update(payload)
          .eq("id", existing.id)
          .select("id, provider, api_url, api_key_secret_name, api_key, sender_name, is_active, created_at, updated_at")
          .single();

        if (error) {
          throw error;
        }

        savedSettings = data;
      } else {
        const { data, error } = await supabaseAdmin
          .from("sms_settings")
          .insert(payload)
          .select("id, provider, api_url, api_key_secret_name, api_key, sender_name, is_active, created_at, updated_at")
          .single();

        if (error) {
          const duplicateSingleton = error.code === "23505" || error.message?.includes("sms_settings_singleton_idx");

          if (!duplicateSingleton) {
            throw error;
          }

          const { data: fallbackExisting, error: fallbackError } = await supabaseAdmin
            .from("sms_settings")
            .select("id")
            .order("created_at", { ascending: true })
            .limit(1)
            .maybeSingle();

          if (fallbackError || !fallbackExisting?.id) {
            throw fallbackError || error;
          }

          const { data: fallbackSaved, error: fallbackSaveError } = await supabaseAdmin
            .from("sms_settings")
            .update(payload)
            .eq("id", fallbackExisting.id)
            .select("id, provider, api_url, api_key_secret_name, api_key, sender_name, is_active, created_at, updated_at")
            .single();

          if (fallbackSaveError) {
            throw fallbackSaveError;
          }

          savedSettings = fallbackSaved;
        } else {
          savedSettings = data;
        }
      }

      const { api_key, ...safeSettings } = savedSettings;
      return json({
        success: true,
        settings: {
          ...safeSettings,
          has_api_key: Boolean(api_key || safeSettings.api_key_secret_name),
        },
      });
    }

    return json({ success: false, error: `Nieznana akcja: ${action}` }, 400);
  } catch (error) {
    console.error("admin-sms-settings error:", error);
    return json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Nie udało się obsłużyć ustawień SMS",
      },
      500,
    );
  }
});