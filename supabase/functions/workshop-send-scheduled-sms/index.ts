// Cron-triggered: dispatches due scheduled SMS from workshop_sms_log
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const now = new Date().toISOString();

    // Pick due scheduled messages (limit batch)
    const { data: due, error: fetchErr } = await supabaseAdmin
      .from("workshop_sms_log")
      .select("*")
      .eq("status", "scheduled")
      .lte("scheduled_at", now)
      .order("scheduled_at", { ascending: true })
      .limit(50);

    if (fetchErr) throw fetchErr;
    if (!due || due.length === 0) {
      return new Response(JSON.stringify({ processed: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let success = 0;
    let failed = 0;

    for (const row of due) {
      // Mark as sending to avoid double-processing
      await supabaseAdmin
        .from("workshop_sms_log")
        .update({ status: "sending" })
        .eq("id", row.id);

      try {
        const { data: result, error: invokeErr } = await supabaseAdmin.functions.invoke("workshop-send-sms", {
          body: {
            phone: row.phone,
            message: row.message,
            order_id: row.order_id,
            sms_type: row.sms_type || "scheduled",
            provider_id: row.provider_id,
            appointment_id: row.appointment_id,
            client_id: row.client_id,
          },
        });

        if (invokeErr || (result as any)?.error) {
          throw new Error(invokeErr?.message || (result as any)?.error || "Send failed");
        }

        await supabaseAdmin
          .from("workshop_sms_log")
          .update({ status: "sent", sent_at: new Date().toISOString() })
          .eq("id", row.id);
        success++;
      } catch (err: any) {
        console.error(`[Scheduled SMS] Failed to send ${row.id}:`, err.message);
        await supabaseAdmin
          .from("workshop_sms_log")
          .update({ status: "failed", error_message: err.message })
          .eq("id", row.id);
        failed++;
      }
    }

    return new Response(JSON.stringify({ processed: due.length, success, failed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("[Scheduled SMS] Unexpected error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
