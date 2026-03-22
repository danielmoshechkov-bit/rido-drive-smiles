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
    const formData = await req.formData();
    const from = formData.get("From") as string;
    const body = formData.get("Body") as string;

    if (!from || !body) {
      return new Response("", { status: 200 });
    }

    // Find lead by phone
    const { data: lead } = await supabase
      .from("ai_sales_leads")
      .select("*")
      .eq("phone", from)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (!lead) return new Response("", { status: 200 });

    const { data: agent } = await supabase
      .from("ai_sales_agents")
      .select("*")
      .eq("id", lead.agent_id)
      .single();

    if (!agent) return new Response("", { status: 200 });

    const { data: questionnaire } = await supabase
      .from("ai_sales_questionnaire")
      .select("*")
      .eq("agent_id", agent.id)
      .single();

    // Get conversation history
    const { data: conversation } = await supabase
      .from("ai_sales_conversations")
      .select("*")
      .eq("lead_id", lead.id)
      .eq("channel", "sms")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    const history = conversation?.messages || [];
    history.push({ role: "customer", content: body, timestamp: new Date().toISOString() });

    // Get agent knowledge
    const { data: knowledge } = await supabase
      .from("ai_sales_knowledge")
      .select("*")
      .eq("agent_id", agent.id)
      .order("success_rate", { ascending: false })
      .limit(30);

    const companyContext = buildCompanyContext(questionnaire, knowledge || []);

    // Build messages for Claude
    const claudeMessages = history.map((m: any) => ({
      role: m.role === "agent" ? "assistant" : "user",
      content: m.content
    }));

    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not set");

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 300,
        system: buildSalesAgentSystemPrompt(questionnaire, companyContext, knowledge || []),
        messages: claudeMessages
      })
    });

    const data = await res.json();
    const reply = data.content[0].text.trim();

    // Send reply
    if (agent.twilio_account_sid && agent.twilio_auth_token && agent.twilio_phone_number) {
      await sendSms(from, reply, agent);
    }

    // Update conversation history
    history.push({ role: "agent", content: reply, timestamp: new Date().toISOString() });

    if (conversation) {
      await supabase.from("ai_sales_conversations").update({ messages: history }).eq("id", conversation.id);
    } else {
      await supabase.from("ai_sales_conversations").insert({
        lead_id: lead.id,
        agent_id: agent.id,
        channel: "sms",
        direction: "inbound",
        status: "active",
        messages: history
      });
    }

    // Update lead
    await supabase.from("ai_sales_leads").update({
      status: "in_conversation",
      last_contact_at: new Date().toISOString()
    }).eq("id", lead.id);

    // Trigger learning
    if (conversation) {
      await supabase.functions.invoke("ai-agent-learn", {
        body: { conversation_id: conversation.id }
      });
    }

    return new Response("", { status: 200 });
  } catch (e) {
    console.error("ai-agent-reply error:", e);
    return new Response("", { status: 200 });
  }
});

function buildSalesAgentSystemPrompt(q: any, context: string, knowledge: any[]): string {
  const objectionHandling = knowledge
    ?.filter(k => k.knowledge_type === "successful_objection_handling")
    ?.slice(0, 5)
    ?.map(k => `Obiekcja: ${k.context} → Odpowiedź: ${k.content}`)
    ?.join("\n") || "";

  return `
Jesteś AI agentem sprzedażowym firmy ${q?.q_company_name || 'naszej firmy'}.
Prowadzisz rozmowę SMS z potencjalnym klientem po polsku.
NIGDY nie ujawniaj że jesteś AI. Jesteś człowiekiem — konsultantem.

KONTEKST FIRMY I USŁUGI:
${context}

SPRAWDZONE ODPOWIEDZI NA OBIEKCJE:
${objectionHandling}

ZASADY:
1. Bądź naturalny — nie "sprzedażowy bot"
2. Zadawaj jedno pytanie na raz
3. Słuchaj i nawiązuj do tego co mówi klient
4. Gdy wykryjesz zainteresowanie → zaproponuj konkretny termin spotkania
5. Max 160 znaków na SMS
6. Cel: umówić rozmowę telefoniczną lub spotkanie
7. Ton: ${q?.q_sales_tone === 'formal' ? 'formalny (Pan/Pani)' : q?.q_sales_tone === 'casual' ? 'nieformalny (ty)' : 'półformalny'}
ZAKAZANE: ${q?.q_special_instructions || "brak"}
  `.trim();
}

function buildCompanyContext(q: any, knowledge: any[]): string {
  if (!q) return "Brak danych o firmie.";
  return `
FIRMA: ${q.q_company_name || ''} | ${q.q_company_description || ''}
USŁUGA: ${q.q_service_name || ''} — ${q.q_service_description || ''}
CENA: ${q.q_price_from || '?'}–${q.q_price_to || '?'} zł
UNIKALNA WARTOŚĆ: ${q.q_service_unique_value || ''}
  `.trim();
}

async function sendSms(phone: string, message: string, agent: any) {
  await fetch(`https://api.twilio.com/2010-04-01/Accounts/${agent.twilio_account_sid}/Messages.json`, {
    method: "POST",
    headers: {
      "Authorization": "Basic " + btoa(`${agent.twilio_account_sid}:${agent.twilio_auth_token}`),
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({ To: phone, From: agent.twilio_phone_number, Body: message })
  });
}
