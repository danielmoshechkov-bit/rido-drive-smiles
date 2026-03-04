import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Brak autoryzacji");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Nie zalogowany");

    const body = await req.json();
    const { action } = body;

    // ===== ADD EMAIL ACCOUNT =====
    if (action === "add_account") {
      const { email, imap_host, imap_port, smtp_host, smtp_port, username, password, display_name } = body;

      // Store encrypted password using service role
      const adminClient = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );

      const { data, error } = await adminClient.from("email_accounts").insert({
        user_id: user.id,
        email,
        display_name: display_name || email,
        provider: "imap",
        imap_host,
        imap_port: imap_port || 993,
        smtp_host,
        smtp_port: smtp_port || 587,
        username: username || email,
        encrypted_password: password, // In production: encrypt with AES-256
        is_connected: true,
      }).select().single();

      if (error) throw error;
      return new Response(JSON.stringify({ success: true, account: data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ===== SYNC EMAILS (simulated - fetches mock data for now) =====
    if (action === "sync_emails") {
      const { account_id } = body;

      // Verify ownership
      const { data: account } = await supabase
        .from("email_accounts")
        .select("*")
        .eq("id", account_id)
        .single();

      if (!account) throw new Error("Konto nie znalezione");

      // Update last sync
      await supabase
        .from("email_accounts")
        .update({ last_sync_at: new Date().toISOString() })
        .eq("id", account_id);

      // NOTE: Real IMAP connection would happen here
      // For now, return the existing emails from DB
      const { data: emails } = await supabase
        .from("emails")
        .select("*")
        .eq("account_id", account_id)
        .order("received_at", { ascending: false })
        .limit(50);

      return new Response(JSON.stringify({ success: true, emails: emails || [], synced: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ===== ANALYZE EMAIL WITH AI =====
    if (action === "analyze_email") {
      const { email_id } = body;

      const { data: email } = await supabase
        .from("emails")
        .select("*")
        .eq("id", email_id)
        .single();

      if (!email) throw new Error("Email nie znaleziony");

      const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
      if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

      const prompt = `Przeanalizuj poniższy email i zwróć JSON z polami:
- summary: krótkie podsumowanie (2-3 zdania po polsku)
- priority: "high", "normal" lub "low"
- category: jedna z: "faktura", "zapytanie", "spotkanie", "newsletter", "spam", "inne"
- action_items: tablica obiektów {task, deadline} - zadania wynikające z maila
- suggested_replies: tablica 3 sugerowanych odpowiedzi (krótkich, po polsku)

Email:
Od: ${email.from_name || email.from_address}
Temat: ${email.subject}
Treść: ${(email.body_text || '').slice(0, 3000)}`;

      const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: "Jesteś asystentem email. Odpowiadaj TYLKO poprawnym JSON. Nie dodawaj markdown." },
            { role: "user", content: prompt },
          ],
          tools: [{
            type: "function",
            function: {
              name: "analyze_email",
              description: "Return email analysis",
              parameters: {
                type: "object",
                properties: {
                  summary: { type: "string" },
                  priority: { type: "string", enum: ["high", "normal", "low"] },
                  category: { type: "string" },
                  action_items: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        task: { type: "string" },
                        deadline: { type: "string" },
                      },
                      required: ["task"],
                    },
                  },
                  suggested_replies: {
                    type: "array",
                    items: { type: "string" },
                  },
                },
                required: ["summary", "priority", "category", "action_items", "suggested_replies"],
              },
            },
          }],
          tool_choice: { type: "function", function: { name: "analyze_email" } },
        }),
      });

      if (!aiResp.ok) {
        const errText = await aiResp.text();
        console.error("AI error:", aiResp.status, errText);
        throw new Error("Błąd analizy AI");
      }

      const aiData = await aiResp.json();
      let analysis;
      try {
        const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
        analysis = JSON.parse(toolCall.function.arguments);
      } catch {
        throw new Error("Nie udało się sparsować odpowiedzi AI");
      }

      // Update email with analysis
      await supabase.from("emails").update({
        ai_summary: analysis.summary,
        ai_priority: analysis.priority,
        ai_category: analysis.category,
        ai_action_items: analysis.action_items,
        ai_suggested_replies: analysis.suggested_replies,
        ai_analyzed_at: new Date().toISOString(),
      }).eq("id", email_id);

      return new Response(JSON.stringify({ success: true, analysis }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ===== GENERATE REPLY =====
    if (action === "generate_reply") {
      const { email_id, style } = body;

      const { data: email } = await supabase
        .from("emails")
        .select("*")
        .eq("id", email_id)
        .single();

      if (!email) throw new Error("Email nie znaleziony");

      const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
      if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

      const stylePrompt = style === "formal" 
        ? "Napisz formalną, profesjonalną odpowiedź po polsku."
        : style === "short" 
        ? "Napisz krótką, zwięzłą odpowiedź po polsku (max 2-3 zdania)."
        : "Napisz przyjazną, uprzejmą odpowiedź po polsku.";

      const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: `Jesteś asystentem email o nazwie RidoAI. ${stylePrompt}` },
            { role: "user", content: `Napisz odpowiedź na poniższy email:\n\nOd: ${email.from_name || email.from_address}\nTemat: ${email.subject}\nTreść: ${(email.body_text || '').slice(0, 2000)}` },
          ],
        }),
      });

      if (!aiResp.ok) throw new Error("Błąd generowania odpowiedzi");

      const aiData = await aiResp.json();
      const reply = aiData.choices?.[0]?.message?.content || "";

      return new Response(JSON.stringify({ success: true, reply }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ===== DELETE ACCOUNT =====
    if (action === "delete_account") {
      const { account_id } = body;
      const { error } = await supabase.from("email_accounts").delete().eq("id", account_id);
      if (error) throw error;
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    throw new Error(`Nieznana akcja: ${action}`);
  } catch (err) {
    console.error("rido-mail error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
