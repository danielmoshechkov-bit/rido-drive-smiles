import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function generateEmailTemplate(
  type: string,
  data: {
    companyName: string;
    companyNip: string;
    companyAddress: string;
    companyBankAccount: string;
    companyBankName: string;
    buyerName: string;
    invoiceNumber: string;
    grossAmount: string;
    netAmount: string;
    dueDate: string;
    issueDate: string;
    customMessage?: string;
  }
): { subject: string; html: string } {
  const {
    companyName, companyNip, companyAddress, companyBankAccount, companyBankName,
    buyerName, invoiceNumber, grossAmount, netAmount, dueDate, issueDate, customMessage,
  } = data;

  const bankSection = companyBankAccount
    ? `
      <div style="background: #e8f4f8; padding: 15px; border-radius: 8px; margin: 20px 0;">
        <p style="margin: 0 0 10px 0; font-weight: bold; color: #2980b9;">💳 Dane do przelewu:</p>
        <table style="width: 100%; border-collapse: collapse;">
          <tr><td style="padding: 5px 0; color: #666;">Bank:</td><td style="padding: 5px 0; font-weight: 500;">${companyBankName || "-"}</td></tr>
          <tr><td style="padding: 5px 0; color: #666;">Numer konta:</td><td style="padding: 5px 0; font-weight: 500; font-family: monospace;">${companyBankAccount}</td></tr>
          <tr><td style="padding: 5px 0; color: #666;">Tytuł przelewu:</td><td style="padding: 5px 0; font-weight: 500;">${invoiceNumber}</td></tr>
        </table>
      </div>
    `
    : "";

  const footerHtml = `
    <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; color: #666; font-size: 12px;">
      <p>Z poważaniem,<br/><strong>${companyName}</strong></p>
      <p style="margin-top: 5px; color: #999;">
        NIP: ${companyNip || '-'}<br/>
        ${companyAddress || ''}
      </p>
      ${companyBankAccount ? `<p style="color: #999;">Nr konta: ${companyBankAccount}</p>` : ''}
      <p style="margin-top: 15px; color: #999;">
        Ta wiadomość została wygenerowana automatycznie przez system GetRido.pl
      </p>
    </div>
  `;

  if (type === "payment_reminder") {
    return {
      subject: `Przypomnienie o płatności - faktura ${invoiceNumber}`,
      html: `
        <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #fff; border: 1px solid #e0e0e0; border-radius: 10px; overflow: hidden;">
          <div style="background: linear-gradient(135deg, #F39C12 0%, #f1c40f 100%); padding: 30px; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 24px;">⏰ Przypomnienie o płatności</h1>
          </div>
          <div style="padding: 30px;">
            <p style="font-size: 16px; color: #333;">Szanowni Państwo,</p>
            <p style="color: #555;">Uprzejmie przypominamy o zbliżającym się terminie płatności faktury:</p>
            <div style="background: #fef9e7; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #F39C12;">
              <table style="width: 100%; border-collapse: collapse;">
                <tr><td style="padding: 8px 0; color: #666;">Numer faktury:</td><td style="padding: 8px 0; font-weight: bold;">${invoiceNumber}</td></tr>
                <tr><td style="padding: 8px 0; color: #666;">Kwota do zapłaty:</td><td style="padding: 8px 0; font-weight: bold; font-size: 18px; color: #F39C12;">${grossAmount} PLN</td></tr>
                <tr><td style="padding: 8px 0; color: #666;">Termin płatności:</td><td style="padding: 8px 0; font-weight: bold; color: #e74c3c;">${dueDate}</td></tr>
              </table>
            </div>
            ${customMessage ? `<div style="background: #f0f0f0; padding: 15px; border-radius: 8px; margin: 20px 0; font-style: italic;">${customMessage}</div>` : ""}
            ${bankSection}
            <p style="background: #fef3e2; padding: 12px; border-radius: 5px; color: #8a6d3b;">
              💡 Jeżeli płatność została już dokonana, prosimy o zignorowanie tej wiadomości.
            </p>
            ${footerHtml}
          </div>
        </div>
      `,
    };
  }

  if (type === "overdue_notice") {
    return {
      subject: `⚠️ Faktura przeterminowana - ${invoiceNumber}`,
      html: `
        <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #fff; border: 1px solid #e0e0e0; border-radius: 10px; overflow: hidden;">
          <div style="background: linear-gradient(135deg, #E74C3C 0%, #c0392b 100%); padding: 30px; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 24px;">⚠️ Faktura przeterminowana</h1>
          </div>
          <div style="padding: 30px;">
            <p style="font-size: 16px; color: #333;">Szanowni Państwo,</p>
            <p style="color: #555;">Informujemy, że termin płatności poniższej faktury już minął:</p>
            <div style="background: #fdedec; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #E74C3C;">
              <table style="width: 100%; border-collapse: collapse;">
                <tr><td style="padding: 8px 0; color: #666;">Numer faktury:</td><td style="padding: 8px 0; font-weight: bold;">${invoiceNumber}</td></tr>
                <tr><td style="padding: 8px 0; color: #666;">Kwota zaległa:</td><td style="padding: 8px 0; font-weight: bold; font-size: 20px; color: #E74C3C;">${grossAmount} PLN</td></tr>
                <tr><td style="padding: 8px 0; color: #666;">Termin płatności:</td><td style="padding: 8px 0; font-weight: bold; color: #c0392b; text-decoration: line-through;">${dueDate}</td></tr>
              </table>
            </div>
            ${bankSection}
            <div style="background: #f8d7da; padding: 15px; border-radius: 8px; margin: 20px 0; border: 1px solid #f5c6cb;">
              <p style="margin: 0; color: #721c24; font-weight: 500;">
                🔴 Prosimy o pilne uregulowanie należności w celu uniknięcia dodatkowych konsekwencji.
              </p>
            </div>
            ${footerHtml}
          </div>
        </div>
      `,
    };
  }

  // Default: new_invoice
  return {
    subject: `Faktura ${invoiceNumber} od ${companyName}`,
    html: `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #fff; border: 1px solid #e0e0e0; border-radius: 10px; overflow: hidden;">
        <div style="background: linear-gradient(135deg, #6C5CE7 0%, #a29bfe 100%); padding: 30px; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 24px;">📄 Nowa faktura</h1>
        </div>
        <div style="padding: 30px;">
          <p style="font-size: 16px; color: #333;">Szanowni Państwo,</p>
          <p style="color: #555;">Wystawiliśmy nową fakturę dla firmy <strong>${buyerName}</strong>:</p>
          <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #6C5CE7;">
            <table style="width: 100%; border-collapse: collapse;">
              <tr><td style="padding: 8px 0; color: #666;">Numer faktury:</td><td style="padding: 8px 0; font-weight: bold;">${invoiceNumber}</td></tr>
              <tr><td style="padding: 8px 0; color: #666;">Data wystawienia:</td><td style="padding: 8px 0; font-weight: 500;">${issueDate}</td></tr>
              <tr><td style="padding: 8px 0; color: #666;">Kwota netto:</td><td style="padding: 8px 0; font-weight: 500;">${netAmount} PLN</td></tr>
              <tr><td style="padding: 8px 0; color: #666;">Kwota brutto:</td><td style="padding: 8px 0; font-weight: bold; font-size: 18px; color: #6C5CE7;">${grossAmount} PLN</td></tr>
              <tr><td style="padding: 8px 0; color: #666;">Termin płatności:</td><td style="padding: 8px 0; font-weight: 500; color: #e74c3c;">${dueDate}</td></tr>
            </table>
          </div>
          ${bankSection}
          ${footerHtml}
        </div>
      </div>
    `,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { invoice_id, type = "new_invoice", custom_message, recipient_email } = body;

    if (!invoice_id) {
      throw new Error("Missing required field: invoice_id");
    }

    console.log(`Processing ${type} email for invoice: ${invoice_id}`);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch from user_invoices (the actual table used by the app)
    const { data: invoice, error: invoiceError } = await supabase
      .from("user_invoices")
      .select("*")
      .eq("id", invoice_id)
      .single();

    if (invoiceError || !invoice) {
      console.error("Invoice not found in user_invoices:", invoiceError);
      throw new Error(`Faktura nie znaleziona: ${invoiceError?.message || 'brak danych'}`);
    }

    // Get company settings for the seller
    const { data: company } = await supabase
      .from("company_settings")
      .select("*")
      .eq("user_id", invoice.user_id)
      .maybeSingle();

    // Determine recipient email
    let toEmail = recipient_email;
    if (!toEmail) {
      // Try buyer_email from invoice
      toEmail = invoice.buyer_email;
    }
    if (!toEmail) {
      throw new Error("Brak adresu email odbiorcy. Dodaj email do danych nabywcy.");
    }

    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!resendKey) {
      throw new Error("RESEND_API_KEY not configured");
    }

    const resend = new Resend(resendKey);

    const companyName = company?.company_name || "GetRido";
    const companyNip = company?.nip || "";
    const companyAddress = [company?.address_street, company?.address_zip, company?.address_city]
      .filter(Boolean).join(", ");
    const companyBankAccount = company?.bank_account || "";
    const companyBankName = company?.bank_name || "";

    const buyerName = invoice.buyer_name || "Szanowny Kliencie";
    const invoiceNumber = invoice.invoice_number || "";
    const grossAmount = (invoice.total_gross || invoice.gross_total || 0).toLocaleString("pl-PL", { minimumFractionDigits: 2 });
    const netAmount = (invoice.total_net || invoice.net_total || 0).toLocaleString("pl-PL", { minimumFractionDigits: 2 });
    const dueDate = invoice.due_date
      ? new Date(invoice.due_date).toLocaleDateString("pl-PL")
      : "brak";
    const issueDate = invoice.issue_date
      ? new Date(invoice.issue_date).toLocaleDateString("pl-PL")
      : new Date().toLocaleDateString("pl-PL");

    const { subject, html } = generateEmailTemplate(type, {
      companyName, companyNip, companyAddress, companyBankAccount, companyBankName,
      buyerName, invoiceNumber, grossAmount, netAmount, dueDate, issueDate, customMessage: custom_message,
    });

    // Use onboarding@resend.dev as the from address (works without domain verification)
    const fromAddress = `${companyName} via GetRido <onboarding@resend.dev>`;
    const replyTo = company?.email || undefined;

    console.log(`Sending email to ${toEmail}, from: ${fromAddress}, subject: ${subject}`);

    const emailResponse = await resend.emails.send({
      from: fromAddress,
      to: [toEmail],
      subject,
      html,
      reply_to: replyTo,
    });

    console.log("Resend API response:", JSON.stringify(emailResponse));

    // Check for actual errors in the response
    if (emailResponse.error) {
      throw new Error(`Resend error: ${emailResponse.error.message || JSON.stringify(emailResponse.error)}`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Email wysłany do ${toEmail}`,
        email_id: emailResponse.data?.id,
      }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    console.error("Error in send-invoice-email:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
});
