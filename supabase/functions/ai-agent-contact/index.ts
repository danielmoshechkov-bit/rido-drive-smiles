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

  try {
    const { lead_id, delay_minutes = 0, is_followup = false } = await req.json();

    if (delay_minutes > 0 && delay_minutes <= 5) {
      await new Promise(r => setTimeout(r, delay_minutes * 60 * 1000));
    }

    // Get lead + agent + questionnaire
    const { data: lead, error: leadErr } = await supabase
      .from("ai_sales_leads")
      .select("*")
      .eq("id", lead_id)
      .single();

    if (leadErr || !lead) {
      return new Response(JSON.stringify({ error: "Lead not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    if (lead.status === "opted_out" || lead.status === "converted") {
      return new Response(JSON.stringify({ skip: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const { data: agent } = await supabase
      .from("ai_sales_agents")
      .select("*")
      .eq("id", lead.agent_id)
      .single();

    if (!agent) {
      return new Response(JSON.stringify({ error: "Agent not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const { data: questionnaire } = await supabase
      .from("ai_sales_questionnaire")
      .select("*")
      .eq("agent_id", agent.id)
      .single();

    // Get agent knowledge
    const { data: knowledge } = await supabase
      .from("ai_sales_knowledge")
      .select("*")
      .eq("agent_id", agent.id)
      .in("knowledge_type", ["effective_opener", "closing_phrase", "successful_objection_handling"])
      .order("success_rate", { ascending: false })
      .limit(20);

    const companyContext = buildCompanyContext(questionnaire, knowledge || []);

    // Generate SMS message
    const message = await generateSmsMessage(lead, companyContext, is_followup, agent, questionnaire);

    // Send SMS via Twilio
    if (agent.twilio_account_sid && agent.twilio_auth_token && agent.twilio_phone_number) {
      await sendSms(lead.phone, message, agent);
    }

    // Save conversation
    await supabase.from("ai_sales_conversations").insert({
      lead_id: lead.id,
      agent_id: agent.id,
      channel: "sms",
      direction: "outbound",
      status: "active",
      messages: [{ role: "agent", content: message, timestamp: new Date().toISOString() }]
    });

    // Update lead status
    await supabase.from("ai_sales_leads").update({
      status: "contacted",
      last_contact_at: new Date().toISOString(),
      contact_attempts: (lead.contact_attempts || 0) + 1
    }).eq("id", lead_id);

    return new Response(JSON.stringify({ success: true, message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  } catch (e) {
    console.error("ai-agent-contact error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});

async function generateSmsMessage(lead: any, context: string, isFollowup: boolean, agent: any, q: any): Promise<string> {
  const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
  if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not set");

  const prompt = isFollowup
    ? `Napisz follow-up SMS do ${lead.first_name} który nie odpowiedział. Kontekst firmy: ${context}. Max 160 znaków. Nie bądź nachalny.`
    : `Napisz pierwszy SMS do nowego leadu ${lead.first_name} z ${lead.city || "Polski"} który wypełnił formularz zainteresowania usługą. Kontekst firmy: ${context}. Max 160 znaków. Bądź naturalny.`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 200,
      system: `Jesteś AI agentem sprzedażowym. Piszesz naturalne, ludzkie SMS-y po polsku. Nigdy nie ujawniasz że jesteś AI. Podpisujesz się imieniem: ${agent.name}. Ton: ${q?.q_sales_tone || 'semiformal'}.`,
      messages: [{ role: "user", content: prompt }]
    })
  });
  const data = await res.json();
  return data.content[0].text.trim();
}

function buildCompanyContext(q: any, knowledge: any[]): string {
  if (!q) return "Brak danych o firmie.";
  return `
FIRMA: ${q.q_company_name || ''} | ${q.q_company_description || ''}
USŁUGA: ${q.q_service_name || ''} — ${q.q_service_description || ''}
CENA: ${q.q_price_from || '?'}–${q.q_price_to || '?'} zł | Model: ${q.q_price_model || '?'}
UNIKALNA WARTOŚĆ: ${q.q_service_unique_value || ''}
GWARANCJA: ${q.q_service_guarantee || ''}
OBIEKCJA CENA: ${q.q_objection_price || ''}
OBIEKCJA CZAS: ${q.q_objection_time || ''}
NAJSKUTECZNIEJSZE FRAZY: ${knowledge?.filter(k => k.knowledge_type === 'effective_opener').slice(0,3).map(k => k.content).join(' | ') || 'brak'}
  `.trim();
}

async function sendSms(phone: string, message: string, agent: any) {
  const accountSid = agent.twilio_account_sid;
  const authToken = agent.twilio_auth_token;
  const from = agent.twilio_phone_number;

  await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
    method: "POST",
    headers: {
      "Authorization": "Basic " + btoa(`${accountSid}:${authToken}`),
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({ To: phone, From: from, Body: message })
  });
}
