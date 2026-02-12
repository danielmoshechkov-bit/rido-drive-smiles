import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.56.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Brak autoryzacji");

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) throw new Error("Nieprawidłowy token");

    // Check whitelist
    const { data: whitelisted } = await supabase
      .from("ticket_chat_whitelist")
      .select("id")
      .eq("email", user.email)
      .maybeSingle();

    if (!whitelisted) throw new Error("Brak dostępu do czatu zgłoszeń");

    const { description, screenshot_urls } = await req.json();
    if (!description) throw new Error("Opis jest wymagany");

    // Get OpenAI API key from ai_settings
    const { data: aiSettings } = await supabase
      .from("ai_settings")
      .select("openai_api_key_encrypted")
      .limit(1)
      .maybeSingle();

    const openaiKey = aiSettings?.openai_api_key_encrypted;
    
    // Fallback to Lovable API key if no OpenAI key configured
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    
    const useOpenAI = !!openaiKey;
    const apiUrl = useOpenAI 
      ? "https://api.openai.com/v1/chat/completions"
      : "https://ai.gateway.lovable.dev/v1/chat/completions";
    const apiKey = useOpenAI ? openaiKey : LOVABLE_API_KEY;
    const model = useOpenAI ? "gpt-4o" : "google/gemini-3-flash-preview";

    if (!apiKey) throw new Error("Brak skonfigurowanego klucza API (OpenAI lub Lovable)");

    const screenshotContext = screenshot_urls?.length
      ? `\nUżytkownik załączył ${screenshot_urls.length} screenshot(ów).`
      : "";

    const aiResponse = await fetch(apiUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content: `Jesteś asystentem obsługi zgłoszeń portalu GetRido/Rido. Twoje zadania:
1. Podziękuj użytkownikowi za zgłoszenie po polsku
2. Potwierdź że zgłoszenie zostało zarejestrowane
3. Krótko podsumuj problem w 1-2 zdaniach

Odpowiadaj KRÓTKO, uprzejmie, po polsku. Max 3 zdania.`,
          },
          {
            role: "user",
            content: `Zgłoszenie od ${user.email}:\n${description}${screenshotContext}`,
          },
        ],
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("AI error:", aiResponse.status, errText);
      throw new Error("Błąd AI");
    }

    const aiData = await aiResponse.json();
    const aiMessage = aiData.choices?.[0]?.message?.content || "Dziękujemy za zgłoszenie!";

    // Save the ticket to database
    const { data: ticket, error: ticketError } = await supabase
      .from("support_tickets")
      .insert({
        submitted_by: user.id,
        submitted_by_email: user.email,
        description,
        screenshot_urls: screenshot_urls || [],
        status: "new",
      })
      .select()
      .single();

    if (ticketError) {
      console.error("Ticket save error:", ticketError);
      throw new Error("Nie udało się zapisać zgłoszenia");
    }

    return new Response(JSON.stringify({ 
      message: aiMessage, 
      ticket_id: ticket.id 
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ticket-ai-chat error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
