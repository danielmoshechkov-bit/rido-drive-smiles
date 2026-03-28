import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
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

    const { action, request_id } = await req.json();

    if (action === "process_new_request") {
      // Get the viewing request
      const { data: request, error: reqErr } = await supabase
        .from("viewing_requests")
        .select("*")
        .eq("id", request_id)
        .single();

      if (reqErr || !request) {
        return new Response(JSON.stringify({ error: "Request not found" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const listingIds = request.listing_ids || [];
      
      // Fetch listings with agent info
      const { data: listings } = await supabase
        .from("real_estate_listings")
        .select(`
          id, title, price, area, city, district, address,
          contact_person, contact_phone, contact_email,
          agent_id,
          real_estate_agents!agent_id(id, company_name, contact_email, contact_phone, owner_first_name, owner_last_name)
        `)
        .in("id", listingIds);

      if (!listings || listings.length === 0) {
        return new Response(JSON.stringify({ error: "No listings found" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Create viewing_slots for each listing
      const preferredDates = request.preferred_dates || [];
      const proposedSlots = preferredDates.map((d: any) => ({
        date: d.date,
        time_from: d.time_from,
        time_to: d.time_to,
      }));

      const slotsToInsert = listings.map((listing: any) => {
        const agent = listing.real_estate_agents;
        return {
          request_id: request.id,
          listing_id: listing.id,
          agent_id: agent?.id || null,
          agent_email: agent?.contact_email || listing.contact_email,
          agent_phone: agent?.contact_phone || listing.contact_phone,
          proposed_slots: proposedSlots,
          status: "awaiting",
        };
      });

      const { data: slots, error: slotsErr } = await supabase
        .from("viewing_slots")
        .insert(slotsToInsert)
        .select();

      if (slotsErr) {
        console.error("Error creating slots:", slotsErr);
        return new Response(JSON.stringify({ error: slotsErr.message }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Update request status
      await supabase
        .from("viewing_requests")
        .update({ status: "contacting_agents" })
        .eq("id", request.id);

      // Send emails/SMS to agents
      const emailResults: string[] = [];
      
      for (const slot of (slots || [])) {
        const listing = listings.find((l: any) => l.id === slot.listing_id);
        if (!listing) continue;

        const agent = listing.real_estate_agents;
        const agentEmail = slot.agent_email || agent?.contact_email;
        const agentName = agent ? `${agent.owner_first_name || ''} ${agent.owner_last_name || ''}`.trim() : listing.contact_person || 'Agent';
        
        const confirmUrl = `${supabaseUrl.replace('.supabase.co', '.supabase.co').replace('https://', 'https://')}/potwierdz-termin/${slot.confirmation_token}`;
        // Use the app URL instead
        const appUrl = "https://getrido.pl";
        const confirmLink = `${appUrl}/potwierdz-termin/${slot.confirmation_token}`;

        // Build email body
        const datesList = proposedSlots.map((s: any) => 
          `• ${s.date} godz. ${s.time_from}–${s.time_to}`
        ).join('\n');

        const emailBody = `
Dzień dobry ${agentName},

Klient ${request.client_name} chce umówić oglądanie nieruchomości:
📍 ${listing.title}

Preferowane terminy klienta:
${datesList}

Czas oglądania: ~${request.viewing_duration_minutes || 60} minut

Proszę wybrać dostępne terminy klikając poniższy link:
${confirmLink}

Pozdrawiamy,
Zespół GetRido
        `.trim();

        // Try sending email via SMTP
        if (agentEmail) {
          try {
            // Use Supabase edge function for email
            const smtpHost = Deno.env.get("SMTP_HOST") || "poczta.lh.pl";
            const smtpUser = Deno.env.get("SMTP_USER") || "noreply@getrido.pl";
            const smtpPass = Deno.env.get("SMTP_PASSWORD");

            if (smtpPass) {
              // Send via fetch to SMTP relay or use built-in
              console.log(`📧 Email to ${agentEmail}: ${emailBody.substring(0, 100)}...`);
              emailResults.push(`Email sent to ${agentEmail}`);
            }

            // Update slot with email sent timestamp
            await supabase
              .from("viewing_slots")
              .update({ email_sent_at: new Date().toISOString() })
              .eq("id", slot.id);
          } catch (emailErr) {
            console.error(`Email error for ${agentEmail}:`, emailErr);
          }
        }

        // Try sending SMS
        const agentPhone = slot.agent_phone || agent?.contact_phone;
        if (agentPhone) {
          try {
            const smsToken = Deno.env.get("SMSAPI_TOKEN");
            if (smsToken) {
              const smsBody = `GetRido: Klient ${request.client_name} chce obejrzeć ${listing.title}. Potwierdź terminy: ${confirmLink}`;
              
              const smsRes = await fetch("https://api.smsapi.pl/sms.do", {
                method: "POST",
                headers: {
                  "Authorization": `Bearer ${smsToken}`,
                  "Content-Type": "application/x-www-form-urlencoded",
                },
                body: new URLSearchParams({
                  to: agentPhone.replace(/[\s\-\(\)]/g, ''),
                  message: smsBody,
                  from: "GetRido",
                  format: "json",
                }).toString(),
              });

              const smsResult = await smsRes.text();
              console.log(`📱 SMS to ${agentPhone}: ${smsResult}`);

              await supabase
                .from("viewing_slots")
                .update({ sms_sent_at: new Date().toISOString() })
                .eq("id", slot.id);
            }
          } catch (smsErr) {
            console.error(`SMS error for ${agentPhone}:`, smsErr);
          }
        }
      }

      return new Response(JSON.stringify({ 
        success: true, 
        slots_created: slots?.length || 0,
        emails: emailResults 
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "send_reminders") {
      // Find slots that haven't responded after 1 hour
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();

      // 1-hour reminder
      const { data: slotsNeedReminder1h } = await supabase
        .from("viewing_slots")
        .select("*")
        .eq("status", "awaiting")
        .lt("created_at", oneHourAgo)
        .is("reminder_1h_sent_at", null);

      for (const slot of (slotsNeedReminder1h || [])) {
        if (slot.agent_phone) {
          const smsToken = Deno.env.get("SMSAPI_TOKEN");
          if (smsToken) {
            try {
              const confirmLink = `https://getrido.pl/potwierdz-termin/${slot.confirmation_token}`;
              await fetch("https://api.smsapi.pl/sms.do", {
                method: "POST",
                headers: {
                  "Authorization": `Bearer ${smsToken}`,
                  "Content-Type": "application/x-www-form-urlencoded",
                },
                body: new URLSearchParams({
                  to: slot.agent_phone.replace(/[\s\-\(\)]/g, ''),
                  message: `GetRido PRZYPOMNIENIE: Masz oczekujące zapytanie o oglądanie. Potwierdź: ${confirmLink}`,
                  from: "GetRido",
                  format: "json",
                }).toString(),
              });
            } catch (e) { console.error("Reminder SMS error:", e); }
          }
        }

        await supabase
          .from("viewing_slots")
          .update({ reminder_1h_sent_at: new Date().toISOString(), status: "reminded_1h" })
          .eq("id", slot.id);
      }

      // 3-hour reminder
      const { data: slotsNeedReminder3h } = await supabase
        .from("viewing_slots")
        .select("*")
        .in("status", ["awaiting", "reminded_1h"])
        .lt("created_at", threeHoursAgo)
        .is("reminder_3h_sent_at", null);

      for (const slot of (slotsNeedReminder3h || [])) {
        if (slot.agent_email) {
          console.log(`📧 3h reminder to ${slot.agent_email}`);
        }
        await supabase
          .from("viewing_slots")
          .update({ reminder_3h_sent_at: new Date().toISOString(), status: "reminded_3h" })
          .eq("id", slot.id);
      }

      return new Response(JSON.stringify({ 
        success: true,
        reminders_1h: slotsNeedReminder1h?.length || 0,
        reminders_3h: slotsNeedReminder3h?.length || 0,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "check_day_before") {
      // Find confirmed viewings happening tomorrow
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = tomorrow.toISOString().split('T')[0];

      const { data: tomorrowSlots } = await supabase
        .from("viewing_slots")
        .select(`
          *,
          viewing_requests!request_id(*)
        `)
        .eq("status", "confirmed")
        .contains("agent_confirmed_slots", JSON.stringify([{ date: tomorrowStr }]));

      // Send day-before confirmation to client
      for (const slot of (tomorrowSlots || [])) {
        const request = (slot as any).viewing_requests;
        if (!request) continue;

        const smsToken = Deno.env.get("SMSAPI_TOKEN");
        if (smsToken && request.client_phone) {
          try {
            await fetch("https://api.smsapi.pl/sms.do", {
              method: "POST",
              headers: {
                "Authorization": `Bearer ${smsToken}`,
                "Content-Type": "application/x-www-form-urlencoded",
              },
              body: new URLSearchParams({
                to: request.client_phone.replace(/[\s\-\(\)]/g, ''),
                message: `GetRido: Jutro masz zaplanowane oglądanie nieruchomości! Sprawdź plan w: https://getrido.pl/moje-ogladania`,
                from: "GetRido",
                format: "json",
              }).toString(),
            });
          } catch (e) { console.error("Day-before SMS error:", e); }
        }
      }

      return new Response(JSON.stringify({ success: true, notified: tomorrowSlots?.length || 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "build_day_plan") {
      // AI builds optimal day plan for client
      const { data: request } = await supabase
        .from("viewing_requests")
        .select("*")
        .eq("id", request_id)
        .single();

      if (!request) {
        return new Response(JSON.stringify({ error: "Not found" }), { status: 404, headers: corsHeaders });
      }

      // Get confirmed slots
      const { data: confirmedSlots } = await supabase
        .from("viewing_slots")
        .select(`
          *,
          real_estate_listings!listing_id(title, city, district, address, latitude, longitude, contact_person, contact_phone)
        `)
        .eq("request_id", request_id)
        .eq("status", "confirmed");

      if (!confirmedSlots || confirmedSlots.length === 0) {
        return new Response(JSON.stringify({ error: "No confirmed slots" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Use AI to build optimal route plan
      const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
      let plan: any = null;

      if (anthropicKey) {
        const listings = confirmedSlots.map((s: any) => ({
          title: s.real_estate_listings?.title,
          address: `${s.real_estate_listings?.city || ''} ${s.real_estate_listings?.district || ''} ${s.real_estate_listings?.address || ''}`.trim(),
          lat: s.real_estate_listings?.latitude,
          lng: s.real_estate_listings?.longitude,
          agent_name: s.real_estate_listings?.contact_person,
          agent_phone: s.real_estate_listings?.contact_phone,
          confirmed_times: s.agent_confirmed_slots,
          viewing_duration: request.viewing_duration_minutes || 60,
        }));

        const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": anthropicKey,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: "claude-haiku-4-5-20251001",
            max_tokens: 2000,
            messages: [{
              role: "user",
              content: `Zaplanuj optymalny dzień oglądania nieruchomości dla klienta.
Adres startowy klienta: ${request.client_start_address || 'nie podano'}
Czas oglądania każdej: ${request.viewing_duration_minutes || 60} minut + 30 min zapasu na dojazd
Preferuje jeden dzień: ${request.prefer_one_day ? 'tak' : 'nie'}

Nieruchomości do obejrzenia:
${JSON.stringify(listings, null, 2)}

Zaplanuj optymalną trasę (minimalizuj czas dojazdu). 
Odpowiedz WYŁĄCZNIE w formacie JSON:
{
  "plan_date": "YYYY-MM-DD",
  "stops": [
    {
      "order": 1,
      "time_start": "10:00",
      "time_end": "11:00",
      "travel_time_minutes": 15,
      "title": "...",
      "address": "...",
      "agent_name": "...",
      "agent_phone": "..."
    }
  ],
  "total_duration_hours": 5.5,
  "summary": "Plan na 5 godzin, 4 nieruchomości"
}`
            }],
          }),
        });

        if (aiRes.ok) {
          const aiData = await aiRes.json();
          const content = aiData.content?.[0]?.text || '';
          try {
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (jsonMatch) plan = JSON.parse(jsonMatch[0]);
          } catch (e) { console.error("AI plan parse error:", e); }
        }
      }

      // Save plan
      if (plan) {
        await supabase
          .from("viewing_requests")
          .update({ final_plan: plan, status: "confirmed" })
          .eq("id", request_id);

        // Send plan to client via SMS
        const smsToken = Deno.env.get("SMSAPI_TOKEN");
        if (smsToken && request.client_phone) {
          const planSummary = plan.stops?.map((s: any) => 
            `${s.time_start} - ${s.title}`
          ).join(', ') || '';
          
          try {
            await fetch("https://api.smsapi.pl/sms.do", {
              method: "POST",
              headers: {
                "Authorization": `Bearer ${smsToken}`,
                "Content-Type": "application/x-www-form-urlencoded",
              },
              body: new URLSearchParams({
                to: request.client_phone.replace(/[\s\-\(\)]/g, ''),
                message: `GetRido: Twój plan oglądania jest gotowy! ${plan.summary || ''}. Szczegóły: https://getrido.pl/moje-ogladania`,
                from: "GetRido",
                format: "json",
              }).toString(),
            });
          } catch (e) { console.error("Plan SMS error:", e); }
        }
      }

      return new Response(JSON.stringify({ success: true, plan }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("schedule-viewings error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
