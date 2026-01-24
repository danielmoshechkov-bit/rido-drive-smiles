import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log("Starting insurance alerts scan...");

    // Get policies expiring in 30 days
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
    const today = new Date().toISOString().split("T")[0];
    const targetDate = thirtyDaysFromNow.toISOString().split("T")[0];

    const { data: expiringPolicies, error: policiesError } = await supabase
      .from("vehicle_policies")
      .select(`
        id, type, valid_to, premium,
        vehicles (id, plate, vin, brand, model, fleet_id,
          fleets (id, name)
        )
      `)
      .gte("valid_to", today)
      .lte("valid_to", targetDate);

    if (policiesError) {
      console.error("Error fetching policies:", policiesError);
      throw policiesError;
    }

    console.log(`Found ${expiringPolicies?.length || 0} expiring policies`);

    let notificationsCreated = 0;

    for (const policy of expiringPolicies || []) {
      const vehicle = policy.vehicles as any;
      if (!vehicle) continue;

      // Check if notification already exists
      const { data: existing } = await supabase
        .from("insurance_notifications")
        .select("id")
        .eq("policy_id", policy.id)
        .maybeSingle();

      if (existing) continue;

      // Determine notification type based on days until expiry
      const expiryDate = new Date(policy.valid_to);
      const daysUntil = Math.ceil((expiryDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      let notificationType = "policy_expiring_30d";
      if (daysUntil <= 1) notificationType = "policy_expiring_1d";
      else if (daysUntil <= 7) notificationType = "policy_expiring_7d";

      // Create notification for all agents
      const { error: insertError } = await supabase
        .from("insurance_notifications")
        .insert({
          agent_id: null, // null = visible to all agents
          vehicle_id: vehicle.id,
          policy_id: policy.id,
          fleet_id: vehicle.fleet_id,
          notification_type: notificationType,
          status: "pending",
          policy_type: policy.type,
          current_premium: policy.premium,
          expiry_date: policy.valid_to,
          vehicle_plate: vehicle.plate,
          vehicle_vin: vehicle.vin,
          vehicle_brand: vehicle.brand,
          vehicle_model: vehicle.model,
          fleet_name: vehicle.fleets?.name || null,
        });

      if (insertError) {
        console.error("Error creating notification:", insertError);
      } else {
        notificationsCreated++;
      }
    }

    console.log(`Created ${notificationsCreated} new notifications`);

    return new Response(
      JSON.stringify({ success: true, notificationsCreated }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Insurance alerts error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
