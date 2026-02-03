import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

/**
 * AI Call Webhook for Meta/Facebook Lead Ads
 * 
 * This is a placeholder endpoint that will receive leads from Meta Lead Ads.
 * Full integration will be completed later.
 */

interface MetaLeadPayload {
  entry?: Array<{
    changes?: Array<{
      value?: {
        leadgen_id?: string;
        page_id?: string;
        form_id?: string;
        field_data?: Array<{
          name: string;
          values: string[];
        }>;
      };
    }>;
  }>;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Webhook verification (GET request from Meta)
    if (req.method === "GET") {
      const url = new URL(req.url);
      const mode = url.searchParams.get("hub.mode");
      const token = url.searchParams.get("hub.verify_token");
      const challenge = url.searchParams.get("hub.challenge");

      // TODO: Add proper verify_token check
      if (mode === "subscribe" && token === "META_VERIFY_TOKEN") {
        console.log("Meta webhook verified");
        return new Response(challenge, { 
          status: 200,
          headers: { "Content-Type": "text/plain" }
        });
      }

      return new Response("Forbidden", { status: 403 });
    }

    // Handle POST (actual lead data)
    if (req.method === "POST") {
      const payload: MetaLeadPayload = await req.json();
      console.log("Received Meta lead payload:", JSON.stringify(payload));

      // Process each lead
      const leads: any[] = [];
      
      for (const entry of payload.entry || []) {
        for (const change of entry.changes || []) {
          const leadData = change.value;
          if (!leadData) continue;

          // Extract field data
          const fields: Record<string, string> = {};
          for (const field of leadData.field_data || []) {
            fields[field.name] = field.values[0] || "";
          }

          // Map to our lead format
          const lead = {
            source: "meta",
            phone: fields.phone_number || fields.phone || null,
            email: fields.email || null,
            first_name: fields.first_name || fields.full_name?.split(" ")[0] || null,
            last_name: fields.last_name || fields.full_name?.split(" ").slice(1).join(" ") || null,
            company_name: fields.company_name || fields.company || null,
            notes: `Meta Lead ID: ${leadData.leadgen_id}, Form: ${leadData.form_id}`,
            status: "new",
            ai_consent: true, // Meta leads have consent by default
            meta_lead_id: leadData.leadgen_id,
          };

          if (lead.phone || lead.email) {
            leads.push(lead);
          }
        }
      }

      // Insert leads
      if (leads.length > 0) {
        const { data, error } = await supabase
          .from("sales_leads")
          .insert(leads)
          .select();

        if (error) {
          console.error("Error inserting leads:", error);
          return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        console.log(`Inserted ${data?.length || 0} leads from Meta`);
      }

      return new Response(JSON.stringify({ 
        success: true, 
        message: `Processed ${leads.length} leads`,
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response("Method not allowed", { status: 405 });

  } catch (error) {
    console.error("Error processing Meta webhook:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
