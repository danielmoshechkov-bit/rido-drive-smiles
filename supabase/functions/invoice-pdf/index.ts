import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface InvoiceData {
  id: string;
  invoice_number: string;
  type: string;
  status: string;
  issue_date: string;
  sale_date: string | null;
  due_date: string;
  payment_method: string;
  currency: string;
  net_amount: number;
  vat_amount: number;
  gross_amount: number;
  notes: string | null;
  buyer_snapshot: any;
  entity: {
    name: string;
    nip: string | null;
    address_street: string | null;
    address_city: string | null;
    address_postal_code: string | null;
    bank_account: string | null;
    bank_name: string | null;
    logo_url: string | null;
  };
  items: Array<{
    name: string;
    quantity: number;
    unit: string;
    unit_net_price: number;
    vat_rate: string;
    net_amount: number;
    vat_amount: number;
    gross_amount: number;
  }>;
}

const VAT_LABELS: Record<string, string> = {
  "23": "23%",
  "8": "8%",
  "5": "5%",
  "0": "0%",
  "zw": "zw.",
  "np": "np.",
};

const TYPE_LABELS: Record<string, string> = {
  invoice: "Faktura VAT",
  proforma: "Faktura Proforma",
  correction: "Faktura Korygująca",
  receipt: "Rachunek",
};

const PAYMENT_LABELS: Record<string, string> = {
  transfer: "Przelew",
  cash: "Gotówka",
  card: "Karta",
  other: "Inne",
};

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("pl-PL");
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("pl-PL", {
    style: "currency",
    currency: "PLN",
  }).format(amount);
}

function numberToWords(num: number): string {
  const units = ["", "jeden", "dwa", "trzy", "cztery", "pięć", "sześć", "siedem", "osiem", "dziewięć"];
  const teens = ["dziesięć", "jedenaście", "dwanaście", "trzynaście", "czternaście", "piętnaście", "szesnaście", "siedemnaście", "osiemnaście", "dziewiętnaście"];
  const tens = ["", "", "dwadzieścia", "trzydzieści", "czterdzieści", "pięćdziesiąt", "sześćdziesiąt", "siedemdziesiąt", "osiemdziesiąt", "dziewięćdziesiąt"];
  const hundreds = ["", "sto", "dwieście", "trzysta", "czterysta", "pięćset", "sześćset", "siedemset", "osiemset", "dziewięćset"];
  
  if (num === 0) return "zero";
  
  const zloty = Math.floor(num);
  const grosze = Math.round((num - zloty) * 100);
  
  let result = "";
  
  if (zloty >= 1000) {
    const thousands = Math.floor(zloty / 1000);
    if (thousands === 1) result += "tysiąc ";
    else if (thousands >= 2 && thousands <= 4) result += units[thousands] + " tysiące ";
    else result += units[thousands] + " tysięcy ";
  }
  
  const remainder = zloty % 1000;
  if (remainder >= 100) {
    result += hundreds[Math.floor(remainder / 100)] + " ";
  }
  
  const lastTwo = remainder % 100;
  if (lastTwo >= 10 && lastTwo < 20) {
    result += teens[lastTwo - 10] + " ";
  } else {
    if (lastTwo >= 20) {
      result += tens[Math.floor(lastTwo / 10)] + " ";
    }
    if (lastTwo % 10 > 0) {
      result += units[lastTwo % 10] + " ";
    }
  }
  
  result += "zł ";
  result += grosze.toString().padStart(2, "0") + "/100";
  
  return result.trim();
}

