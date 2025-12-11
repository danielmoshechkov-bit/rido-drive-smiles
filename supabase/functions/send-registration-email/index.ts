import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "npm:resend@2.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface EmailRequest {
  email: string;
  first_name: string;
  last_name?: string;
  activation_link: string;
  is_test?: boolean;
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) {
      console.error("RESEND_API_KEY not configured");
      throw new Error("RESEND_API_KEY nie jest skonfigurowany. Dodaj klucz API w ustawieniach Supabase.");
    }

    const resend = new Resend(resendApiKey);

    // Create Supabase client to fetch email settings
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch email settings from database
    const { data: emailSettings, error: settingsError } = await supabase
      .from("email_settings")
      .select("*")
      .eq("id", "00000000-0000-0000-0000-000000000001")
      .single();

    if (settingsError || !emailSettings) {
      console.error("Error fetching email settings:", settingsError);
      throw new Error("Nie udało się pobrać ustawień email");
    }

    const { email, first_name, last_name, activation_link, is_test }: EmailRequest = await req.json();

    if (!email) {
      throw new Error("Email jest wymagany");
    }

    console.log(`Preparing to send email to: ${email}, is_test: ${is_test}`);

    // Replace template variables
    let htmlContent = emailSettings.registration_template
      .replace(/\{\{first_name\}\}/g, first_name || "Kierowco")
      .replace(/\{\{last_name\}\}/g, last_name || "")
      .replace(/\{\{email\}\}/g, email)
      .replace(/\{\{activation_link\}\}/g, activation_link);

    // Determine sender - use verified domain or fallback to resend.dev for testing
    let fromEmail = emailSettings.sender_email;
    
    // If domain is not verified, use resend.dev for testing
    if (!fromEmail.endsWith("@resend.dev") && is_test) {
      console.log("Using resend.dev for test email (domain may not be verified)");
    }

    const senderName = emailSettings.sender_name || "RIDO";
    const subject = is_test 
      ? `[TEST] ${emailSettings.registration_subject}`
      : emailSettings.registration_subject;

    console.log(`Sending email from: ${senderName} <${fromEmail}>`);
    console.log(`Subject: ${subject}`);

    const emailResponse = await resend.emails.send({
      from: `${senderName} <${fromEmail}>`,
      to: [email],
      subject: subject,
      html: htmlContent,
    });

    console.log("Email sent successfully:", emailResponse);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Email wysłany pomyślnie",
        id: emailResponse.id 
      }), 
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error: any) {
    console.error("Error in send-registration-email function:", error);
    
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error.message || "Wystąpił błąd podczas wysyłania emaila"
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
