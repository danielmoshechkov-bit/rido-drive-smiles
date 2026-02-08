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
  language?: string;
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

    const { email, first_name, last_name, activation_link, language = "pl", is_test }: EmailRequest = await req.json();

    console.log(`Processing email request for: ${email}, language: ${language}`);

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) {
      console.error("Invalid email format:", email);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `Nieprawidłowy format adresu email: ${email}` 
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    // Select template and subject based on language
    let template: string;
    let subject: string;
    
    switch (language) {
      case "en":
        template = emailSettings.registration_template_en || emailSettings.registration_template;
        subject = emailSettings.registration_subject_en || emailSettings.registration_subject;
        break;
      case "ru":
        template = emailSettings.registration_template_ru || emailSettings.registration_template;
        subject = emailSettings.registration_subject_ru || emailSettings.registration_subject;
        break;
      case "ua":
        template = emailSettings.registration_template_ua || emailSettings.registration_template;
        subject = emailSettings.registration_subject_ua || emailSettings.registration_subject;
        break;
      case "kz":
        template = emailSettings.registration_template_kz || emailSettings.registration_template;
        subject = emailSettings.registration_subject_kz || emailSettings.registration_subject;
        break;
      default:
        template = emailSettings.registration_template;
        subject = emailSettings.registration_subject;
    }

    console.log(`Using ${language} template for email`);

    // Replace template variables
    let htmlContent = template
      .replace(/\{\{first_name\}\}/g, first_name || "Kierowco")
      .replace(/\{\{last_name\}\}/g, last_name || "")
      .replace(/\{\{email\}\}/g, email)
      .replace(/\{\{activation_link\}\}/g, activation_link);

    const senderName = emailSettings.sender_name || "RIDO";
    const senderEmail = emailSettings.sender_email || emailSettings.smtp_user;
    const finalSubject = is_test ? `[TEST] ${subject}` : subject;

    console.log(`Sending email from: ${senderName} <${senderEmail}>`);
    console.log(`Subject: ${finalSubject}`);
    console.log(`SMTP Host: ${emailSettings.smtp_host}:${emailSettings.smtp_port}`);

    // Configure SMTP client
    // Port 587 typically uses STARTTLS, port 465 uses direct TLS
    const port = emailSettings.smtp_port || 587;
    const useTls = port === 465;
    
    const client = new SMTPClient({
      connection: {
        hostname: emailSettings.smtp_host || "getrido.pl",
        port: port,
        tls: useTls,
        auth: {
          username: emailSettings.smtp_user || "kontakt@getrido.pl",
          password: smtpPassword,
        },
      },
    });

    // Send email with proper formatting
    // Minify HTML to avoid SMTP line length issues (RFC 2821 limit: 998 chars per line)
    const minifiedHtml = htmlContent
      .replace(/\r\n/g, '\n')
      .replace(/\n\s+/g, ' ')
      .replace(/>\s+</g, '><')
      .replace(/\s{2,}/g, ' ')
      .trim();
    
    await client.send({
      from: `${senderName} <${senderEmail}>`,
      to: [email],
      subject: finalSubject,
      content: "Twoja przeglądarka nie obsługuje HTML. Proszę otworzyć w nowoczesnej przeglądarce.",
      html: minifiedHtml,
    });

    await client.close();

    console.log("Email sent successfully to:", email, "in language:", language);

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
