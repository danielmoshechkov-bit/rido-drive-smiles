import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

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
    console.log("Starting send-registration-email function");

    const smtpPassword = Deno.env.get("SMTP_PASSWORD");
    if (!smtpPassword) {
      console.error("SMTP_PASSWORD not configured");
      throw new Error("SMTP_PASSWORD nie jest skonfigurowany. Dodaj hasło do Supabase secrets.");
    }

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

    console.log("Email settings loaded:", {
      smtp_host: emailSettings.smtp_host,
      smtp_port: emailSettings.smtp_port,
      smtp_user: emailSettings.smtp_user,
      smtp_secure: emailSettings.smtp_secure
    });

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

    const senderName = emailSettings.sender_name || "RIDO";
    const senderEmail = emailSettings.sender_email || emailSettings.smtp_user;
    const subject = is_test 
      ? `[TEST] ${emailSettings.registration_subject}`
      : emailSettings.registration_subject;

    console.log(`Sending email from: ${senderName} <${senderEmail}>`);
    console.log(`Subject: ${subject}`);
    console.log(`SMTP Host: ${emailSettings.smtp_host}:${emailSettings.smtp_port}`);

    // Configure SMTP client
    const client = new SMTPClient({
      connection: {
        hostname: emailSettings.smtp_host || "getrido.pl",
        port: emailSettings.smtp_port || 587,
        tls: emailSettings.smtp_secure !== false,
        auth: {
          username: emailSettings.smtp_user || "kontakt@getrido.pl",
          password: smtpPassword,
        },
      },
    });

    // Send email
    await client.send({
      from: `${senderName} <${senderEmail}>`,
      to: [email],
      subject: subject,
      content: "Twoja przeglądarka nie obsługuje HTML. Proszę otworzyć w nowoczesnej przeglądarce.",
      html: htmlContent,
    });

    await client.close();

    console.log("Email sent successfully to:", email);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Email wysłany pomyślnie"
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
