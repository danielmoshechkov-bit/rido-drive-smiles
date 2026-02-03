import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

/**
 * AI Call Worker - Processes the call queue
 * 
 * This is a placeholder worker that will:
 * 1. Pick up pending items from ai_call_queue
 * 2. Initiate calls via telephony provider (Twilio/Plivo)
 * 3. Use STT/TTS/LLM for the conversation
 * 4. Record results in ai_agent_calls
 * 
 * For MVP: This is a simulation/placeholder. Real integration will come later.
 */

interface ProcessQueueRequest {
  action?: "process" | "status" | "trigger_single";
  queue_item_id?: string;
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

    const body: ProcessQueueRequest = await req.json().catch(() => ({}));
    const action = body.action || "status";

    // Check if globally enabled
    const { data: globalFlag } = await supabase
      .from("feature_toggles")
      .select("is_enabled")
      .eq("feature_key", "ai_call_enabled_global")
      .single();

    if (!globalFlag?.is_enabled) {
      return new Response(JSON.stringify({
        success: false,
        message: "AI Call module is disabled globally",
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // STATUS: Return queue statistics
    if (action === "status") {
      const { data: queueStats } = await supabase
        .from("ai_call_queue")
        .select("status")
        .then(result => {
          const stats = {
            pending: 0,
            scheduled: 0,
            in_progress: 0,
            completed: 0,
            failed: 0,
          };
          for (const item of result.data || []) {
            stats[item.status as keyof typeof stats] = (stats[item.status as keyof typeof stats] || 0) + 1;
          }
          return { data: stats };
        });

      return new Response(JSON.stringify({
        success: true,
        status: "ready",
        queue_stats: queueStats,
        message: "AI Call Worker is ready (placeholder mode)",
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // TRIGGER_SINGLE: Process a specific queue item
    if (action === "trigger_single" && body.queue_item_id) {
      const { data: queueItem, error: fetchError } = await supabase
        .from("ai_call_queue")
        .select(`
          *,
          lead:sales_leads(*),
          config:ai_agent_configs(*)
        `)
        .eq("id", body.queue_item_id)
        .single();

      if (fetchError || !queueItem) {
        return new Response(JSON.stringify({
          success: false,
          message: "Queue item not found",
        }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Update status to in_progress
      await supabase
        .from("ai_call_queue")
        .update({ 
          status: "in_progress",
          processing_started_at: new Date().toISOString(),
        })
        .eq("id", body.queue_item_id);

      // PLACEHOLDER: Simulate a call
      // In real implementation, this would:
      // 1. Initialize Twilio/Plivo call
      // 2. Stream audio via WebSocket
      // 3. Use STT to convert speech to text
      // 4. Send to LLM for response
      // 5. Use TTS to convert response to audio
      // 6. Record transcript and outcome

      const simulatedOutcome = Math.random() > 0.3 ? "completed" : "no_answer";
      const simulatedDuration = Math.floor(Math.random() * 180) + 30; // 30-210 seconds

      // Create call record
      const { data: callRecord } = await supabase
        .from("ai_agent_calls")
        .insert({
          config_id: queueItem.config_id,
          lead_id: queueItem.lead_id,
          call_status: simulatedOutcome,
          outcome: simulatedOutcome === "completed" ? "qualified" : "no_answer",
          duration_seconds: simulatedDuration,
          transcript: "[PLACEHOLDER] This is a simulated call transcript. Real transcription will be available when telephony API is integrated.",
          ai_summary: "Rozmowa symulacyjna - placeholder. Pełna funkcjonalność zostanie uruchomiona po integracji z API telefonii.",
          started_at: new Date().toISOString(),
          ended_at: new Date().toISOString(),
        })
        .select()
        .single();

      // Update queue item
      await supabase
        .from("ai_call_queue")
        .update({
          status: simulatedOutcome === "completed" ? "completed" : "failed",
          completed_at: new Date().toISOString(),
          retry_count: queueItem.retry_count + 1,
        })
        .eq("id", body.queue_item_id);

      // Log to audit
      await supabase.from("ai_call_audit_log").insert({
        action: "call_initiated",
        target_type: "queue_item",
        target_id: body.queue_item_id,
        details: {
          lead_id: queueItem.lead_id,
          outcome: simulatedOutcome,
          duration: simulatedDuration,
          mode: "placeholder",
        },
      });

      return new Response(JSON.stringify({
        success: true,
        message: "Call processed (placeholder mode)",
        call_id: callRecord?.id,
        outcome: simulatedOutcome,
        duration_seconds: simulatedDuration,
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // PROCESS: Batch process pending items
    if (action === "process") {
      // Get current time
      const now = new Date();
      const currentHour = now.getHours();

      // Only process during business hours (9-20)
      if (currentHour < 9 || currentHour >= 20) {
        return new Response(JSON.stringify({
          success: false,
          message: "Outside of calling hours (09:00-20:00)",
        }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Get pending queue items
      const { data: pendingItems } = await supabase
        .from("ai_call_queue")
        .select("id")
        .eq("status", "pending")
        .or(`scheduled_at.is.null,scheduled_at.lte.${now.toISOString()}`)
        .order("priority", { ascending: true })
        .order("created_at", { ascending: true })
        .limit(5);

      if (!pendingItems || pendingItems.length === 0) {
        return new Response(JSON.stringify({
          success: true,
          message: "No pending items in queue",
          processed: 0,
        }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Process each item (in real implementation, this would be parallel/async)
      const results = [];
      for (const item of pendingItems) {
        // Recursively call trigger_single
        // In production, this should be a proper queue system
        results.push({ id: item.id, status: "queued_for_processing" });
      }

      return new Response(JSON.stringify({
        success: true,
        message: `Found ${pendingItems.length} items to process`,
        items: results,
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      success: false,
      message: "Unknown action",
    }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Error in AI Call Worker:", error);
    return new Response(JSON.stringify({ 
      success: false, 
      error: error.message,
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
