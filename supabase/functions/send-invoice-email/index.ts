import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "npm:resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface InvoiceEmailRequest {
  invoice_id: string;
  type: "new_invoice" | "payment_reminder" | "overdue_notice";
  custom_message?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { invoice_id, type, custom_message }: InvoiceEmailRequest = await req.json();

    if (!invoice_id || !type) {
      throw new Error("Missing required fields: invoice_id and type");
    }

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
        entity_id
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
    const senderEmail = entity?.email || "faktury@getrido.pl";
    const companyName = entity?.name || "GetRido";
    const buyerName = buyerSnapshot?.name || "Szanowny Kliencie";
    const invoiceNumber = invoice.invoice_number;
    const grossAmount = invoice.gross_amount?.toLocaleString("pl-PL") || "0";
    const dueDate = invoice.due_date 
      ? new Date(invoice.due_date).toLocaleDateString("pl-PL") 
      : "brak";

    let subject = "";
    let htmlContent = "";

    switch (type) {
      case "new_invoice":
        subject = `Nowa faktura ${invoiceNumber} od ${companyName}`;
        htmlContent = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #6C5CE7;">Nowa faktura</h2>
            <p>Szanowni Państwo,</p>
            <p>Wystawiliśmy nową fakturę dla Państwa firmy:</p>
            <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <p><strong>Numer faktury:</strong> ${invoiceNumber}</p>
              <p><strong>Kwota do zapłaty:</strong> ${grossAmount} PLN</p>
              <p><strong>Termin płatności:</strong> ${dueDate}</p>
            </div>
            ${entity?.bank_account ? `
            <div style="background: #e8f4f8; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <p><strong>Dane do przelewu:</strong></p>
              <p>Bank: ${entity.bank_name || '-'}</p>
              <p>Numer konta: ${entity.bank_account}</p>
              <p>Tytuł: ${invoiceNumber}</p>
            </div>
            ` : ""}
            <p>Faktura została załączona do tej wiadomości lub dostępna jest w Państwa panelu klienta.</p>
            <p>Z poważaniem,<br/>${companyName}</p>
          </div>
        `;
        break;

      case "payment_reminder":
        subject = `Przypomnienie o płatności - faktura ${invoiceNumber}`;
        htmlContent = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #F39C12;">Przypomnienie o płatności</h2>
            <p>Szanowni Państwo,</p>
            <p>Uprzejmie przypominamy o zbliżającym się terminie płatności:</p>
            <div style="background: #fef9e7; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #F39C12;">
              <p><strong>Numer faktury:</strong> ${invoiceNumber}</p>
              <p><strong>Kwota:</strong> ${grossAmount} PLN</p>
              <p><strong>Termin płatności:</strong> ${dueDate}</p>
            </div>
            ${custom_message ? `<p>${custom_message}</p>` : ""}
            ${entity?.bank_account ? `
            <div style="background: #e8f4f8; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <p><strong>Dane do przelewu:</strong></p>
              <p>Bank: ${entity.bank_name || '-'}</p>
              <p>Numer konta: ${entity.bank_account}</p>
              <p>Tytuł: ${invoiceNumber}</p>
            </div>
            ` : ""}
            <p>Jeżeli płatność została już dokonana, prosimy o zignorowanie tej wiadomości.</p>
            <p>Z poważaniem,<br/>${companyName}</p>
          </div>
        `;
        break;

      case "overdue_notice":
        subject = `⚠️ Faktura przeterminowana - ${invoiceNumber}`;
        htmlContent = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #E74C3C;">Faktura przeterminowana</h2>
            <p>Szanowni Państwo,</p>
            <p>Informujemy, że termin płatności poniższej faktury już minął:</p>
            <div style="background: #fdedec; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #E74C3C;">
              <p><strong>Numer faktury:</strong> ${invoiceNumber}</p>
              <p><strong>Kwota zaległa:</strong> ${grossAmount} PLN</p>
              <p><strong>Termin płatności:</strong> ${dueDate}</p>
            </div>
            ${entity?.bank_account ? `
            <div style="background: #e8f4f8; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <p><strong>Dane do przelewu:</strong></p>
              <p>Bank: ${entity.bank_name || '-'}</p>
              <p>Numer konta: ${entity.bank_account}</p>
              <p>Tytuł: ${invoiceNumber}</p>
            </div>
            ` : ""}
            <p>Prosimy o pilne uregulowanie należności. W przypadku pytań prosimy o kontakt.</p>
            <p>Z poważaniem,<br/>${companyName}</p>
          </div>
        `;
        break;
    }

    console.log(`Sending ${type} email for invoice ${invoiceNumber} to ${recipientEmail}`);

    const emailResponse = await resend.emails.send({
      from: `${companyName} <noreply@getrido.pl>`,
      to: [recipientEmail],
      subject,
      html: htmlContent,
    });

    console.log("Email sent successfully:", emailResponse);

    // Log the communication
    const { error: logError } = await supabase
      .from("invoice_email_log")
      .insert({
        invoice_id,
        email_type: type,
        recipient_email: recipientEmail,
        status: "sent",
        sent_at: new Date().toISOString()
      });

    if (logError) {
      console.log("Could not log email (table may not exist):", logError.message);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Email wysłany do ${recipientEmail}`,
        email_id: emailResponse.id
      }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );

  } catch (error: any) {
    console.error("Error in send-invoice-email:", error);
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error.message 
      }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
});
