import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Meta webhook verification
  if (req.method === "GET") {
    const url = new URL(req.url);
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    if (mode === "subscribe" && token === Deno.env.get("META_VERIFY_TOKEN")) {
      return new Response(challenge, { status: 200 });
    }
    return new Response("Forbidden", { status: 403 });
  }

  try {
    const body = await req.json();

    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        if (change.field !== "leadgen") continue;
        const leadgenId = change.value.leadgen_id;
        const formId = change.value.form_id;
        const adId = change.value.ad_id;

        // Find agent for this form
        const { data: agent } = await supabase
          .from("ai_sales_agents")
          .select("*")
          .contains("meta_form_ids", [formId])
          .eq("status", "active")
          .single();

        if (!agent) continue;

        // Fetch lead data from Meta API
        const leadData = await fetchMetaLead(leadgenId, agent.meta_access_token);

        // Save lead
        const { data: lead } = await supabase
          .from("ai_sales_leads")
          .insert({
            agent_id: agent.id,
            service_id: agent.service_id,
            user_id: agent.user_id,
            meta_lead_id: leadgenId,
            meta_form_id: formId,
            meta_ad_id: adId,
            first_name: leadData.first_name,
            last_name: leadData.last_name,
            phone: leadData.phone,
            email: leadData.email,
            city: leadData.city,
            custom_fields: leadData.custom_fields,
            status: "new"
          })
          .select()
          .single();

        if (lead) {
          // Trigger first contact
          await supabase.functions.invoke("ai-agent-contact", {
            body: { lead_id: lead.id, delay_minutes: agent.first_contact_delay_minutes }
          });
        }
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  } catch (e) {
    console.error("meta-leads-webhook error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});

async function fetchMetaLead(leadgenId: string, accessToken: string) {
  try {
    const res = await fetch(
      `https://graph.facebook.com/v19.0/${leadgenId}?fields=field_data&access_token=${accessToken}`
    );
    const data = await res.json();
    const fields: Record<string, string> = {};
    for (const field of data.field_data || []) {
      fields[field.name] = field.values[0];
    }
    return {
      first_name: fields["first_name"] || fields["full_name"]?.split(" ")[0] || "",
      last_name: fields["last_name"] || fields["full_name"]?.split(" ")[1] || "",
      phone: fields["phone_number"] || fields["phone"] || "",
      email: fields["email"] || "",
      city: fields["city"] || "",
      custom_fields: fields
    };
  } catch {
    return { first_name: "", last_name: "", phone: "", email: "", city: "", custom_fields: {} };
  }
}
