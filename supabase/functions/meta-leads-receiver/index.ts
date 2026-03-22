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
      return new Response(challenge!, { status: 200 });
    }
    return new Response("Forbidden", { status: 403 });
  }

  try {
    const body = await req.json();
    let leadsProcessed = 0;

    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        if (change.field !== "leadgen") continue;

        const { leadgen_id, form_id, ad_id } = change.value;

        // Find ad order by form_id
        const { data: adOrder } = await supabase
          .from("ad_orders")
          .select("*")
          .eq("meta_form_id", form_id)
          .eq("status", "active")
          .single();

        if (!adOrder) {
          console.log(`No active ad_order for form_id: ${form_id}`);
          continue;
        }

        // Fetch lead data from Meta API
        let firstName = "", lastName = "", phone = "", email = "", city = "";
        const customFields: Record<string, string> = {};

        try {
          const metaRes = await fetch(
            `https://graph.facebook.com/v19.0/${leadgen_id}?fields=field_data&access_token=${adOrder.meta_access_token}`
          );
          const metaData = await metaRes.json();

          for (const field of metaData.field_data || []) {
            const val = field.values?.[0] || "";
            customFields[field.name] = val;
          }

          firstName = customFields["first_name"] || customFields["full_name"]?.split(" ")[0] || "";
          lastName = customFields["last_name"] || customFields["full_name"]?.split(" ").slice(1).join(" ") || "";
          phone = customFields["phone_number"] || customFields["phone"] || "";
          email = customFields["email"] || "";
          city = customFields["city"] || "";
        } catch (e) {
          console.error("Error fetching Meta lead data:", e);
        }

        // Save lead
        const { data: lead, error: insertError } = await supabase
          .from("leads")
          .insert({
            provider_user_id: adOrder.provider_user_id,
            service_id: adOrder.service_id,
            ad_order_id: adOrder.id,
            source: "meta",
            source_detail: adOrder.campaign_name || "Meta Ads",
            meta_lead_id: leadgen_id,
            meta_form_id: form_id,
            meta_ad_id: ad_id,
            meta_campaign_name: adOrder.campaign_name,
            first_name: firstName,
            last_name: lastName,
            phone,
            email,
            city,
            custom_form_fields: customFields,
            status: "new",
          })
          .select()
          .single();

        if (insertError) {
          console.error("Error inserting lead:", insertError);
          continue;
        }

        // Update order lead count
        await supabase
          .from("ad_orders")
          .update({
            leads_total: (adOrder.leads_total || 0) + 1,
            leads_this_month: (adOrder.leads_this_month || 0) + 1,
          })
          .eq("id", adOrder.id);

        leadsProcessed++;
        console.log(`Lead saved: ${firstName} ${lastName} (${phone})`);
      }
    }

    return new Response(JSON.stringify({ success: true, leads_processed: leadsProcessed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("meta-leads-receiver error:", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
