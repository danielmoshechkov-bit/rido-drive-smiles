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

    // Check admin
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: user.id, _role: "admin" });
    if (!isAdmin) throw new Error("Brak uprawnień administratora");

    const { ticket_id } = await req.json();
    if (!ticket_id) throw new Error("ticket_id jest wymagany");

    // Get ticket
    const { data: ticket, error: ticketError } = await supabase
      .from("support_tickets")
      .select("*")
      .eq("id", ticket_id)
      .single();

    if (ticketError || !ticket) throw new Error("Nie znaleziono zgłoszenia");

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const screenshotInfo = ticket.screenshot_urls?.length
      ? `\n\nZałączone screenshoty (${ticket.screenshot_urls.length}):\n${ticket.screenshot_urls.map((url: string, i: number) => `${i + 1}. ${url}`).join("\n")}`
      : "";

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `Jesteś ekspertem od naprawiania bugów w aplikacjach React/TypeScript/Supabase zbudowanych w Lovable.
Twoim zadaniem jest wygenerowanie KOMPLETNEGO promptu naprawczego, który administrator może wkleić do Lovable, aby naprawić zgłoszony bug.

Prompt powinien:
1. Zaczynać się od jasnego opisu problemu
2. Zawierać konkretne kroki naprawy
3. Wskazywać prawdopodobne pliki do modyfikacji
4. Jeśli są screenshoty, wskazać że należy je pobrać i dołączyć do promptu
5. Być napisany po polsku
6. Być gotowy do bezpośredniego wklejenia w Lovable

Format odpowiedzi: zwykły tekst promptu, gotowy do skopiowania.`,
          },
          {
            role: "user",
            content: `Zgłoszenie od: ${ticket.submitted_by_email}
Data: ${ticket.created_at}
Opis problemu: ${ticket.description}${screenshotInfo}`,
          },
        ],
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("AI error:", aiResponse.status, errText);
      throw new Error("Błąd generowania promptu");
    }

    const aiData = await aiResponse.json();
    const repairPrompt = aiData.choices?.[0]?.message?.content || "Nie udało się wygenerować promptu";

    // Update ticket with the generated prompt
    await supabase
      .from("support_tickets")
      .update({
        ai_repair_prompt: repairPrompt,
        status: "approved",
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", ticket_id);

    return new Response(JSON.stringify({ repair_prompt: repairPrompt }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-repair-prompt error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
