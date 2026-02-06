import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { parseOffers, parseDeleteSection, sanitizeText, type ParsedOffer } from "./parser.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface ImportRequest {
  integration_id: string;
  mode?: 'full' | 'incremental';
  test_connection?: boolean;
}

interface ImportStats {
  total_in_feed: number;
  added_count: number;
  updated_count: number;
  deactivated_count: number;
  error_count: number;
  errors: string[];
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const body: ImportRequest = await req.json();
    
    const { integration_id, mode = 'full', test_connection = false } = body;

    if (!integration_id) {
      return new Response(
        JSON.stringify({ error: "integration_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch integration config
    const { data: integration, error: intError } = await supabase
      .from("agency_crm_integrations")
      .select(`
        *,
        real_estate_agents!agency_crm_integrations_agency_id_fkey (
          id,
          user_id,
          agency_name,
          parent_agent_id
        )
      `)
      .eq("id", integration_id)
      .single();

    if (intError || !integration) {
      return new Response(
        JSON.stringify({ error: "Integration not found", details: intError }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get XML URL based on import mode
    const xmlUrl = integration.xml_url;
    if (!xmlUrl && integration.import_mode === 'xml_url') {
      return new Response(
        JSON.stringify({ error: "XML URL not configured" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Test connection mode - just verify we can fetch the XML
    if (test_connection) {
      try {
        const testResponse = await fetch(xmlUrl, {
          method: 'HEAD',
          headers: buildAuthHeaders(integration),
        });
        
        if (testResponse.ok) {
          return new Response(
            JSON.stringify({ 
              success: true, 
              message: "Połączenie nawiązane pomyślnie",
              status: testResponse.status 
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        } else {
          return new Response(
            JSON.stringify({ 
              success: false, 
              message: `Błąd połączenia: HTTP ${testResponse.status}`,
              status: testResponse.status 
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      } catch (fetchErr) {
        return new Response(
          JSON.stringify({ 
            success: false, 
            message: `Błąd połączenia: ${fetchErr.message}` 
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Create import log entry
    const { data: importLog, error: logError } = await supabase
      .from("crm_import_logs")
      .insert({
        integration_id,
        started_at: new Date().toISOString(),
        status: 'running',
        log_type: 'import',
        message: 'Import started',
      })
      .select()
      .single();

    if (logError) {
      console.error("Failed to create import log:", logError);
    }

    const stats: ImportStats = {
      total_in_feed: 0,
      added_count: 0,
      updated_count: 0,
      deactivated_count: 0,
      error_count: 0,
      errors: [],
    };

    try {
      // Fetch XML content
      console.log(`Fetching XML from: ${xmlUrl}`);
      const xmlResponse = await fetch(xmlUrl, {
        headers: buildAuthHeaders(integration),
      });

      if (!xmlResponse.ok) {
        throw new Error(`Failed to fetch XML: HTTP ${xmlResponse.status}`);
      }

      const xmlContent = await xmlResponse.text();
      console.log(`XML content length: ${xmlContent.length} bytes`);

      // Parse offers
      const offers = parseOffers(xmlContent);
      stats.total_in_feed = offers.length;
      console.log(`Parsed ${offers.length} offers`);

      // Parse delete section
      const deleteSection = parseDeleteSection(xmlContent);
      console.log(`Found ${deleteSection.signatures.length} offers to delete`);

      // Get existing offers for this agency's CRM integration
      const { data: existingOffers } = await supabase
        .from("real_estate_listings")
        .select("id, external_id")
        .eq("crm_source", integration.provider_code)
        .eq("agency_id", integration.agency_id);

      const existingMap = new Map(
        (existingOffers || []).map(o => [o.external_id, o.id])
      );

      // Process each offer
      for (const offer of offers) {
        try {
          const existingId = existingMap.get(offer.external_id);
          
          // Prepare listing data
          const listingData = {
            external_id: offer.external_id,
            crm_source: integration.provider_code,
            agency_id: integration.agency_id,
            agent_id: await resolveAgentId(supabase, integration, offer),
            title: sanitizeText(offer.title) || `Oferta ${offer.external_id}`,
            description: sanitizeText(offer.description),
            property_type: offer.property_type,
            transaction_type: offer.transaction_type,
            price: offer.price,
            area: offer.area,
            rooms: offer.rooms,
            floor: offer.floor,
            total_floors: offer.total_floors,
            build_year: offer.build_year,
            city: offer.city,
            district: offer.district,
            address: offer.address,
            latitude: offer.latitude,
            longitude: offer.longitude,
            has_balcony: offer.has_balcony,
            has_garden: offer.has_garden,
            has_parking: offer.has_parking,
            has_elevator: offer.has_elevator,
            contact_person: offer.contact_person,
            contact_phone: offer.contact_phone,
            contact_email: offer.contact_email,
            video_url: offer.video_url,
            virtual_tour_url: offer.virtual_tour_url,
            photos: offer.photos,
            crm_raw_data: offer.crm_raw_data,
            crm_last_sync_at: new Date().toISOString(),
            status: 'active',
          };

          if (existingId) {
            // Update existing offer
            const { error: updateError } = await supabase
              .from("real_estate_listings")
              .update(listingData)
              .eq("id", existingId);

            if (updateError) {
              stats.error_count++;
              stats.errors.push(`Update error for ${offer.external_id}: ${updateError.message}`);
            } else {
              stats.updated_count++;
            }
          } else {
            // Insert new offer
            const { error: insertError } = await supabase
              .from("real_estate_listings")
              .insert(listingData);

            if (insertError) {
              stats.error_count++;
              stats.errors.push(`Insert error for ${offer.external_id}: ${insertError.message}`);
            } else {
              stats.added_count++;
            }
          }
        } catch (offerErr) {
          stats.error_count++;
          stats.errors.push(`Error processing ${offer.external_id}: ${offerErr.message}`);
        }
      }

      // Process deletions
      for (const signature of deleteSection.signatures) {
        const existingId = existingMap.get(signature);
        if (existingId) {
          const { error: deactivateError } = await supabase
            .from("real_estate_listings")
            .update({ status: 'inactive' })
            .eq("id", existingId);

          if (!deactivateError) {
            stats.deactivated_count++;
          }
        }
      }

      // In full mode, deactivate offers not in feed
      if (mode === 'full') {
        const feedExternalIds = new Set(offers.map(o => o.external_id));
        const toDeactivate = Array.from(existingMap.entries())
          .filter(([extId]) => !feedExternalIds.has(extId) && !deleteSection.signatures.includes(extId))
          .map(([, id]) => id);

        if (toDeactivate.length > 0) {
          const { error: bulkDeactivateError } = await supabase
            .from("real_estate_listings")
            .update({ status: 'inactive' })
            .in("id", toDeactivate);

          if (!bulkDeactivateError) {
            stats.deactivated_count += toDeactivate.length;
          }
        }
      }

      // Update import log
      if (importLog?.id) {
        await supabase
          .from("crm_import_logs")
          .update({
            completed_at: new Date().toISOString(),
            status: stats.error_count === 0 ? 'success' : 'partial',
            total_in_feed: stats.total_in_feed,
            added_count: stats.added_count,
            updated_count: stats.updated_count,
            deactivated_count: stats.deactivated_count,
            error_count: stats.error_count,
            error_details: stats.errors.length > 0 ? { errors: stats.errors.slice(0, 100) } : null,
            message: `Import completed: ${stats.added_count} added, ${stats.updated_count} updated, ${stats.deactivated_count} deactivated`,
          })
          .eq("id", importLog.id);
      }

      // Update integration stats
      await supabase
        .from("agency_crm_integrations")
        .update({
          last_import_at: new Date().toISOString(),
          last_import_status: stats.error_count === 0 ? 'success' : 'partial',
          last_import_message: `${stats.added_count} dodanych, ${stats.updated_count} zaktualizowanych, ${stats.deactivated_count} dezaktywowanych`,
          total_offers_in_feed: stats.total_in_feed,
          added_count: stats.added_count,
          updated_count: stats.updated_count,
          deactivated_count: stats.deactivated_count,
          error_count: stats.error_count,
        })
        .eq("id", integration_id);

      return new Response(
        JSON.stringify({
          success: true,
          stats,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );

    } catch (importErr) {
      console.error("Import error:", importErr);

      // Update import log with error
      if (importLog?.id) {
        await supabase
          .from("crm_import_logs")
          .update({
            completed_at: new Date().toISOString(),
            status: 'failed',
            message: `Import failed: ${importErr.message}`,
            error_details: { error: importErr.message },
          })
          .eq("id", importLog.id);
      }

      // Update integration status
      await supabase
        .from("agency_crm_integrations")
        .update({
          last_import_at: new Date().toISOString(),
          last_import_status: 'failed',
          last_import_message: importErr.message,
        })
        .eq("id", integration_id);

      return new Response(
        JSON.stringify({
          success: false,
          error: importErr.message,
          stats,
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

  } catch (err) {
    console.error("Request error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// Build auth headers for XML fetch
function buildAuthHeaders(integration: any): HeadersInit {
  const headers: HeadersInit = {};
  
  if (integration.xml_login && integration.xml_password_secret_name) {
    // Basic auth - password would need to be fetched from secrets
    // For now, we just use the login if available
    const credentials = btoa(`${integration.xml_login}:`);
    headers['Authorization'] = `Basic ${credentials}`;
  }
  
  return headers;
}

// Resolve agent ID based on CRM agent mapping
async function resolveAgentId(
  supabase: any,
  integration: any,
  offer: ParsedOffer
): Promise<string> {
  const agencyId = integration.agency_id;
  
  if (!offer.crm_agent_id) {
    return agencyId; // Return agency as default agent
  }

  // Check if we have a mapping for this CRM agent
  const { data: mapping } = await supabase
    .from("crm_agent_mappings")
    .select("agent_id")
    .eq("integration_id", integration.id)
    .eq("crm_agent_id", offer.crm_agent_id)
    .single();

  if (mapping?.agent_id) {
    return mapping.agent_id;
  }

  // Try to find agent by email
  if (offer.contact_email) {
    const { data: agentByEmail } = await supabase
      .from("real_estate_agents")
      .select("id")
      .eq("email", offer.contact_email)
      .eq("parent_agent_id", agencyId)
      .single();

    if (agentByEmail?.id) {
      // Create mapping for future use
      await supabase.from("crm_agent_mappings").insert({
        integration_id: integration.id,
        crm_agent_id: offer.crm_agent_id,
        crm_agent_name: offer.crm_agent_name,
        crm_agent_email: offer.contact_email,
        crm_agent_phone: offer.contact_phone,
        agent_id: agentByEmail.id,
        auto_created: false,
      });

      return agentByEmail.id;
    }
  }

  // Create agent mapping without assigned agent (to be mapped manually)
  await supabase.from("crm_agent_mappings").upsert({
    integration_id: integration.id,
    crm_agent_id: offer.crm_agent_id,
    crm_agent_name: offer.crm_agent_name,
    crm_agent_email: offer.contact_email,
    crm_agent_phone: offer.contact_phone,
    agent_id: null, // Will be mapped manually
    auto_created: true,
  }, {
    onConflict: 'integration_id,crm_agent_id',
  });

  // Return agency as default
  return agencyId;
}
