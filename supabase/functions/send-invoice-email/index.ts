import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { encode as base64Encode } from "https://deno.land/std@0.190.0/encoding/base64.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface InvoiceEmailRequest {
  invoice_id: string;
  type: "new_invoice" | "payment_reminder" | "overdue_notice";
  custom_message?: string;
  include_pdf?: boolean;
  cc_emails?: string[];
}

interface Attachment {
  filename: string;
  content: string; // base64 encoded
}

async function fetchPdfAttachment(
  supabase: ReturnType<typeof createClient>,
  invoiceId: string,
  invoiceNumber: string
): Promise<Attachment | null> {
  try {
    // Check for PDF in invoices table (pdf_url field)
    const { data: invoice } = await supabase
      .from("invoices")
      .select("pdf_url")
      .eq("id", invoiceId)
      .single();

    let pdfUrl = invoice?.pdf_url;

    // If no direct URL, check documents table
    if (!pdfUrl) {
      const { data: document } = await supabase
        .from("documents")
        .select("file_url, file_name")
        .eq("type", "invoice")
        .ilike("file_name", `%${invoiceNumber}%`)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (document?.file_url) {
        pdfUrl = document.file_url;
      }
    }

    if (!pdfUrl) {
      console.log("No PDF found for invoice:", invoiceId);
      return null;
    }

    // If it's a storage path, download from Supabase Storage
    if (pdfUrl.includes("supabase") || pdfUrl.startsWith("/")) {
      // Extract bucket and path from URL
      const urlParts = pdfUrl.split("/storage/v1/object/public/");
      if (urlParts.length === 2) {
        const [bucket, ...pathParts] = urlParts[1].split("/");
        const filePath = pathParts.join("/");
        
        const { data: fileData, error } = await supabase.storage
          .from(bucket)
          .download(filePath);

        if (error || !fileData) {
          console.error("Error downloading PDF from storage:", error);
          return null;
        }

        const arrayBuffer = await fileData.arrayBuffer();
        const base64Content = base64Encode(new Uint8Array(arrayBuffer));

        return {
          filename: `Faktura_${invoiceNumber.replace(/\//g, "-")}.pdf`,
          content: base64Content,
        };
      }
    }

    // If it's an external URL, fetch it
    if (pdfUrl.startsWith("http")) {
      const response = await fetch(pdfUrl);
      if (!response.ok) {
        console.error("Error fetching external PDF:", response.status);
        return null;
      }

      const arrayBuffer = await response.arrayBuffer();
      const base64Content = base64Encode(new Uint8Array(arrayBuffer));

      return {
        filename: `Faktura_${invoiceNumber.replace(/\//g, "-")}.pdf`,
        content: base64Content,
      };
    }

    return null;
  } catch (error) {
    console.error("Error in fetchPdfAttachment:", error);
    return null;
  }
}

