import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SendInvoiceRequest {
  driver_id: string;
  driver_name: string;
  fleet_id: string;
  invoice_month: string;
  file_url: string;
  file_name: string;
  invoice_amount: number;
  paid_amount: number;
  remaining_amount: number;
}

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body: SendInvoiceRequest = await req.json();
    const {
      driver_id,
      driver_name,
      fleet_id,
      invoice_month,
      file_url,
      file_name,
      invoice_amount,
      paid_amount,
      remaining_amount,
    } = body;

    console.log(`Processing invoice for driver ${driver_name}, fleet ${fleet_id}`);

    // Get fleet invoice_email
    const { data: fleet, error: fleetError } = await supabaseAdmin
      .from("fleets")
      .select("invoice_email, name")
      .eq("id", fleet_id)
      .maybeSingle();

    if (fleetError) {
      console.error("Fleet fetch error:", fleetError);
      throw new Error("Nie znaleziono floty");
    }

    // Get driver email
    const { data: driver } = await supabaseAdmin
      .from("drivers")
      .select("email")
      .eq("id", driver_id)
      .maybeSingle();

    const driverEmail = driver?.email;
    console.log(`Driver email: ${driverEmail}, Fleet email: ${fleet?.invoice_email}`);

    if (!fleet?.invoice_email && !driverEmail) {
      console.log("No email addresses configured");
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: "Brak skonfigurowanych adresów email" 
        }),
        { 
          status: 200, 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        }
      );
    }

    // Format currency
    const formatPLN = (amount: number) => 
      new Intl.NumberFormat("pl-PL", { style: "currency", currency: "PLN" }).format(amount);

    // Capitalize first letter of month
    const monthCapitalized = invoice_month.charAt(0).toUpperCase() + invoice_month.slice(1);

    // Send email via Resend
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) {
      console.error("RESEND_API_KEY not configured");
      return new Response(
        JSON.stringify({ success: false, message: "Email service not configured" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const resend = new Resend(resendApiKey);

    const emailSubject = `Faktura ${driver_name} ${monthCapitalized}`;
    
    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #2563eb; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
          .content { background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; }
          .summary { background: white; padding: 15px; border-radius: 8px; margin: 15px 0; }
          .row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #f3f4f6; }
          .row:last-child { border-bottom: none; }
          .label { color: #6b7280; }
          .value { font-weight: 600; }
          .total { font-size: 1.2em; color: #2563eb; }
          .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 0.9em; }
          .btn { display: inline-block; background: #2563eb; color: white; padding: 12px 24px; 
                 text-decoration: none; border-radius: 6px; margin-top: 15px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 style="margin: 0;">📄 Nowa faktura od kierowcy</h1>
          </div>
          <div class="content">
            <p>Kierowca <strong>${driver_name}</strong> przesłał fakturę za <strong>${monthCapitalized}</strong>.</p>
            
            <div class="summary">
              <div class="row">
                <span class="label">Kwota faktury:</span>
                <span class="value">${formatPLN(invoice_amount)}</span>
              </div>
              <div class="row">
                <span class="label">Zapłacone (gotówka):</span>
                <span class="value" style="color: #16a34a;">-${formatPLN(paid_amount)}</span>
              </div>
              <div class="row">
                <span class="label">Pozostało do zapłaty:</span>
                <span class="value total">${formatPLN(remaining_amount)}</span>
              </div>
            </div>
            
            <p><strong>Załącznik:</strong> ${file_name}</p>
            
            <a href="${file_url}" class="btn">Pobierz fakturę</a>
          </div>
          <div class="footer">
            <p>Wiadomość wygenerowana automatycznie przez system RIDO</p>
          </div>
        </div>
      </body>
      </html>
    `;

    // Send email to fleet if configured
    if (fleet?.invoice_email) {
      const { data: emailData, error: emailError } = await resend.emails.send({
        from: "RIDO <faktury@resend.dev>",
        to: [fleet.invoice_email],
        subject: emailSubject,
        html: emailHtml,
      });

      if (emailError) {
        console.error("Fleet email send error:", emailError);
      } else {
        console.log("Fleet email sent successfully:", emailData);
      }
    }

    // Send email to driver with invoice copy
    if (driverEmail) {
      const driverEmailSubject = `Faktura ${monthCapitalized} - wystawiona automatycznie`;
      
      const driverEmailHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #16a34a; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
            .content { background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; }
            .summary { background: white; padding: 15px; border-radius: 8px; margin: 15px 0; }
            .row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #f3f4f6; }
            .row:last-child { border-bottom: none; }
            .label { color: #6b7280; }
            .value { font-weight: 600; }
            .total { font-size: 1.2em; color: #16a34a; }
            .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 0.9em; }
            .btn { display: inline-block; background: #16a34a; color: white; padding: 12px 24px; 
                   text-decoration: none; border-radius: 6px; margin-top: 15px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1 style="margin: 0;">📄 Wystawiono fakturę w Twoim imieniu</h1>
            </div>
            <div class="content">
              <p>System RIDO automatycznie wystawił fakturę za <strong>${monthCapitalized}</strong>.</p>
              
              <div class="summary">
                <div class="row">
                  <span class="label">Kwota faktury brutto:</span>
                  <span class="value">${formatPLN(invoice_amount)}</span>
                </div>
                <div class="row">
                  <span class="label">W tym gotówka:</span>
                  <span class="value">${formatPLN(paid_amount)}</span>
                </div>
                <div class="row">
                  <span class="label">Do przelewu:</span>
                  <span class="value total">${formatPLN(remaining_amount)}</span>
                </div>
              </div>
              
              <p><strong>Załącznik:</strong> ${file_name}</p>
              <p>Kopia faktury została wysłana do Twojej floty.</p>
              
              <a href="${file_url}" class="btn">Pobierz fakturę</a>
            </div>
            <div class="footer">
              <p>Wiadomość wygenerowana automatycznie przez system RIDO</p>
            </div>
          </div>
        </body>
        </html>
      `;

      const { data: driverEmailData, error: driverEmailError } = await resend.emails.send({
        from: "RIDO <faktury@resend.dev>",
        to: [driverEmail],
        subject: driverEmailSubject,
        html: driverEmailHtml,
      });

      if (driverEmailError) {
        console.error("Driver email send error:", driverEmailError);
      } else {
        console.log("Driver email sent successfully:", driverEmailData);
      }
    }

    console.log("Email(s) sent successfully");

    // Update invoice record with sent_at
    await supabaseAdmin
      .from("driver_invoices")
      .update({ sent_at: new Date().toISOString(), status: "sent" })
      .eq("driver_id", driver_id)
      .is("sent_at", null)
      .order("created_at", { ascending: false })
      .limit(1);

    return new Response(
      JSON.stringify({ success: true, message: "Faktura wysłana pomyślnie" }),
      { 
        status: 200, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );
  } catch (error: any) {
    console.error("Error in send-driver-invoice:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { 
        status: 500, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );
  }
});
