import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6.9.14";

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
    /**
     * Link do panelu, w którym odbiorca zarządza swoją subskrypcją (4.8).
     *
     * PARAMETR OPCJONALNY I CELOWO PUSTY DOMYŚLNIE. Ta funkcja wysyła KAŻDĄ
     * fakturę w portalu — także tę, którą warsztat wystawia swojemu klientowi
     * za wymianę klocków. Doklejenie tam linku do płatności abonamentowych
     * GetRido byłoby wysłaniem cudzego klienta w zupełnie nieswoje miejsce.
     * Podaje go wyłącznie fakturowanie abonamentowe.
     *
     * Świadomie NIE linkujemy do samej faktury: wszystkie widoki faktur
     * w portalu są po stronie WYSTAWCY, więc odbiorca trafiłby na odmowę.
     */
    panelPlatnosciUrl?: string;
  }
): { subject: string; html: string } {
  const {
    companyName, companyNip, companyAddress, companyBankAccount, companyBankName,
    companyEmail, companyPhone,
    buyerName, invoiceNumber, grossAmount, netAmount, dueDate, issueDate, currency,
    customMessage, panelPlatnosciUrl,
  } = data;

  const cur = currency || 'PLN';

  const bankSection = companyBankAccount
    ? `
      <div style="background: #f3f0ff; padding: 18px; border-radius: 8px; margin: 20px 0;">
        <p style="margin: 0 0 10px 0; font-weight: 600; color: #6C5CE7; font-size: 14px;">💳 Dane do przelewu</p>
        <table style="width: 100%; border-collapse: collapse;">
          <tr><td style="padding: 4px 0; color: #666; font-size: 13px; width: 140px;">Bank:</td><td style="padding: 4px 0; font-weight: 500; font-size: 13px;">${companyBankName || "-"}</td></tr>
          <tr><td style="padding: 4px 0; color: #666; font-size: 13px;">Numer konta:</td><td style="padding: 4px 0; font-weight: 500; font-size: 13px;  letter-spacing: 0.5px;">${companyBankAccount}</td></tr>
          <tr><td style="padding: 4px 0; color: #666; font-size: 13px;">Tytuł przelewu:</td><td style="padding: 4px 0; font-weight: 500; font-size: 13px;">${invoiceNumber}</td></tr>
          <tr><td style="padding: 4px 0; color: #666; font-size: 13px;">Kwota:</td><td style="padding: 4px 0; font-weight: 700; font-size: 14px; color: #6C5CE7;">${grossAmount} ${cur}</td></tr>
        </table>
      </div>
    `
    : "";

  const panelSection = panelPlatnosciUrl
    ? `
      <div style="text-align: center; margin: 24px 0;">
        <a href="${panelPlatnosciUrl}" style="display: inline-block; background: #6C5CE7; color: #fff; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 600; font-size: 14px;">Zarządzaj subskrypcją</a>
        <p style="margin: 10px 0 0 0; font-size: 12px; color: #999;">Zmiana karty, historia płatności i rezygnacja</p>
      </div>
    `
    : "";

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
              <p style="margin: 0; font-size: 11px; color: #666; ">${companyBankAccount}</p>
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
            <p style="color: #555; font-size: 14px; line-height: 1.5;">przesyłam przypomnienie o zbliżającym się terminie płatności faktury <strong>${invoiceNumber}</strong> na kwotę <strong>${grossAmount} ${cur}</strong>.</p>
            <div style="background: #fef9e7; padding: 18px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #F39C12;">
              <table style="width: 100%; border-collapse: collapse;">
                <tr><td style="padding: 6px 0; color: #666; font-size: 13px;">Numer faktury:</td><td style="padding: 6px 0; font-weight: bold; font-size: 13px;">${invoiceNumber}</td></tr>
                <tr><td style="padding: 6px 0; color: #666; font-size: 13px;">Kwota do zapłaty:</td><td style="padding: 6px 0; font-weight: bold; font-size: 16px; color: #F39C12;">${grossAmount} ${cur}</td></tr>
                <tr><td style="padding: 6px 0; color: #666; font-size: 13px;">Termin płatności:</td><td style="padding: 6px 0; font-weight: bold; color: #e74c3c; font-size: 13px;">${dueDate}</td></tr>
              </table>
            </div>
            ${customMessage ? `<div style="background: #f8f8f8; padding: 14px; border-radius: 8px; margin: 20px 0; font-style: italic; font-size: 13px; color: #555;">${customMessage}</div>` : ""}
            ${bankSection}
            <p style="background: #fef3e2; padding: 12px; border-radius: 6px; color: #8a6d3b; font-size: 12px; margin: 15px 0;">💡 Jeżeli płatność została już dokonana, prosimy o zignorowanie tej wiadomości.</p>
            ${panelSection}
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
            <p style="color: #555; font-size: 14px; line-height: 1.5;">informujemy, że termin płatności faktury <strong>${invoiceNumber}</strong> już minął. Prosimy o pilne uregulowanie należności.</p>
            <div style="background: #fdedec; padding: 18px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #E74C3C;">
              <table style="width: 100%; border-collapse: collapse;">
                <tr><td style="padding: 6px 0; color: #666; font-size: 13px;">Numer faktury:</td><td style="padding: 6px 0; font-weight: bold; font-size: 13px;">${invoiceNumber}</td></tr>
                <tr><td style="padding: 6px 0; color: #666; font-size: 13px;">Kwota zaległa:</td><td style="padding: 6px 0; font-weight: bold; font-size: 18px; color: #E74C3C;">${grossAmount} ${cur}</td></tr>
                <tr><td style="padding: 6px 0; color: #666; font-size: 13px;">Termin płatności:</td><td style="padding: 6px 0; font-weight: bold; color: #c0392b; text-decoration: line-through; font-size: 13px;">${dueDate}</td></tr>
              </table>
            </div>
            ${bankSection}
            <div style="background: #f8d7da; padding: 14px; border-radius: 8px; margin: 20px 0; border: 1px solid #f5c6cb;">
              <p style="margin: 0; color: #721c24; font-weight: 500; font-size: 13px;">🔴 Prosimy o pilne uregulowanie należności w celu uniknięcia dodatkowych konsekwencji.</p>
            </div>
            ${panelSection}
          ${companySignature}
          </div>
        </div>
      `,
    };
  }

  /**
   * FAKTURA ZA ZAKUP JUŻ OPŁACONY — krótka wiadomość, bez wezwania do zapłaty.
   *
   * Osobny szablon, a nie zmiana `new_invoice`: tamten wysyłają warsztaty swoim
   * klientom za usługi jeszcze NIEZAPŁACONE i dane do przelewu są tam potrzebne.
   *
   * Tutaj klient zapłacił minutę wcześniej kartą albo BLIK-iem. Wysyłanie mu
   * numeru konta, terminu płatności i „z góry dziękuję za terminowy przelew"
   * jest pytaniem o pieniądze, które już wpłynęły — i wygląda albo na pomyłkę,
   * albo na próbę pobrania drugi raz.
   *
   * Nie ma tu też zdania o załączniku. Wiadomość z webhooka idzie BEZ PDF-u,
   * bo składa się go w przeglądarce; obiecywanie załącznika, którego nie ma,
   * jest gorsze od jego braku.
   */
  if (type === "faktura_oplacona") {
    return {
      subject: `Faktura ${invoiceNumber} — dziękujemy za zakup`,
      html: `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #fff; border: 1px solid #e0e0e0; border-radius: 10px; overflow: hidden;">
        <div style="background: linear-gradient(135deg, #6C5CE7 0%, #a29bfe 100%); padding: 28px; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 22px; font-weight: 600;">Faktura ${invoiceNumber}</h1>
        </div>
        <div style="padding: 28px;">
          <p style="font-size: 15px; color: #333; margin: 0 0 8px 0;">Dzień dobry,</p>
          <p style="color: #555; font-size: 14px; line-height: 1.6; margin: 0 0 8px 0;">przesyłam fakturę o numerze <strong>${invoiceNumber}</strong> na kwotę <strong>${grossAmount} ${cur}</strong>.</p>
          <p style="color: #555; font-size: 14px; line-height: 1.6; margin: 0;">Dziękujemy za zakup.</p>
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
        <div style="background: linear-gradient(135deg, #6C5CE7 0%, #a29bfe 100%); padding: 28px; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 22px; font-weight: 600;">📄 Nowa faktura</h1>
        </div>
        <div style="padding: 28px;">
          <p style="font-size: 15px; color: #333; margin: 0 0 8px 0;">Dzień dobry,</p>
          <p style="color: #555; font-size: 14px; line-height: 1.5;">przesyłam fakturę o numerze <strong>${invoiceNumber}</strong> na kwotę <strong>${grossAmount} ${cur}</strong>.</p>
          <p style="color: #555; font-size: 14px; line-height: 1.5; margin: 0 0 5px 0;">Z góry dziękuję za terminowy przelew.</p>
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
          <p style="color: #555; font-size: 13px; margin: 15px 0 0 0;">Faktura w formacie PDF jest w załączniku tej wiadomości.</p>
          ${panelSection}
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
    const { invoice_id, type = "new_invoice", custom_message, recipient_email, pdf_base64,
            panel_platnosci_url } = body;

    if (!invoice_id) {
      throw new Error("Missing required field: invoice_id");
    }

    console.log(`Processing ${type} email for invoice: ${invoice_id}`);

    const smtpPassword = Deno.env.get("SMTP_PASSWORD");
    if (!smtpPassword) {
      throw new Error("SMTP_PASSWORD nie jest skonfigurowany. Dodaj hasło do Supabase secrets.");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch email settings (SMTP config)
    const { data: emailSettings, error: settingsError } = await supabase
      .from("email_settings")
      .select("*")
      .eq("id", "00000000-0000-0000-0000-000000000001")
      .single();

    if (settingsError || !emailSettings) {
      throw new Error("Nie udało się pobrać ustawień email");
    }

    // Fetch invoice
    const { data: invoice, error: invoiceError } = await supabase
      .from("user_invoices")
      .select("*")
      .eq("id", invoice_id)
      .single();

    if (invoiceError || !invoice) {
      throw new Error(`Faktura nie znaleziona: ${invoiceError?.message || 'brak danych'}`);
    }

    // Get company info
    let company: any = null;
    if (invoice.company_id) {
      const { data: companyData } = await supabase
        .from("user_invoice_companies")
        .select("*")
        .eq("id", invoice.company_id)
        .maybeSingle();
      company = companyData;
    }
    if (!company) {
      const { data: companyData } = await supabase
        .from("company_settings")
        .select("*")
        .eq("user_id", invoice.user_id)
        .maybeSingle();
      company = companyData;
    }
    // Fallback bank/logo z entities
    {
      const { data: ent } = await supabase
        .from('entities')
        .select('bank_name, bank_account, logo_url, email, phone')
        .eq('owner_user_id', invoice.user_id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (ent) {
        company = company || {};
        if (!company.bank_name) company.bank_name = ent.bank_name;
        if (!company.bank_account) company.bank_account = ent.bank_account;
        if (!company.logo_url) company.logo_url = ent.logo_url;
        if (!company.email) company.email = ent.email;
        if (!company.phone) company.phone = ent.phone;
      }
    }

    // Determine recipient
    let toEmail = recipient_email;
    if (!toEmail) toEmail = invoice.buyer_email;
    if (!toEmail && invoice.buyer_nip) {
      // Try to find email from customers table by NIP
      const { data: customer } = await supabase
        .from('customers')
        .select('email')
        .eq('nip', invoice.buyer_nip)
        .maybeSingle();
      if (customer?.email) toEmail = customer.email;
    }
    if (!toEmail) throw new Error(`Brak adresu email odbiorcy dla faktury ${invoice.invoice_number}. Dodaj email nabywcy.`);

    // Build template data
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
    const dueDate = invoice.due_date ? new Date(invoice.due_date).toLocaleDateString("pl-PL") : "brak";
    const issueDate = invoice.issue_date ? new Date(invoice.issue_date).toLocaleDateString("pl-PL") : new Date().toLocaleDateString("pl-PL");

    const { subject, html } = generateEmailTemplate(type, {
      companyName, companyNip, companyAddress, companyBankAccount, companyBankName,
      companyEmail, companyPhone,
      buyerName, invoiceNumber, grossAmount, netAmount, dueDate, issueDate, currency,
      customMessage: custom_message,
      panelPlatnosciUrl: panel_platnosci_url,
    });

    const senderName = emailSettings.sender_name || "RIDO";
    const senderEmail = emailSettings.sender_email || emailSettings.smtp_user || "noreply@getrido.pl";
    const fromAddress = `${senderName} <${senderEmail}>`;

    console.log(`Sending email to ${toEmail}, from: ${fromAddress}, subject: ${subject}`);

    // Configure SMTP via nodemailer (denomailer ma bug z ConnectionReset po wysłaniu PDF)
    const smtpHost = emailSettings.smtp_host || "mail-serwer408603.lh.pl";
    const port = emailSettings.smtp_port || 465;
    const smtpUser = emailSettings.smtp_user || "noreply@getrido.pl";

    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port,
      secure: port === 465,
      auth: { user: smtpUser, pass: smtpPassword },
      connectionTimeout: 20000,
      greetingTimeout: 15000,
      socketTimeout: 30000,
    } as any);

    // Minify HTML
    const minifiedHtml = html
      .replace(/\r\n/g, '\n')
      .replace(/\n\s+/g, ' ')
      .replace(/>\s+</g, '><')
      .replace(/\s{2,}/g, ' ')
      .trim();

    const plainText = [
      `Dzień dobry,`, ``,
      `przesyłamy fakturę ${invoiceNumber} na kwotę ${grossAmount} ${currency}.`,
      `Data wystawienia: ${issueDate}`,
      `Termin płatności: ${dueDate}`,
      companyBankAccount ? `\nDane do przelewu:\nBank: ${companyBankName}\nNr konta: ${companyBankAccount}\nTytuł: ${invoiceNumber}\nKwota: ${grossAmount} ${currency}` : '',
      ``, `Faktura w załączniku PDF.`, ``, `--`,
      `${companyName}`,
      companyNip ? `NIP: ${companyNip}` : '',
      companyAddress,
      companyEmail ? `E-mail: ${companyEmail}` : '',
      companyPhone ? `Tel: ${companyPhone}` : '',
    ].filter(Boolean).join('\n');

    const replyTo = companyEmail || senderEmail;

    const mailOpts: any = {
      from: fromAddress,
      to: toEmail,
      replyTo,
      subject,
      text: plainText,
      html: minifiedHtml,
      headers: {
        'List-Unsubscribe': `<mailto:${replyTo}?subject=Unsubscribe>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        'X-Entity-Ref-ID': `${invoice_id}`,
        'X-Mailer': 'GetRido Invoicing',
        'Auto-Submitted': 'auto-generated',
      },
    };

    if (pdf_base64 && pdf_base64.length > 100) {
      const pdfFilename = `${invoiceNumber || 'Faktura'}.pdf`.replace(/\//g, '-');
      mailOpts.attachments = [{
        filename: pdfFilename,
        content: pdf_base64,
        encoding: 'base64',
        contentType: 'application/pdf',
      }];
      console.log(`Attaching PDF: ${pdfFilename} (${Math.round(pdf_base64.length / 1024)}KB base64)`);
    }

    try {
      const info = await transporter.sendMail(mailOpts);
      console.log("Email sent OK:", info.messageId, "response:", info.response, "accepted:", info.accepted);
      try { transporter.close(); } catch (_) {}
      return new Response(
        JSON.stringify({ success: true, message: `Email wysłany do ${toEmail}`, messageId: info.messageId, response: info.response }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    } catch (sendErr: any) {
      console.error("Nodemailer send error:", sendErr?.message, "code:", sendErr?.code, "response:", sendErr?.response);
      try { transporter.close(); } catch (_) {}
      return new Response(
        JSON.stringify({ success: false, error: `SMTP: ${sendErr?.message || sendErr}`, code: sendErr?.code, response: sendErr?.response }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }
  } catch (error: any) {
    console.error("Error in send-invoice-email:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
});