function generateEmailTemplate(
  type: "new_invoice" | "payment_reminder" | "overdue_notice",
  data: {
    companyName: string;
    buyerName: string;
    invoiceNumber: string;
    grossAmount: string;
    netAmount: string;
    dueDate: string;
    issueDate: string;
    bankAccount?: string;
    bankName?: string;
    customMessage?: string;
    hasPdfAttachment: boolean;
  }
): { subject: string; html: string } {
  const {
    companyName,
    buyerName,
    invoiceNumber,
    grossAmount,
    netAmount,
    dueDate,
    issueDate,
    bankAccount,
    bankName,
    customMessage,
    hasPdfAttachment,
  } = data;

  const bankSection = bankAccount
    ? `
      <div style="background: #e8f4f8; padding: 15px; border-radius: 8px; margin: 20px 0;">
        <p style="margin: 0 0 10px 0; font-weight: bold; color: #2980b9;">💳 Dane do przelewu:</p>
        <table style="width: 100%; border-collapse: collapse;">
          <tr><td style="padding: 5px 0; color: #666;">Bank:</td><td style="padding: 5px 0; font-weight: 500;">${bankName || "-"}</td></tr>
          <tr><td style="padding: 5px 0; color: #666;">Numer konta:</td><td style="padding: 5px 0; font-weight: 500; font-family: monospace;">${bankAccount}</td></tr>
          <tr><td style="padding: 5px 0; color: #666;">Tytuł przelewu:</td><td style="padding: 5px 0; font-weight: 500;">${invoiceNumber}</td></tr>
        </table>
      </div>
    `
    : "";

  const footerHtml = `
    <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; color: #666; font-size: 12px;">
      <p>Z poważaniem,<br/><strong>${companyName}</strong></p>
      <p style="margin-top: 15px; color: #999;">
        Ta wiadomość została wygenerowana automatycznie. W przypadku pytań prosimy o kontakt.
      </p>
    </div>
  `;

  const pdfNote = hasPdfAttachment
    ? `<p style="background: #d4edda; padding: 10px; border-radius: 5px; color: #155724;">📎 Faktura PDF została załączona do tej wiadomości.</p>`
    : `<p style="background: #fff3cd; padding: 10px; border-radius: 5px; color: #856404;">ℹ️ Faktura dostępna jest w Państwa panelu klienta.</p>`;

  switch (type) {
    case "new_invoice":
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
                  <tr><td style="padding: 8px 0; color: #666;">Numer faktury:</td><td style="padding: 8px 0; font-weight: bold; color: #333;">${invoiceNumber}</td></tr>
                  <tr><td style="padding: 8px 0; color: #666;">Data wystawienia:</td><td style="padding: 8px 0; font-weight: 500;">${issueDate}</td></tr>
                  <tr><td style="padding: 8px 0; color: #666;">Kwota netto:</td><td style="padding: 8px 0; font-weight: 500;">${netAmount} PLN</td></tr>
                  <tr><td style="padding: 8px 0; color: #666;">Kwota brutto:</td><td style="padding: 8px 0; font-weight: bold; font-size: 18px; color: #6C5CE7;">${grossAmount} PLN</td></tr>
                  <tr><td style="padding: 8px 0; color: #666;">Termin płatności:</td><td style="padding: 8px 0; font-weight: 500; color: #e74c3c;">${dueDate}</td></tr>
                </table>
              </div>
              
              ${bankSection}
              ${pdfNote}
              ${footerHtml}
            </div>
          </div>
        `,
      };

    case "payment_reminder":
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
                  <tr><td style="padding: 8px 0; color: #666;">Numer faktury:</td><td style="padding: 8px 0; font-weight: bold; color: #333;">${invoiceNumber}</td></tr>
                  <tr><td style="padding: 8px 0; color: #666;">Kwota do zapłaty:</td><td style="padding: 8px 0; font-weight: bold; font-size: 18px; color: #F39C12;">${grossAmount} PLN</td></tr>
                  <tr><td style="padding: 8px 0; color: #666;">Termin płatności:</td><td style="padding: 8px 0; font-weight: bold; color: #e74c3c;">${dueDate}</td></tr>
                </table>
              </div>
              
              ${customMessage ? `<div style="background: #f0f0f0; padding: 15px; border-radius: 8px; margin: 20px 0; font-style: italic;">${customMessage}</div>` : ""}
              ${bankSection}
              
              <p style="background: #fef3e2; padding: 12px; border-radius: 5px; color: #8a6d3b;">
                💡 Jeżeli płatność została już dokonana, prosimy o zignorowanie tej wiadomości.
              </p>
              
              ${pdfNote}
              ${footerHtml}
            </div>
          </div>
        `,
      };

    case "overdue_notice":
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
                  <tr><td style="padding: 8px 0; color: #666;">Numer faktury:</td><td style="padding: 8px 0; font-weight: bold; color: #333;">${invoiceNumber}</td></tr>
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
              
              ${pdfNote}
              ${footerHtml}
            </div>
          </div>
        `,
      };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { invoice_id, type, custom_message, include_pdf = true, cc_emails }: InvoiceEmailRequest = await req.json();

    if (!invoice_id || !type) {
      throw new Error("Missing required fields: invoice_id and type");
    }

    console.log(`Processing ${type} email request for invoice: ${invoice_id}`);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch invoice details
    const { data: invoice, error: invoiceError } = await supabase
      .from("invoices")
      .select(`
        id,
        invoice_number,
        gross_amount,
        net_amount,
        issue_date,
        due_date,
        status,
        buyer_snapshot,
        entity_id,
        pdf_url
      `)
      .eq("id", invoice_id)
      .single();

    if (invoiceError || !invoice) {
      throw new Error(`Invoice not found: ${invoiceError?.message}`);
    }

    // Fetch entity (seller) details
    const { data: entity } = await supabase
      .from("entities")
      .select("name, email, phone, bank_account, bank_name")
      .eq("id", invoice.entity_id)
      .single();

    // Get recipient email from buyer_snapshot or invoice_recipients
    const buyerSnapshot = invoice.buyer_snapshot as any;
    let recipientEmail = buyerSnapshot?.email;

    if (!recipientEmail) {
      // Try to find email in invoice_recipients
      const { data: recipient } = await supabase
        .from("invoice_recipients")
        .select("email")
        .eq("nip", buyerSnapshot?.nip)
        .single();

      recipientEmail = recipient?.email;
    }

    if (!recipientEmail) {
      throw new Error("No recipient email found. Add email to contractor data.");
    }

    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!resendKey) {
      throw new Error("RESEND_API_KEY not configured");
    }

    const resend = new Resend(resendKey);
    
    // Prepare data for template
    const companyName = entity?.name || "GetRido";
    const buyerName = buyerSnapshot?.name || "Szanowny Kliencie";
    const invoiceNumber = invoice.invoice_number;
    const grossAmount = invoice.gross_amount?.toLocaleString("pl-PL", { minimumFractionDigits: 2 }) || "0,00";
    const netAmount = invoice.net_amount?.toLocaleString("pl-PL", { minimumFractionDigits: 2 }) || "0,00";
    const dueDate = invoice.due_date
      ? new Date(invoice.due_date).toLocaleDateString("pl-PL")
      : "brak";
    const issueDate = invoice.issue_date
      ? new Date(invoice.issue_date).toLocaleDateString("pl-PL")
      : new Date().toLocaleDateString("pl-PL");

    // Fetch PDF attachment if requested
    let pdfAttachment: Attachment | null = null;
    if (include_pdf) {
      console.log("Fetching PDF attachment...");
      pdfAttachment = await fetchPdfAttachment(supabase, invoice_id, invoiceNumber);
      if (pdfAttachment) {
        console.log(`PDF attachment found: ${pdfAttachment.filename}`);
      } else {
        console.log("No PDF attachment available");
      }
    }

    // Generate email content
    const { subject, html } = generateEmailTemplate(type, {
      companyName,
      buyerName,
      invoiceNumber,
      grossAmount,
      netAmount,
      dueDate,
      issueDate,
      bankAccount: entity?.bank_account,
      bankName: entity?.bank_name,
      customMessage: custom_message,
      hasPdfAttachment: !!pdfAttachment,
    });

    // Prepare recipients
    const toRecipients = [recipientEmail];
    const ccRecipients = cc_emails?.filter((email) => email && email !== recipientEmail) || [];

    console.log(`Sending ${type} email for invoice ${invoiceNumber} to ${recipientEmail}`);
    if (ccRecipients.length > 0) {
      console.log(`CC: ${ccRecipients.join(", ")}`);
    }

    // Build email payload
    const emailPayload: any = {
      from: `${companyName} <noreply@getrido.pl>`,
      to: toRecipients,
      subject,
      html,
    };

    if (ccRecipients.length > 0) {
      emailPayload.cc = ccRecipients;
    }

    if (pdfAttachment) {
      emailPayload.attachments = [
        {
          filename: pdfAttachment.filename,
          content: pdfAttachment.content,
        },
      ];
    }

    const emailResponse = await resend.emails.send(emailPayload);

    console.log("Email sent successfully:", emailResponse);

    // Log the communication
    await supabase.from("invoice_email_log").insert({
      invoice_id,
      email_type: type,
      recipient_email: recipientEmail,
      cc_emails: ccRecipients.length > 0 ? ccRecipients : null,
      has_attachment: !!pdfAttachment,
      status: "sent",
      sent_at: new Date().toISOString(),
      resend_id: emailResponse.id,
    });

    return new Response(
      JSON.stringify({
        success: true,
        message: `Email wysłany do ${recipientEmail}${ccRecipients.length > 0 ? ` (CC: ${ccRecipients.join(", ")})` : ""}`,
        email_id: emailResponse.id,
        has_attachment: !!pdfAttachment,
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
