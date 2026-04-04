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
    companyEmail: string;
    companyPhone: string;
    buyerName: string;
    invoiceNumber: string;
    grossAmount: string;
    netAmount: string;
    dueDate: string;
    issueDate: string;
    currency: string;
    customMessage?: string;
  }
): { subject: string; html: string } {
  const {
    companyName, companyNip, companyAddress, companyBankAccount, companyBankName,
    companyEmail, companyPhone,
    buyerName, invoiceNumber, grossAmount, netAmount, dueDate, issueDate, currency,
    customMessage,
  } = data;

  const cur = currency || 'PLN';

  const bankSection = companyBankAccount
    ? `
      <div style="background: #f3f0ff; padding: 18px; border-radius: 8px; margin: 20px 0;">
        <p style="margin: 0 0 10px 0; font-weight: 600; color: #6C5CE7; font-size: 14px;">💳 Dane do przelewu</p>
        <table style="width: 100%; border-collapse: collapse;">
          <tr><td style="padding: 4px 0; color: #666; font-size: 13px; width: 140px;">Bank:</td><td style="padding: 4px 0; font-weight: 500; font-size: 13px;">${companyBankName || "-"}</td></tr>
          <tr><td style="padding: 4px 0; color: #666; font-size: 13px;">Numer konta:</td><td style="padding: 4px 0; font-weight: 500; font-size: 13px; font-family: 'Courier New', monospace; letter-spacing: 0.5px;">${companyBankAccount}</td></tr>
          <tr><td style="padding: 4px 0; color: #666; font-size: 13px;">Tytuł przelewu:</td><td style="padding: 4px 0; font-weight: 500; font-size: 13px;">${invoiceNumber}</td></tr>
          <tr><td style="padding: 4px 0; color: #666; font-size: 13px;">Kwota:</td><td style="padding: 4px 0; font-weight: 700; font-size: 14px; color: #6C5CE7;">${grossAmount} ${cur}</td></tr>
        </table>
      </div>
    `
    : "";

  // Company signature block - always shown
  const companySignature = `
    <div style="margin-top: 30px; padding-top: 20px; border-top: 2px solid #f0f0f0;">
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="vertical-align: top; padding-right: 20px;">
            <p style="margin: 0 0 2px 0; font-size: 11px; color: #999; text-transform: uppercase; letter-spacing: 0.5px;">Wystawca</p>
            <p style="margin: 0 0 4px 0; font-weight: 700; font-size: 14px; color: #333;">${companyName}</p>
            ${companyNip ? `<p style="margin: 0 0 2px 0; font-size: 12px; color: #666;">NIP: ${companyNip}</p>` : ''}
            ${companyAddress ? `<p style="margin: 0 0 2px 0; font-size: 12px; color: #666;">${companyAddress}</p>` : ''}
            ${companyEmail ? `<p style="margin: 0 0 2px 0; font-size: 12px; color: #666;">✉ ${companyEmail}</p>` : ''}
            ${companyPhone ? `<p style="margin: 0; font-size: 12px; color: #666;">📞 ${companyPhone}</p>` : ''}
          </td>
          <td style="vertical-align: top; text-align: right;">
            ${companyBankAccount ? `
              <p style="margin: 0 0 2px 0; font-size: 11px; color: #999;">Nr konta:</p>
              <p style="margin: 0; font-size: 11px; color: #666; font-family: 'Courier New', monospace;">${companyBankAccount}</p>
            ` : ''}
          </td>
        </tr>
      </table>
    </div>
    <div style="margin-top: 15px; padding-top: 12px; border-top: 1px solid #f0f0f0; text-align: center;">
      <p style="margin: 0; font-size: 10px; color: #bbb;">
        Wiadomość wygenerowana automatycznie przez system <a href="https://getrido.pl" style="color: #6C5CE7; text-decoration: none;">GetRido.pl</a>
      </p>
    </div>
  `;

  if (type === "payment_reminder") {
    return {
      subject: `Przypomnienie o płatności – ${invoiceNumber} od ${companyName}`,
      html: `
        <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #fff; border: 1px solid #e0e0e0; border-radius: 10px; overflow: hidden;">
          <div style="background: linear-gradient(135deg, #F39C12 0%, #f1c40f 100%); padding: 28px; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 22px; font-weight: 600;">⏰ Przypomnienie o płatności</h1>
          </div>
          <div style="padding: 28px;">
            <p style="font-size: 15px; color: #333; margin: 0 0 8px 0;">Dzień dobry,</p>
            <p style="color: #555; font-size: 14px; line-height: 1.5;">
              przesyłam przypomnienie o zbliżającym się terminie płatności faktury <strong>${invoiceNumber}</strong> na kwotę <strong>${grossAmount} ${cur}</strong>.
            </p>
            <div style="background: #fef9e7; padding: 18px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #F39C12;">
              <table style="width: 100%; border-collapse: collapse;">
                <tr><td style="padding: 6px 0; color: #666; font-size: 13px;">Numer faktury:</td><td style="padding: 6px 0; font-weight: bold; font-size: 13px;">${invoiceNumber}</td></tr>
                <tr><td style="padding: 6px 0; color: #666; font-size: 13px;">Kwota do zapłaty:</td><td style="padding: 6px 0; font-weight: bold; font-size: 16px; color: #F39C12;">${grossAmount} ${cur}</td></tr>
                <tr><td style="padding: 6px 0; color: #666; font-size: 13px;">Termin płatności:</td><td style="padding: 6px 0; font-weight: bold; color: #e74c3c; font-size: 13px;">${dueDate}</td></tr>
              </table>
            </div>
            ${customMessage ? `<div style="background: #f8f8f8; padding: 14px; border-radius: 8px; margin: 20px 0; font-style: italic; font-size: 13px; color: #555;">${customMessage}</div>` : ""}
            ${bankSection}
            <p style="background: #fef3e2; padding: 12px; border-radius: 6px; color: #8a6d3b; font-size: 12px; margin: 15px 0;">
              💡 Jeżeli płatność została już dokonana, prosimy o zignorowanie tej wiadomości.
            </p>
            ${companySignature}
          </div>
        </div>
      `,
    };
  }

  if (type === "overdue_notice") {
    return {
      subject: `⚠️ Faktura przeterminowana – ${invoiceNumber} od ${companyName}`,
      html: `
        <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #fff; border: 1px solid #e0e0e0; border-radius: 10px; overflow: hidden;">
          <div style="background: linear-gradient(135deg, #E74C3C 0%, #c0392b 100%); padding: 28px; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 22px; font-weight: 600;">⚠️ Faktura przeterminowana</h1>
          </div>
          <div style="padding: 28px;">
            <p style="font-size: 15px; color: #333; margin: 0 0 8px 0;">Dzień dobry,</p>
            <p style="color: #555; font-size: 14px; line-height: 1.5;">
              informujemy, że termin płatności faktury <strong>${invoiceNumber}</strong> już minął. Prosimy o pilne uregulowanie należności.
            </p>
            <div style="background: #fdedec; padding: 18px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #E74C3C;">
              <table style="width: 100%; border-collapse: collapse;">
                <tr><td style="padding: 6px 0; color: #666; font-size: 13px;">Numer faktury:</td><td style="padding: 6px 0; font-weight: bold; font-size: 13px;">${invoiceNumber}</td></tr>
                <tr><td style="padding: 6px 0; color: #666; font-size: 13px;">Kwota zaległa:</td><td style="padding: 6px 0; font-weight: bold; font-size: 18px; color: #E74C3C;">${grossAmount} ${cur}</td></tr>
                <tr><td style="padding: 6px 0; color: #666; font-size: 13px;">Termin płatności:</td><td style="padding: 6px 0; font-weight: bold; color: #c0392b; text-decoration: line-through; font-size: 13px;">${dueDate}</td></tr>
              </table>
            </div>
            ${bankSection}
            <div style="background: #f8d7da; padding: 14px; border-radius: 8px; margin: 20px 0; border: 1px solid #f5c6cb;">
              <p style="margin: 0; color: #721c24; font-weight: 500; font-size: 13px;">
                🔴 Prosimy o pilne uregulowanie należności w celu uniknięcia dodatkowych konsekwencji.
              </p>
            </div>
            ${companySignature}
          </div>
        </div>
      `,
    };
  }

  // Default: new_invoice — styled like inFakt but in GetRido purple
  return {
    subject: `Faktura ${invoiceNumber} od ${companyName}`,
    html: `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #fff; border: 1px solid #e0e0e0; border-radius: 10px; overflow: hidden;">
        <div style="background: linear-gradient(135deg, #6C5CE7 0%, #a29bfe 100%); padding: 28px; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 22px; font-weight: 600;">📄 Nowa faktura</h1>
        </div>
        <div style="padding: 28px;">
          <p style="font-size: 15px; color: #333; margin: 0 0 8px 0;">Dzień dobry,</p>
          <p style="color: #555; font-size: 14px; line-height: 1.5;">
            przesyłam fakturę o numerze <strong>${invoiceNumber}</strong> na kwotę <strong>${grossAmount} ${cur}</strong>.
          </p>
          <p style="color: #555; font-size: 14px; line-height: 1.5; margin: 0 0 5px 0;">
            Z góry dziękuję za terminowy przelew.
          </p>
          
          <div style="background: #f8f9fa; padding: 18px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #6C5CE7;">
            <table style="width: 100%; border-collapse: collapse;">
              <tr><td style="padding: 6px 0; color: #666; font-size: 13px; width: 140px;">Numer faktury:</td><td style="padding: 6px 0; font-weight: bold; font-size: 13px;">${invoiceNumber}</td></tr>
              <tr><td style="padding: 6px 0; color: #666; font-size: 13px;">Data wystawienia:</td><td style="padding: 6px 0; font-weight: 500; font-size: 13px;">${issueDate}</td></tr>
              <tr><td style="padding: 6px 0; color: #666; font-size: 13px;">Kwota netto:</td><td style="padding: 6px 0; font-weight: 500; font-size: 13px;">${netAmount} ${cur}</td></tr>
              <tr><td style="padding: 6px 0; color: #666; font-size: 13px;">Kwota brutto:</td><td style="padding: 6px 0; font-weight: bold; font-size: 16px; color: #6C5CE7;">${grossAmount} ${cur}</td></tr>
              <tr><td style="padding: 6px 0; color: #666; font-size: 13px;">Termin płatności:</td><td style="padding: 6px 0; font-weight: 600; color: #e74c3c; font-size: 13px;">${dueDate}</td></tr>
            </table>
          </div>
          ${bankSection}
          
          <p style="color: #555; font-size: 13px; margin: 15px 0 0 0;">
            Faktura w formacie PDF jest w załączniku tej wiadomości.
          </p>
          
          ${companySignature}
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
    const { invoice_id, type = "new_invoice", custom_message, recipient_email, pdf_base64 } = body;

    if (!invoice_id) {
      throw new Error("Missing required field: invoice_id");
    }

    console.log(`Processing ${type} email for invoice: ${invoice_id}`);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch invoice
    const { data: invoice, error: invoiceError } = await supabase
      .from("user_invoices")
      .select("*")
      .eq("id", invoice_id)
      .single();

    if (invoiceError || !invoice) {
      console.error("Invoice not found:", invoiceError);
      throw new Error(`Faktura nie znaleziona: ${invoiceError?.message || 'brak danych'}`);
    }

    // Try to get company from user_invoice_companies first (what the app actually uses)
    let company: any = null;
    if (invoice.company_id) {
      const { data: companyData } = await supabase
        .from("user_invoice_companies")
        .select("*")
        .eq("id", invoice.company_id)
        .maybeSingle();
      company = companyData;
    }
    // Fallback to company_settings
    if (!company) {
      const { data: companyData } = await supabase
        .from("company_settings")
        .select("*")
        .eq("user_id", invoice.user_id)
        .maybeSingle();
      company = companyData;
    }

    // Determine recipient email
    let toEmail = recipient_email;
    if (!toEmail) {
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

    // Build company info - handle both table schemas
    const companyName = company?.company_name || company?.name || "GetRido";
    const companyNip = company?.nip || "";
    const companyAddress = company?.address_street 
      ? [
          company.address_street + (company.address_building_number ? ' ' + company.address_building_number : '') + (company.address_apartment_number ? '/' + company.address_apartment_number : ''),
          (company.address_postal_code || company.address_zip || '') + ' ' + (company.address_city || '')
        ].filter(s => s.trim()).join(', ')
      : [company?.address_street, company?.address_zip, company?.address_city].filter(Boolean).join(", ");
    const companyBankAccount = company?.bank_account || "";
    const companyBankName = company?.bank_name || "";
    const companyEmail = company?.email || company?.contact_email || "";
    const companyPhone = company?.phone || "";

    const buyerName = invoice.buyer_name || "Szanowny Kliencie";
    const invoiceNumber = invoice.invoice_number || "";
    const currency = invoice.currency || "PLN";
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
      companyEmail, companyPhone,
      buyerName, invoiceNumber, grossAmount, netAmount, dueDate, issueDate, currency,
      customMessage: custom_message,
    });

    const fromAddress = `${companyName} via GetRido <noreply@getrido.pl>`;
    const replyTo = companyEmail || undefined;

    console.log(`Sending email to ${toEmail}, from: ${fromAddress}, subject: ${subject}`);

    // Build email options
    const emailOptions: any = {
      from: fromAddress,
      to: [toEmail],
      subject,
      html,
      reply_to: replyTo,
    };

    // Add PDF attachment if provided
    if (pdf_base64 && pdf_base64.length > 100) {
      const pdfFilename = `${invoiceNumber || 'Faktura'}.pdf`.replace(/\//g, '-');
      // Resend expects content as a base64 string for attachments
      emailOptions.attachments = [
        {
          filename: pdfFilename,
          content: pdf_base64,
          type: 'application/pdf',
        }
      ];
      console.log(`Attaching PDF: ${pdfFilename} (${Math.round(pdf_base64.length / 1024)}KB base64)`);
    } else {
      console.log('No PDF attachment - pdf_base64 is', pdf_base64 ? `too short (${pdf_base64.length})` : 'null/undefined');
    }

    const emailResponse = await resend.emails.send(emailOptions);

    console.log("Resend API response:", JSON.stringify(emailResponse));

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
