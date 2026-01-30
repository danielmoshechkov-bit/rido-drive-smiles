import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "npm:resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface InvitationRequest {
  rentalId: string;
  driverEmail: string;
  driverName: string;
  vehicleInfo: string;
  portalLink: string;
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) {
      throw new Error("RESEND_API_KEY not configured");
    }

    const resend = new Resend(resendApiKey);
    const { rentalId, driverEmail, driverName, vehicleInfo, portalLink }: InvitationRequest = await req.json();

    // Validate required fields
    if (!driverEmail || !portalLink) {
      throw new Error("Missing required fields: driverEmail or portalLink");
    }

    console.log(`Sending rental invitation to ${driverEmail} for rental ${rentalId}`);

    const emailResponse = await resend.emails.send({
      from: "GetRido <noreply@getrido.pl>",
      to: [driverEmail],
      subject: `Umowa najmu pojazdu - ${vehicleInfo}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Umowa najmu pojazdu</title>
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f5f5f5; margin: 0; padding: 20px;">
          <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
            
            <!-- Header -->
            <div style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); padding: 30px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 24px;">GetRido</h1>
              <p style="color: #8b93a7; margin: 10px 0 0 0; font-size: 14px;">System wynajmu pojazdów</p>
            </div>
            
            <!-- Content -->
            <div style="padding: 30px;">
              <h2 style="color: #1a1a2e; margin: 0 0 20px 0;">Witaj, ${driverName || "Kliencie"}!</h2>
              
              <p style="color: #4a5568; line-height: 1.6; margin: 0 0 20px 0;">
                Przygotowaliśmy dla Ciebie umowę najmu pojazdu. Prosimy o zapoznanie się z dokumentem i złożenie podpisu elektronicznego.
              </p>
              
              <!-- Vehicle Info Box -->
              <div style="background-color: #f8fafc; border-radius: 8px; padding: 20px; margin: 20px 0;">
                <p style="color: #64748b; font-size: 12px; margin: 0 0 5px 0; text-transform: uppercase;">Pojazd</p>
                <p style="color: #1a1a2e; font-size: 18px; font-weight: 600; margin: 0;">${vehicleInfo}</p>
              </div>
              
              <p style="color: #4a5568; line-height: 1.6; margin: 0 0 25px 0;">
                Kliknij przycisk poniżej, aby przejść do portalu i podpisać umowę:
              </p>
              
              <!-- CTA Button -->
              <div style="text-align: center; margin: 30px 0;">
                <a href="${portalLink}" style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: #ffffff; text-decoration: none; padding: 16px 40px; border-radius: 8px; font-weight: 600; font-size: 16px; display: inline-block;">
                  Przejdź do umowy
                </a>
              </div>
              
              <p style="color: #64748b; font-size: 12px; margin: 20px 0 0 0;">
                Jeśli przycisk nie działa, skopiuj i wklej ten link do przeglądarki:<br>
                <a href="${portalLink}" style="color: #10b981; word-break: break-all;">${portalLink}</a>
              </p>
            </div>
            
            <!-- Footer -->
            <div style="background-color: #f8fafc; padding: 20px; text-align: center; border-top: 1px solid #e2e8f0;">
              <p style="color: #64748b; font-size: 12px; margin: 0;">
                Ten e-mail został wysłany automatycznie przez system GetRido.<br>
                © ${new Date().getFullYear()} GetRido. Wszystkie prawa zastrzeżone.
              </p>
            </div>
          </div>
        </body>
        </html>
      `,
    });

    console.log("Email sent successfully:", emailResponse);

    return new Response(JSON.stringify({ success: true, emailId: emailResponse.id }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Error sending rental invitation:", error);
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
