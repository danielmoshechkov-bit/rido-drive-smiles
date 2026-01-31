import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "npm:resend@2.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.56.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface ConfirmationRequest {
  rentalId: string;
  driverEmail: string;
  driverName: string;
  vehicleInfo: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) {
      throw new Error("RESEND_API_KEY not configured");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { rentalId, driverEmail, driverName, vehicleInfo }: ConfirmationRequest = await req.json();

    if (!driverEmail || !rentalId) {
      throw new Error("Missing required fields");
    }

    // Get fleet contact info
    const { data: rental } = await supabase
      .from("vehicle_rentals")
      .select(`
        *,
        fleet:fleet_id (name, email, phone)
      `)
      .eq("id", rentalId)
      .single();

    const fleetName = rental?.fleet?.name || "Flota";
    const fleetEmail = rental?.fleet?.email || "";
    const fleetPhone = rental?.fleet?.phone || "";

    const resend = new Resend(resendApiKey);

    console.log(`Sending rental confirmation to ${driverEmail} for rental ${rentalId}`);

    const emailResponse = await resend.emails.send({
      from: "GetRido <noreply@getrido.pl>",
      to: [driverEmail],
      subject: `✅ Umowa najmu podpisana - ${vehicleInfo}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Umowa podpisana</title>
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f5f5f5; margin: 0; padding: 20px;">
          <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
            
            <!-- Header with success -->
            <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 30px; text-align: center;">
              <div style="width: 60px; height: 60px; background: rgba(255,255,255,0.2); border-radius: 50%; margin: 0 auto 15px; display: flex; align-items: center; justify-content: center;">
                <span style="font-size: 30px;">✓</span>
              </div>
              <h1 style="color: #ffffff; margin: 0; font-size: 24px;">Umowa podpisana!</h1>
              <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0; font-size: 14px;">Wszystko jest gotowe</p>
            </div>
            
            <!-- Content -->
            <div style="padding: 30px;">
              <h2 style="color: #1a1a2e; margin: 0 0 20px 0;">Cześć, ${driverName}!</h2>
              
              <p style="color: #4a5568; line-height: 1.6; margin: 0 0 20px 0;">
                Dziękujemy za podpisanie umowy najmu pojazdu. Wszystkie dokumenty zostały zapisane i są dostępne w Twoim panelu kierowcy.
              </p>
              
              <!-- Vehicle Info Box -->
              <div style="background-color: #f0fdf4; border: 1px solid #86efac; border-radius: 8px; padding: 20px; margin: 20px 0;">
                <p style="color: #166534; font-size: 12px; margin: 0 0 5px 0; text-transform: uppercase; font-weight: 600;">Wynajęty pojazd</p>
                <p style="color: #14532d; font-size: 20px; font-weight: 700; margin: 0;">${vehicleInfo}</p>
              </div>
              
              <!-- Fleet Contact -->
              <div style="background-color: #f8fafc; border-radius: 8px; padding: 20px; margin: 20px 0;">
                <p style="color: #1a1a2e; font-size: 14px; font-weight: 600; margin: 0 0 10px 0;">Kontakt z flotą:</p>
                <p style="color: #4a5568; font-size: 14px; margin: 0; line-height: 1.8;">
                  <strong>${fleetName}</strong><br>
                  ${fleetEmail ? `📧 ${fleetEmail}<br>` : ""}
                  ${fleetPhone ? `📞 ${fleetPhone}` : ""}
                </p>
              </div>

              <p style="color: #4a5568; line-height: 1.6; margin: 20px 0;">
                W razie pytań lub problemów z pojazdem, skontaktuj się z przedstawicielem floty.
              </p>
              
              <p style="color: #4a5568; line-height: 1.6; margin: 0;">
                Życzymy bezpiecznej jazdy! 🚗
              </p>
            </div>
            
            <!-- GetRido branding -->
            <div style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); padding: 25px; text-align: center;">
              <p style="color: #ffffff; font-size: 18px; font-weight: 600; margin: 0 0 5px 0;">GetRido</p>
              <p style="color: #8b93a7; font-size: 12px; margin: 0;">System zarządzania flotą i wynajmem</p>
            </div>
            
            <!-- Footer -->
            <div style="background-color: #f8fafc; padding: 20px; text-align: center; border-top: 1px solid #e2e8f0;">
              <p style="color: #64748b; font-size: 11px; margin: 0;">
                Ten e-mail został wysłany automatycznie przez system GetRido.<br>
                © ${new Date().getFullYear()} GetRido. Wszystkie prawa zastrzeżone.
              </p>
            </div>
          </div>
        </body>
        </html>
      `,
    });

    console.log("Confirmation email sent:", emailResponse);

    // Log the action
    await supabase.from("contract_signature_logs").insert({
      rental_id: rentalId,
      action_type: "email_sent",
      actor_type: "system",
      actor_email: "system",
      metadata: { type: "confirmation", email: driverEmail }
    });

    return new Response(JSON.stringify({ success: true, emailId: emailResponse.id }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Error sending confirmation:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);