import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.56.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // `listingKind` domyślnie 'real_estate' — tak wołają dotychczasowi klienci
    // (PropertyListingCard, PropertyDetailPage). Marketplace przekazuje 'general'.
    const { listingId, interactionType, listingKind } = await req.json();
    const isGeneral = listingKind === "general";

    if (!listingId || !interactionType) {
      return new Response(
        JSON.stringify({ error: "Missing listingId or interactionType" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate interaction type
    const validTypes = ["view", "favorite", "compare", "contact_reveal"];
    if (!validTypes.includes(interactionType)) {
      return new Response(
        JSON.stringify({ error: "Invalid interactionType. Must be one of: " + validTypes.join(", ") }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get user ID if authenticated
    let userId: string | null = null;
    const authHeader = req.headers.get("Authorization");
    if (authHeader) {
      const token = authHeader.replace("Bearer ", "");
      const { data: { user } } = await supabase.auth.getUser(token);
      userId = user?.id || null;
    }

    // Get IP address for anonymous tracking
    const ipAddress = req.headers.get("x-forwarded-for")?.split(",")[0] || 
                      req.headers.get("cf-connecting-ip") || 
                      "unknown";

    console.log(`Tracking interaction: ${interactionType} for listing ${listingId} by user ${userId || ipAddress}`);

    // Fetch agent_id and agency_id from the listing for contact_reveal tracking
    let agentId: string | null = null;
    let agencyId: string | null = null;
    
    if (interactionType === "contact_reveal" && !isGeneral) {
      const { data: listing } = await supabase
        .from("real_estate_listings")
        .select("agent_id")
        .eq("id", listingId)
        .single();
      
      if (listing?.agent_id) {
        agentId = listing.agent_id;
        
        // Get the agency (parent agent) for this agent
        const { data: agent } = await supabase
          .from("real_estate_agents")
          .select("parent_agent_id")
          .eq("id", listing.agent_id)
          .single();
        
        agencyId = agent?.parent_agent_id || listing.agent_id;
      }
    }

    // Dziennik interakcji istnieje wyłącznie dla nieruchomości — `listing_id`
    // wskazuje na real_estate_listings, więc wpis dla ogłoszenia marketplace
    // odbiłby się od klucza obcego przy każdym wyświetleniu.
    const { error: insertError } = isGeneral
      ? { error: null }
      : await supabase
          .from("real_estate_listing_interactions")
          .insert({
            listing_id: listingId,
            user_id: userId,
            interaction_type: interactionType,
            ip_address: userId ? null : ipAddress, // Only store IP for anonymous users
            device_info: req.headers.get("user-agent") || null,
            agent_id: agentId,
            agency_id: agencyId,
          });

    if (insertError) {
      console.error("Error inserting interaction:", insertError);
      // Continue anyway to update counters
    }

    // Update the counter on the listing
    let updateColumn = "";
    switch (interactionType) {
      case "view":
        updateColumn = "view_count";
        break;
      case "favorite":
        updateColumn = "favorite_count";
        break;
      case "compare":
        updateColumn = "comparison_count";
        break;
      case "contact_reveal":
        updateColumn = "contact_reveals_count";
        break;
    }

    // Ogłoszenia marketplace mają wyłącznie licznik wyświetleń; pozostałych
    // typów interakcji nie ma tam gdzie zapisać i świadomie ich nie liczymy,
    // zamiast udawać, że wpadły gdziekolwiek.
    if (isGeneral) {
      updateColumn = interactionType === "view" ? "views_count" : "";
    }

    if (updateColumn) {
      const { error: updateError } = await supabase.rpc("increment_listing_counter", {
        p_table: isGeneral ? "general_listings" : "real_estate_listings",
        p_listing_id: listingId,
        p_column: updateColumn,
      });

      // Bez cichego fallbacku. Odczyt-i-zapis, który tu stał, gubił zliczenia
      // przy równoczesnych wejściach i logował błąd przy KAŻDYM wywołaniu,
      // bo wołany RPC nie istniał w bazie.
      if (updateError) {
        console.error("track-listing-interaction: nie podniesiono licznika", updateColumn, updateError);
      }
    }

    return new Response(
      JSON.stringify({ success: true, interactionType, listingId }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error in track-listing-interaction:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
