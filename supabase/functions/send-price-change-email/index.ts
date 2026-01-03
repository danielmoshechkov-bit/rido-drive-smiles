import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "npm:resend@2.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.56.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface PriceChangeRequest {
  driver_id: string;
  vehicle_id: string;
  old_price: number;
  new_price: number;
  notification_id: string;
}

serve(async (req: Request): Promise<Response> => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { driver_id, vehicle_id, old_price, new_price, notification_id }: PriceChangeRequest = await req.json();

    console.log("Processing price change email for driver:", driver_id);

    // Get driver info
    const { data: driver, error: driverError } = await supabase
      .from("drivers")
      .select("email, first_name, last_name, preferred_language")
      .eq("id", driver_id)
      .single();

    if (driverError || !driver?.email) {
      console.error("Driver not found or no email:", driverError);
      return new Response(
        JSON.stringify({ error: "Driver not found or no email" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Get vehicle info
    const { data: vehicle } = await supabase
      .from("vehicles")
      .select("brand, model, plate")
      .eq("id", vehicle_id)
      .single();

    const vehicleName = vehicle 
      ? `${vehicle.brand} ${vehicle.model} (${vehicle.plate})`
      : "Twój pojazd";

    const driverName = driver.first_name || "Kierowco";

    // Send email
    const emailResponse = await resend.emails.send({
      from: "RIDO <no-reply@getrido.pl>",
      to: [driver.email],
      subject: "Zmiana stawki wynajmu - get RIDO",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #333; margin: 0;">get RIDO</h1>
          </div>
          
          <h2 style="color: #333;">Stawka za wynajem została zmieniona</h2>
          
          <p>Cześć ${driverName},</p>
          
          <p>Informujemy, że stawka za wynajem pojazdu <strong>${vehicleName}</strong> została zmieniona:</p>
          
          <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 0 0 10px 0;"><strong>Stara stawka:</strong> <span style="text-decoration: line-through; color: #666;">${old_price} zł/tydzień</span></p>
            <p style="margin: 0;"><strong>Nowa stawka:</strong> <span style="color: #4F46E5; font-size: 18px;">${new_price} zł/tydzień</span></p>
          </div>
          
          <p><strong>⚠️ Ważne:</strong> Musisz zalogować się do portalu i zaakceptować zmianę stawki, aby móc dalej korzystać z aplikacji.</p>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="https://getrido.pl/driver" style="background-color: #000; color: #fff; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">Zaloguj się i zaakceptuj</a>
          </div>
          
          <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
          <p style="color: #999; font-size: 12px; text-align: center;">© 2025 get RIDO. Wszelkie prawa zastrzeżone.</p>
        </div>
      `,
    });

    console.log("Email sent successfully:", emailResponse);

    // Update notification to mark email as sent
    await supabase
      .from("price_change_notifications")
      .update({
        email_sent: true,
        email_sent_at: new Date().toISOString()
      })
      .eq("id", notification_id);

    return new Response(
      JSON.stringify({ success: true, emailId: emailResponse.id }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    console.error("Error sending price change email:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
});
