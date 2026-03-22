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
    const { conversation_id } = await req.json();

    const { data: conv } = await supabase
      .from("ai_sales_conversations")
      .select("*")
      .eq("id", conversation_id)
      .single();

    if (!conv || !conv.messages?.length) {
      return new Response(JSON.stringify({ skip: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const { data: lead } = await supabase
      .from("ai_sales_leads")
      .select("*")
      .eq("id", conv.lead_id)
      .single();

    const history = conv.messages.map((m: any) =>
      `${m.role === "agent" ? "AGENT" : "KLIENT"}: ${m.content}`
    ).join("\n");

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
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1000,
        system: "Analizujesz rozmowę sprzedażową. Zwróć TYLKO czysty JSON bez backticks.",
        messages: [{
          role: "user",
          content: `Przeanalizuj tę rozmowę sprzedażową:\n\n${history}\n\n
Zwróć JSON:
{
  "outcome": "meeting_booked|interested|not_interested|callback|no_answer",
  "sentiment": "positive|neutral|negative",
  "objections_detected": ["lista wykrytych obiekcji"],
  "buying_signals": ["lista sygnałów zakupowych"],
  "what_worked": "co zadziałało w tej rozmowie",
  "what_failed": "co nie zadziałało",
  "learned_insights": [
    {
      "type": "successful_objection_handling|effective_opener|closing_phrase|failed_approach|customer_insight",
      "content": "treść wiedzy",
      "context": "kiedy to stosować",
      "success_rate": 0-100
    }
  ],
  "summary": "krótkie podsumowanie po polsku"
}`
        }]
      })
    });

    const data = await res.json();
    let analysis;
    try {
      const raw = data.content[0].text.replace(/```json|```/g, "").trim();
      analysis = JSON.parse(raw);
    } catch {
      console.error("Failed to parse analysis:", data.content[0].text);
      return new Response(JSON.stringify({ error: "Parse error" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // Save learned knowledge
    for (const insight of analysis.learned_insights || []) {
      await supabase.from("ai_sales_knowledge").insert({
        agent_id: conv.agent_id,
        user_id: lead?.user_id,
        knowledge_type: insight.type,
        content: insight.content,
        context: insight.context,
        success_rate: insight.success_rate,
        source_conversation_id: conversation_id
      });
    }

    // Update conversation with analysis
    await supabase.from("ai_sales_conversations").update({
      ai_summary: analysis.summary,
      ai_sentiment: analysis.sentiment,
      ai_objections_detected: analysis.objections_detected,
      ai_buying_signals: analysis.buying_signals,
      ai_outcome: analysis.outcome,
      ai_learning_notes: analysis.what_worked,
      status: "completed"
    }).eq("id", conversation_id);

    // Update lead status based on outcome
    if (lead) {
      const statusMap: Record<string, string> = {
        meeting_booked: "meeting_booked",
        not_interested: "rejected",
        no_answer: "no_answer"
      };
      const newStatus = statusMap[analysis.outcome];
      if (newStatus) {
        await supabase.from("ai_sales_leads").update({ status: newStatus }).eq("id", conv.lead_id);
      }
    }

    // Update agent stats
    if (conv.agent_id) {
      const { count: totalLeads } = await supabase
        .from("ai_sales_leads")
        .select("*", { count: "exact", head: true })
        .eq("agent_id", conv.agent_id);

      const { count: totalMeetings } = await supabase
        .from("ai_sales_leads")
        .select("*", { count: "exact", head: true })
        .eq("agent_id", conv.agent_id)
        .eq("status", "meeting_booked");

      const rate = totalLeads && totalLeads > 0
        ? ((totalMeetings || 0) / totalLeads * 100)
        : 0;

      await supabase.from("ai_sales_agents").update({
        total_leads: totalLeads || 0,
        total_meetings_booked: totalMeetings || 0,
        conversion_rate: Math.round(rate * 100) / 100,
        last_learning_at: new Date().toISOString()
      }).eq("id", conv.agent_id);
    }

    return new Response(JSON.stringify({ success: true, outcome: analysis.outcome }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  } catch (e) {
    console.error("ai-agent-learn error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