function generateHtml(invoice: InvoiceData): string {
  const itemsHtml = invoice.items
    .map(
      (item, idx) => `
    <tr>
      <td>${idx + 1}</td>
      <td>${item.name}</td>
      <td class="center">${item.quantity}</td>
      <td class="center">${item.unit}</td>
      <td class="right">${formatCurrency(item.unit_net_price)}</td>
      <td class="right">${formatCurrency(item.net_amount)}</td>
      <td class="center">${VAT_LABELS[item.vat_rate] || item.vat_rate}</td>
      <td class="right">${formatCurrency(item.vat_amount)}</td>
      <td class="right">${formatCurrency(item.gross_amount)}</td>
    </tr>
  `
    )
    .join("");

  // Group items by VAT rate for summary
  const vatSummary = invoice.items.reduce((acc, item) => {
    const rate = item.vat_rate;
    if (!acc[rate]) {
      acc[rate] = { net: 0, vat: 0, gross: 0 };
    }
    acc[rate].net += item.net_amount;
    acc[rate].vat += item.vat_amount;
    acc[rate].gross += item.gross_amount;
    return acc;
  }, {} as Record<string, { net: number; vat: number; gross: number }>);

  const vatSummaryHtml = Object.entries(vatSummary)
    .map(
      ([rate, amounts]) => `
    <tr>
      <td>${VAT_LABELS[rate] || rate}</td>
      <td class="right">${formatCurrency(amounts.net)}</td>
      <td class="right">${formatCurrency(amounts.vat)}</td>
      <td class="right">${formatCurrency(amounts.gross)}</td>
    </tr>
  `
    )
    .join("");

  return `
<!DOCTYPE html>
<html lang="pl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${invoice.invoice_number}</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      font-size: 11px;
      line-height: 1.4;
      color: #333;
      padding: 20px;
      max-width: 210mm;
      margin: 0 auto;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 30px;
      padding-bottom: 20px;
      border-bottom: 2px solid #333;
    }
    .logo-section {
      flex: 1;
    }
    .logo-section h1 {
      font-size: 24px;
      color: #1a1a1a;
      margin-bottom: 5px;
    }
    .invoice-title {
      text-align: right;
    }
    .invoice-title h2 {
      font-size: 20px;
      margin-bottom: 5px;
    }
    .invoice-title .number {
      font-size: 16px;
      font-weight: bold;
      color: #555;
    }
    .parties {
      display: flex;
      justify-content: space-between;
      margin-bottom: 30px;
    }
    .party {
      width: 45%;
    }
    .party h3 {
      font-size: 12px;
      color: #666;
      margin-bottom: 10px;
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    .party-name {
      font-size: 14px;
      font-weight: bold;
      margin-bottom: 5px;
    }
    .party-details {
      color: #555;
    }
    .dates {
      display: flex;
      gap: 30px;
      margin-bottom: 20px;
      padding: 15px;
      background: #f9f9f9;
      border-radius: 5px;
    }
    .date-item {
      display: flex;
      flex-direction: column;
    }
    .date-label {
      font-size: 10px;
      color: #666;
      text-transform: uppercase;
    }
    .date-value {
      font-weight: bold;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 20px;
    }
    th, td {
      border: 1px solid #ddd;
      padding: 8px;
      text-align: left;
    }
    th {
      background: #f5f5f5;
      font-weight: 600;
      font-size: 10px;
      text-transform: uppercase;
    }
    .center { text-align: center; }
    .right { text-align: right; }
    .summary-section {
      display: flex;
      justify-content: flex-end;
      margin-bottom: 30px;
    }
    .summary-table {
      width: auto;
      min-width: 300px;
    }
    .summary-table th {
      text-align: left;
    }
    .total-row {
      font-size: 14px;
      font-weight: bold;
      background: #333;
      color: white;
    }
    .total-row td, .total-row th {
      border-color: #333;
    }
    .payment-section {
      display: flex;
      justify-content: space-between;
      margin-bottom: 30px;
      padding: 15px;
      background: #f0f7ff;
      border-radius: 5px;
      border-left: 4px solid #0066cc;
    }
    .payment-info h4 {
      font-size: 10px;
      color: #666;
      margin-bottom: 5px;
      text-transform: uppercase;
    }
    .payment-value {
      font-weight: bold;
      font-size: 12px;
    }
    .amount-words {
      margin-bottom: 30px;
      padding: 10px;
      background: #fff9e6;
      border: 1px dashed #cca300;
      border-radius: 5px;
    }
    .amount-words strong {
      display: block;
      margin-bottom: 5px;
      font-size: 10px;
      color: #666;
      text-transform: uppercase;
    }
    .notes {
      margin-bottom: 30px;
      padding: 10px;
      background: #f5f5f5;
      border-radius: 5px;
    }
    .notes h4 {
      font-size: 10px;
      color: #666;
      margin-bottom: 5px;
      text-transform: uppercase;
    }
    .signatures {
      display: flex;
      justify-content: space-between;
      margin-top: 60px;
    }
    .signature-box {
      width: 40%;
      text-align: center;
    }
    .signature-line {
      border-top: 1px solid #333;
      padding-top: 10px;
      margin-top: 50px;
      font-size: 10px;
      color: #666;
    }
    .footer {
      margin-top: 40px;
      padding-top: 20px;
      border-top: 1px solid #ddd;
      text-align: center;
      font-size: 9px;
      color: #999;
    }
    @media print {
      body { padding: 0; }
      .no-print { display: none; }
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="logo-section">
      <h1>${invoice.entity.name}</h1>
      ${invoice.entity.nip ? `<p>NIP: ${invoice.entity.nip}</p>` : ""}
      ${invoice.entity.address_street ? `<p>${invoice.entity.address_street}</p>` : ""}
      ${invoice.entity.address_postal_code && invoice.entity.address_city ? `<p>${invoice.entity.address_postal_code} ${invoice.entity.address_city}</p>` : ""}
    </div>
    <div class="invoice-title">
      <h2>${TYPE_LABELS[invoice.type] || invoice.type}</h2>
      <p class="number">${invoice.invoice_number}</p>
    </div>
  </div>

  <div class="dates">
    <div class="date-item">
      <span class="date-label">Data wystawienia</span>
      <span class="date-value">${formatDate(invoice.issue_date)}</span>
    </div>
    ${invoice.sale_date ? `
    <div class="date-item">
      <span class="date-label">Data sprzedaży</span>
      <span class="date-value">${formatDate(invoice.sale_date)}</span>
    </div>
    ` : ""}
    <div class="date-item">
      <span class="date-label">Termin płatności</span>
      <span class="date-value">${formatDate(invoice.due_date)}</span>
    </div>
  </div>

  <div class="parties">
    <div class="party">
      <h3>Sprzedawca</h3>
      <p class="party-name">${invoice.entity.name}</p>
      <div class="party-details">
        ${invoice.entity.nip ? `<p>NIP: ${invoice.entity.nip}</p>` : ""}
        ${invoice.entity.address_street ? `<p>${invoice.entity.address_street}</p>` : ""}
        ${invoice.entity.address_postal_code && invoice.entity.address_city ? `<p>${invoice.entity.address_postal_code} ${invoice.entity.address_city}</p>` : ""}
      </div>
    </div>
    <div class="party">
      <h3>Nabywca</h3>
      ${invoice.buyer_snapshot ? `
      <p class="party-name">${invoice.buyer_snapshot.name || ""}</p>
      <div class="party-details">
        ${invoice.buyer_snapshot.nip ? `<p>NIP: ${invoice.buyer_snapshot.nip}</p>` : ""}
        ${invoice.buyer_snapshot.address_street ? `<p>${invoice.buyer_snapshot.address_street}</p>` : ""}
        ${invoice.buyer_snapshot.address_postal_code && invoice.buyer_snapshot.address_city ? `<p>${invoice.buyer_snapshot.address_postal_code} ${invoice.buyer_snapshot.address_city}</p>` : ""}
      </div>
      ` : "<p>Brak danych nabywcy</p>"}
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th style="width: 30px;">Lp.</th>
        <th>Nazwa</th>
        <th class="center" style="width: 50px;">Ilość</th>
        <th class="center" style="width: 50px;">J.m.</th>
        <th class="right" style="width: 80px;">Cena netto</th>
        <th class="right" style="width: 80px;">Wartość netto</th>
        <th class="center" style="width: 50px;">VAT</th>
        <th class="right" style="width: 70px;">Kwota VAT</th>
        <th class="right" style="width: 80px;">Wartość brutto</th>
      </tr>
    </thead>
    <tbody>
      ${itemsHtml}
    </tbody>
  </table>

  <div class="summary-section">
    <table class="summary-table">
      <thead>
        <tr>
          <th>Stawka VAT</th>
          <th class="right">Netto</th>
          <th class="right">VAT</th>
          <th class="right">Brutto</th>
        </tr>
      </thead>
      <tbody>
        ${vatSummaryHtml}
      </tbody>
      <tfoot>
        <tr class="total-row">
          <th>RAZEM</th>
          <td class="right">${formatCurrency(invoice.net_amount)}</td>
          <td class="right">${formatCurrency(invoice.vat_amount)}</td>
          <td class="right">${formatCurrency(invoice.gross_amount)}</td>
        </tr>
      </tfoot>
    </table>
  </div>

  <div class="amount-words">
    <strong>Słownie do zapłaty:</strong>
    ${numberToWords(invoice.gross_amount)}
  </div>

  <div class="payment-section">
    <div class="payment-info">
      <h4>Forma płatności</h4>
      <p class="payment-value">${PAYMENT_LABELS[invoice.payment_method] || invoice.payment_method}</p>
    </div>
    ${invoice.entity.bank_account ? `
    <div class="payment-info">
      <h4>Numer konta</h4>
      <p class="payment-value">${invoice.entity.bank_account}</p>
      ${invoice.entity.bank_name ? `<p style="font-size: 10px; color: #666;">${invoice.entity.bank_name}</p>` : ""}
    </div>
    ` : ""}
    <div class="payment-info">
      <h4>Do zapłaty</h4>
      <p class="payment-value" style="font-size: 16px; color: #0066cc;">${formatCurrency(invoice.gross_amount)}</p>
    </div>
  </div>

  ${invoice.notes ? `
  <div class="notes">
    <h4>Uwagi</h4>
    <p>${invoice.notes}</p>
  </div>
  ` : ""}

  <div class="signatures">
    <div class="signature-box">
      <div class="signature-line">Podpis osoby upoważnionej do odbioru</div>
    </div>
    <div class="signature-box">
      <div class="signature-line">Podpis osoby upoważnionej do wystawienia</div>
    </div>
  </div>

  <div class="footer">
    <p>Dokument wygenerowany elektronicznie w systemie GetRido</p>
  </div>
</body>
</html>
`;
}

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { invoiceId } = await req.json();

    if (!invoiceId) {
      return new Response(
        JSON.stringify({ error: "Invoice ID is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch invoice with entity and items
    const { data: invoice, error: invoiceError } = await supabase
      .from("invoices")
      .select(`
        *,
        entity:entities(*),
        items:invoice_items(*)
      `)
      .eq("id", invoiceId)
      .single();

    if (invoiceError || !invoice) {
      console.error("Error fetching invoice:", invoiceError);
      return new Response(
        JSON.stringify({ error: "Invoice not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Generate HTML
    const invoiceData: InvoiceData = {
      id: invoice.id,
      invoice_number: invoice.invoice_number,
      type: invoice.type,
      status: invoice.status,
      issue_date: invoice.issue_date,
      sale_date: invoice.sale_date,
      due_date: invoice.due_date,
      payment_method: invoice.payment_method,
      currency: invoice.currency,
      net_amount: invoice.net_amount,
      vat_amount: invoice.vat_amount,
      gross_amount: invoice.gross_amount,
      notes: invoice.notes,
      buyer_snapshot: invoice.buyer_snapshot,
      entity: invoice.entity,
      items: invoice.items || [],
    };

    const html = generateHtml(invoiceData);

    // For now, we return HTML that can be converted to PDF by the client
    // In production, you'd use a PDF library like jsPDF or call a PDF service
    
    // Save HTML to storage as a simple PDF placeholder
    const fileName = `invoices/${invoiceId}/${invoice.invoice_number?.replace(/\//g, "-") || invoiceId}.html`;
    
    const { error: uploadError } = await supabase.storage
      .from("documents")
      .upload(fileName, html, {
        contentType: "text/html",
        upsert: true,
      });

    if (uploadError) {
      console.error("Error uploading:", uploadError);
    }

    const { data: urlData } = supabase.storage
      .from("documents")
      .getPublicUrl(fileName);

    // Update invoice with PDF URL
    await supabase
      .from("invoices")
      .update({ pdf_url: urlData.publicUrl })
      .eq("id", invoiceId);

    return new Response(
      JSON.stringify({ 
        success: true, 
        pdfUrl: urlData.publicUrl,
        html: html 
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("Error generating PDF:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
