import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

/**
 * AI Call Webhook for Telegram Bot
 * 
 * This is a placeholder endpoint that will receive leads from a Telegram bot.
 * Full integration will be completed later.
 */

interface TelegramMessage {
  message?: {
    chat?: {
      id: number;
      first_name?: string;
      last_name?: string;
      username?: string;
    };
    text?: string;
    contact?: {
      phone_number: string;
      first_name?: string;
      last_name?: string;
    };
  };
}

// Simple phone number extraction regex
const PHONE_REGEX = /(\+?\d{1,3}[-.\s]?)?\(?\d{2,3}\)?[-.\s]?\d{2,3}[-.\s]?\d{2,4}[-.\s]?\d{0,4}/g;

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const payload: TelegramMessage = await req.json();
    console.log("Received Telegram payload:", JSON.stringify(payload));

    const message = payload.message;
    if (!message) {
      return new Response(JSON.stringify({ ok: true, message: "No message" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Extract lead data
    let phone: string | null = null;
    let firstName: string | null = null;
    let lastName: string | null = null;

    // If contact was shared
    if (message.contact) {
      phone = message.contact.phone_number;
      firstName = message.contact.first_name || null;
      lastName = message.contact.last_name || null;
    } else if (message.text) {
      // Try to extract phone from text
      const phones = message.text.match(PHONE_REGEX);
      if (phones && phones.length > 0) {
        phone = phones[0].replace(/[-.\s()]/g, "");
      }
    }

    // Use chat info as fallback for name
    if (!firstName && message.chat?.first_name) {
      firstName = message.chat.first_name;
    }
    if (!lastName && message.chat?.last_name) {
      lastName = message.chat.last_name;
    }

    // Only create lead if we have a phone number
    if (phone) {
      const lead = {
        source: "telegram",
        phone: phone,
        first_name: firstName,
        last_name: lastName,
        notes: `Telegram user: @${message.chat?.username || "unknown"}, Chat ID: ${message.chat?.id}`,
        status: "new",
        ai_consent: true,
      };

      const { data, error } = await supabase
        .from("sales_leads")
        .insert(lead)
        .select()
        .single();

      if (error) {
        console.error("Error inserting Telegram lead:", error);
        return new Response(JSON.stringify({ ok: false, error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      console.log("Inserted Telegram lead:", data.id);

      return new Response(JSON.stringify({ 
        ok: true, 
        message: "Lead created",
        lead_id: data.id,
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ 
      ok: true, 
      message: "No phone number found in message",
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Error processing Telegram webhook:", error);
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
