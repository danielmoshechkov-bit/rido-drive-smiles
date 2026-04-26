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

  // Meta webhook verification — sprawdza najpierw token z agency_settings, fallback do env
  if (req.method === "GET") {
    const url = new URL(req.url);
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    let validToken = Deno.env.get("META_VERIFY_TOKEN");
    try {
      const { data: settings } = await supabase
        .from("agency_settings")
        .select("report_branding")
        .limit(1)
        .maybeSingle();
      const tokenFromSettings = (settings?.report_branding as any)?.meta_verify_token;
      if (tokenFromSettings) validToken = tokenFromSettings;
    } catch {}

    if (mode === "subscribe" && token === validToken) {
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

        // 1) Sprawdź czy form jest podpięty pod ai_sales_agents (stary flow)
        const { data: agent } = await supabase
          .from("ai_sales_agents")
          .select("*")
          .contains("meta_form_ids", [formId])
          .eq("status", "active")
          .maybeSingle();

        // 2) Sprawdź czy form jest w external_lead_sources typu meta_lead_ads (nowy flow)
        const { data: source } = await supabase
          .from("external_lead_sources")
          .select("*")
          .eq("source_type", "meta_lead_ads")
          .eq("meta_form_id", formId)
          .eq("is_active", true)
          .maybeSingle();

        const accessToken = agent?.meta_access_token || (source as any)?.meta_access_token;
        if (!accessToken) continue;

        const leadData = await fetchMetaLead(leadgenId, accessToken);

        // Routing A — ai_sales_agents
        if (agent) {
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
            await supabase.functions.invoke("ai-agent-contact", {
              body: { lead_id: lead.id, delay_minutes: agent.first_contact_delay_minutes }
            });
          }
        }

        // Routing B — marketing_leads (nowy flow przez external_lead_sources)
        if (source) {
          // Dedup po phone/email + client_id
          let exists = null;
          if (leadData.phone) {
            const { data } = await supabase.from("marketing_leads")
              .select("id").eq("client_id", source.client_id).eq("phone", leadData.phone).limit(1).maybeSingle();
            exists = data;
          }
          if (!exists) {
            await supabase.from("marketing_leads").insert({
              client_id: source.client_id,
              name: `${leadData.first_name || ''} ${leadData.last_name || ''}`.trim() || 'Lead Meta',
              phone: leadData.phone,
              email: leadData.email,
              city: leadData.city,
              message: `Meta Lead Ads — form ${formId}`,
              source_platform: 'meta_lead_ads',
              source_campaign_id: adId,
              status: 'new',
            });
            await supabase.from("external_lead_sources").update({
              last_synced_at: new Date().toISOString(),
              total_imported: ((source as any).total_imported || 0) + 1,
            }).eq("id", source.id);
          }
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
