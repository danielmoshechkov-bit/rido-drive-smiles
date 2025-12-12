import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface PasswordResetRequest {
  email: string;
  language?: string;
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const smtpPassword = Deno.env.get("SMTP_PASSWORD");
    
    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

    const { email, language = "pl" }: PasswordResetRequest = await req.json();
    console.log(`Password reset request for: ${email}, language: ${language}`);

    if (!email || !email.includes("@")) {
      return new Response(
        JSON.stringify({ error: "Invalid email address" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get driver info for first name
    const { data: driver } = await supabase
      .from("drivers")
      .select("first_name")
      .eq("email", email)
      .single();
    
    const firstName = driver?.first_name || "Użytkownik";

    // Generate password reset link
    const siteUrl = "https://getrido.pl";
    const { data: resetData, error: resetError } = await supabase.auth.admin.generateLink({
      type: "recovery",
      email: email,
      options: {
        redirectTo: `${siteUrl}/reset-password`,
      },
    });

    if (resetError) {
      console.error("Error generating reset link:", resetError);
      return new Response(
        JSON.stringify({ error: "Failed to generate reset link" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const resetLink = resetData.properties?.action_link;
    console.log("Reset link generated successfully");

    // Get email settings from database
    const { data: emailSettings, error: settingsError } = await supabase
      .from("email_settings")
      .select("*")
      .eq("id", "00000000-0000-0000-0000-000000000001")
      .single();

    if (settingsError) {
      console.error("Error fetching email settings:", settingsError);
      return new Response(
        JSON.stringify({ error: "Failed to fetch email settings" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Select template based on language
    let template = emailSettings.password_reset_template || "";
    let subject = emailSettings.password_reset_subject || "Resetowanie hasła w RIDO";

    switch (language) {
      case "en":
        template = emailSettings.password_reset_template_en || template;
        subject = emailSettings.password_reset_subject_en || subject;
        break;
      case "ru":
        template = emailSettings.password_reset_template_ru || template;
        subject = emailSettings.password_reset_subject_ru || subject;
        break;
      case "ua":
        template = emailSettings.password_reset_template_ua || template;
        subject = emailSettings.password_reset_subject_ua || subject;
        break;
      case "kz":
        template = emailSettings.password_reset_template_kz || template;
        subject = emailSettings.password_reset_subject_kz || subject;
        break;
    }

    // Replace placeholders
    const htmlContent = template
      .replace(/\{\{first_name\}\}/g, firstName)
      .replace(/\{\{reset_link\}\}/g, resetLink || "");

    // Get SMTP settings
    const smtpHost = emailSettings.smtp_host || "server546721.nazwa.pl";
    const smtpPort = emailSettings.smtp_port || 465;
    const smtpUser = emailSettings.smtp_user || "kontakt@getrido.pl";
    const senderEmail = emailSettings.sender_email || "kontakt@getrido.pl";
    const senderName = emailSettings.sender_name || "RIDO";

    if (!smtpPassword) {
      console.error("SMTP password not configured");
      return new Response(
        JSON.stringify({ error: "Email service not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Send email via SMTP
    const client = new SMTPClient({
      connection: {
        hostname: smtpHost,
        port: smtpPort,
        tls: true,
        auth: {
          username: smtpUser,
          password: smtpPassword,
        },
      },
    });

    await client.send({
      from: `${senderName} <${senderEmail}>`,
      to: email,
      subject: subject,
      content: "Twoja przeglądarka nie obsługuje HTML.",
      html: htmlContent,
      mimeContent: [
        {
          mimeType: "text/html; charset=utf-8",
          content: htmlContent,
          transferEncoding: "quoted-printable",
        },
      ],
    });

    await client.close();
    console.log("Password reset email sent successfully to:", email);

    return new Response(
      JSON.stringify({ success: true, message: "Password reset email sent" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in send-password-reset-email:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
};

serve(handler);
