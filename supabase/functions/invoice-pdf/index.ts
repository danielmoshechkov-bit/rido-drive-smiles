import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface InvoiceItem {
  name: string;
  pkwiu?: string;
  quantity: number;
  unit: string;
  unit_net_price: number;
  vat_rate: string;
  net_amount: number;
  vat_amount: number;
  gross_amount: number;
}

const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('pl-PL', { 
    style: 'currency', 
    currency: 'PLN',
    minimumFractionDigits: 2 
  }).format(amount);
};

const formatDate = (dateStr: string): string => {
  return new Date(dateStr).toLocaleDateString('pl-PL');
};

const numberToWords = (num: number): string => {
  const ones = ['', 'jeden', 'dwa', 'trzy', 'cztery', 'pięć', 'sześć', 'siedem', 'osiem', 'dziewięć'];
  const teens = ['dziesięć', 'jedenaście', 'dwanaście', 'trzynaście', 'czternaście', 'piętnaście', 
                 'szesnaście', 'siedemnaście', 'osiemnaście', 'dziewiętnaście'];
  const tens = ['', '', 'dwadzieścia', 'trzydzieści', 'czterdzieści', 'pięćdziesiąt', 
                'sześćdziesiąt', 'siedemdziesiąt', 'osiemdziesiąt', 'dziewięćdziesiąt'];
  const hundreds = ['', 'sto', 'dwieście', 'trzysta', 'czterysta', 'pięćset', 
                    'sześćset', 'siedemset', 'osiemset', 'dziewięćset'];
  
  if (num === 0) return 'zero';
  
  const zlote = Math.floor(num);
  const grosze = Math.round((num - zlote) * 100);
  
  let result = '';
  
  if (zlote >= 1000) {
    const thousands = Math.floor(zlote / 1000);
    if (thousands === 1) result += 'tysiąc ';
    else if (thousands < 5) result += ones[thousands] + ' tysiące ';
    else result += ones[thousands] + ' tysięcy ';
  }
  
  const remainder = zlote % 1000;
  if (remainder >= 100) {
    result += hundreds[Math.floor(remainder / 100)] + ' ';
  }
  
  const lastTwo = remainder % 100;
  if (lastTwo >= 10 && lastTwo < 20) {
    result += teens[lastTwo - 10] + ' ';
  } else {
    if (lastTwo >= 20) result += tens[Math.floor(lastTwo / 10)] + ' ';
    if (lastTwo % 10 > 0) result += ones[lastTwo % 10] + ' ';
  }
  
  result += 'złotych';
  if (grosze > 0) {
    result += ` ${grosze}/100`;
  }
  
  return result.trim();
};

const generateInvoiceHtml = (invoice: any, entity: any, items: InvoiceItem[]): string => {
  const buyer = invoice.buyer_entity_snapshot || {};
  
  const itemsHtml = items.map((item, index) => `
    <tr>
      <td style="border: 1px solid #ddd; padding: 8px; text-align: center;">${index + 1}</td>
      <td style="border: 1px solid #ddd; padding: 8px;">${item.name}${item.pkwiu ? ` <small>(${item.pkwiu})</small>` : ''}</td>
      <td style="border: 1px solid #ddd; padding: 8px; text-align: center;">${item.unit}</td>
      <td style="border: 1px solid #ddd; padding: 8px; text-align: right;">${item.quantity}</td>
      <td style="border: 1px solid #ddd; padding: 8px; text-align: right;">${formatCurrency(item.unit_net_price)}</td>
      <td style="border: 1px solid #ddd; padding: 8px; text-align: right;">${formatCurrency(item.net_amount)}</td>
      <td style="border: 1px solid #ddd; padding: 8px; text-align: center;">${item.vat_rate}%</td>
      <td style="border: 1px solid #ddd; padding: 8px; text-align: right;">${formatCurrency(item.vat_amount)}</td>
      <td style="border: 1px solid #ddd; padding: 8px; text-align: right; font-weight: bold;">${formatCurrency(item.gross_amount)}</td>
    </tr>
  `).join('');

  const paymentMethodLabels: Record<string, string> = {
    transfer: 'Przelew',
    cash: 'Gotówka',
    card: 'Karta',
    other: 'Inne'
  };

  const typeLabels: Record<string, string> = {
    invoice: 'Faktura VAT',
    proforma: 'Faktura Proforma',
    correction: 'Faktura korygująca',
    receipt: 'Rachunek'
  };

  return `
<!DOCTYPE html>
<html lang="pl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${invoice.invoice_number}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 12px; line-height: 1.4; color: #333; padding: 20px; }
    .invoice { max-width: 800px; margin: 0 auto; background: white; }
    .header { display: flex; justify-content: space-between; margin-bottom: 30px; padding-bottom: 20px; border-bottom: 2px solid #2563eb; }
    .logo { font-size: 24px; font-weight: bold; color: #2563eb; }
    .invoice-title { text-align: right; }
    .invoice-title h1 { font-size: 20px; color: #333; margin-bottom: 5px; }
    .invoice-number { font-size: 16px; font-weight: bold; color: #2563eb; }
    .parties { display: flex; gap: 40px; margin-bottom: 30px; }
    .party { flex: 1; }
    .party-label { font-size: 11px; color: #666; text-transform: uppercase; margin-bottom: 8px; font-weight: 600; }
    .party-name { font-size: 14px; font-weight: bold; margin-bottom: 4px; }
    .party-details { font-size: 11px; color: #555; }
    .dates { display: flex; gap: 30px; margin-bottom: 20px; padding: 15px; background: #f8fafc; border-radius: 8px; }
    .date-item { }
    .date-label { font-size: 10px; color: #666; text-transform: uppercase; }
    .date-value { font-size: 13px; font-weight: 600; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
    th { background: #2563eb; color: white; padding: 10px 8px; text-align: left; font-size: 11px; font-weight: 600; }
    th:first-child { border-radius: 6px 0 0 0; }
    th:last-child { border-radius: 0 6px 0 0; }
    .totals { display: flex; justify-content: flex-end; margin-bottom: 20px; }
    .totals-table { width: 300px; }
    .totals-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #eee; }
    .totals-row.grand { border-bottom: none; background: #2563eb; color: white; padding: 12px; border-radius: 6px; font-size: 14px; }
    .totals-label { font-weight: 500; }
    .totals-value { font-weight: bold; }
    .amount-words { margin-bottom: 20px; padding: 15px; background: #f0f9ff; border-left: 4px solid #2563eb; border-radius: 4px; }
    .amount-words-label { font-size: 10px; color: #666; text-transform: uppercase; margin-bottom: 4px; }
    .amount-words-value { font-style: italic; }
    .payment { margin-bottom: 20px; }
    .payment-row { display: flex; gap: 30px; margin-bottom: 8px; }
    .payment-label { color: #666; min-width: 120px; }
    .payment-value { font-weight: 500; }
    .notes { margin-bottom: 30px; padding: 15px; background: #fef3c7; border-radius: 8px; }
    .notes-label { font-size: 10px; color: #92400e; text-transform: uppercase; margin-bottom: 8px; font-weight: 600; }
    .footer { display: flex; justify-content: space-between; margin-top: 60px; padding-top: 20px; }
    .signature { width: 200px; text-align: center; }
    .signature-line { border-top: 1px solid #333; margin-top: 60px; padding-top: 8px; font-size: 10px; color: #666; }
    @media print {
      body { padding: 0; }
      .invoice { max-width: 100%; }
    }
  </style>
</head>
<body>
  <div class="invoice">
    <div class="header">
      <div class="logo">
        ${entity?.logo_url ? `<img src="${entity.logo_url}" alt="Logo" style="max-height: 60px;">` : entity?.name || 'GetRido'}
      </div>
      <div class="invoice-title">
        <h1>${typeLabels[invoice.type] || 'Faktura VAT'}</h1>
        <div class="invoice-number">${invoice.invoice_number}</div>
      </div>
    </div>

    <div class="parties">
      <div class="party">
        <div class="party-label">Sprzedawca</div>
        <div class="party-name">${entity?.name || ''}</div>
        <div class="party-details">
          ${entity?.nip ? `NIP: ${entity.nip}<br>` : ''}
          ${entity?.address_street || ''}<br>
          ${entity?.address_postal_code || ''} ${entity?.address_city || ''}<br>
          ${entity?.bank_account ? `Bank: ${entity.bank_account}` : ''}
        </div>
      </div>
      <div class="party">
        <div class="party-label">Nabywca</div>
        <div class="party-name">${buyer.name || ''}</div>
        <div class="party-details">
          ${buyer.nip ? `NIP: ${buyer.nip}<br>` : ''}
          ${buyer.address_street || ''}<br>
          ${buyer.address_postal_code || ''} ${buyer.address_city || ''}
        </div>
      </div>
    </div>

    <div class="dates">
      <div class="date-item">
        <div class="date-label">Data wystawienia</div>
        <div class="date-value">${formatDate(invoice.issue_date)}</div>
      </div>
      <div class="date-item">
        <div class="date-label">Data sprzedaży</div>
        <div class="date-value">${formatDate(invoice.sale_date || invoice.issue_date)}</div>
      </div>
      <div class="date-item">
        <div class="date-label">Termin płatności</div>
        <div class="date-value">${formatDate(invoice.due_date)}</div>
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th style="width: 30px;">Lp.</th>
          <th>Nazwa towaru / usługi</th>
          <th style="width: 50px;">Jm.</th>
          <th style="width: 50px;">Ilość</th>
          <th style="width: 80px;">Cena netto</th>
          <th style="width: 90px;">Wartość netto</th>
          <th style="width: 50px;">VAT</th>
          <th style="width: 80px;">Kwota VAT</th>
          <th style="width: 100px;">Wartość brutto</th>
        </tr>
      </thead>
      <tbody>
        ${itemsHtml}
      </tbody>
    </table>

    <div class="totals">
      <div class="totals-table">
        <div class="totals-row">
          <span class="totals-label">Razem netto:</span>
          <span class="totals-value">${formatCurrency(invoice.net_amount)}</span>
        </div>
        <div class="totals-row">
          <span class="totals-label">VAT:</span>
          <span class="totals-value">${formatCurrency(invoice.vat_amount)}</span>
        </div>
        <div class="totals-row grand">
          <span class="totals-label">DO ZAPŁATY:</span>
          <span class="totals-value">${formatCurrency(invoice.gross_amount)}</span>
        </div>
      </div>
    </div>

    <div class="amount-words">
      <div class="amount-words-label">Słownie</div>
      <div class="amount-words-value">${numberToWords(invoice.gross_amount)}</div>
    </div>

    <div class="payment">
      <div class="payment-row">
        <span class="payment-label">Sposób płatności:</span>
        <span class="payment-value">${paymentMethodLabels[invoice.payment_method] || invoice.payment_method}</span>
      </div>
      ${entity?.bank_account ? `
      <div class="payment-row">
        <span class="payment-label">Numer konta:</span>
        <span class="payment-value">${entity.bank_account}</span>
      </div>
      ` : ''}
    </div>

    ${invoice.notes ? `
    <div class="notes">
      <div class="notes-label">Uwagi</div>
      <div>${invoice.notes}</div>
    </div>
    ` : ''}

    <div class="footer">
      <div class="signature">
        <div class="signature-line">Podpis osoby upoważnionej<br>do odbioru faktury</div>
      </div>
      <div class="signature">
        <div class="signature-line">Podpis osoby upoważnionej<br>do wystawienia faktury</div>
      </div>
    </div>
  </div>
</body>
</html>
  `;
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { invoice_id } = await req.json();

    if (!invoice_id) {
      throw new Error("invoice_id is required");
    }

    console.log(`Generating PDF for invoice: ${invoice_id}`);

    // Fetch invoice with items
    const { data: invoice, error: invoiceError } = await supabaseAdmin
      .from('invoices')
      .select('*')
      .eq('id', invoice_id)
      .single();

    if (invoiceError || !invoice) {
      throw new Error(`Invoice not found: ${invoiceError?.message}`);
    }

    // Fetch items
    const { data: items, error: itemsError } = await supabaseAdmin
      .from('invoice_items')
      .select('*')
      .eq('invoice_id', invoice_id)
      .order('sort_order');

    if (itemsError) {
      console.error('Error fetching items:', itemsError);
    }

    // Fetch entity (seller)
    const { data: entity, error: entityError } = await supabaseAdmin
      .from('entities')
      .select('*')
      .eq('id', invoice.entity_id)
      .single();

    if (entityError) {
      console.error('Error fetching entity:', entityError);
    }

    // Generate HTML
    const html = generateInvoiceHtml(invoice, entity, items || []);

    // For now, return HTML that can be printed/saved as PDF by the browser
    // In production, you would use a PDF generation service like Puppeteer, wkhtmltopdf, or a cloud service
    
    // Store HTML temporarily (in production, generate actual PDF and store in storage)
    const fileName = `invoice_${invoice.invoice_number.replace(/[^a-zA-Z0-9]/g, '_')}.html`;
    
    // Upload to storage
    const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
      .from('invoices')
      .upload(fileName, html, {
        contentType: 'text/html',
        upsert: true,
      });

    if (uploadError) {
      // If bucket doesn't exist, create it
      if (uploadError.message.includes('Bucket not found')) {
        await supabaseAdmin.storage.createBucket('invoices', { public: false });
        await supabaseAdmin.storage.from('invoices').upload(fileName, html, {
          contentType: 'text/html',
          upsert: true,
        });
      } else {
        console.error('Upload error:', uploadError);
      }
    }

    // Get signed URL
    const { data: signedUrl } = await supabaseAdmin.storage
      .from('invoices')
      .createSignedUrl(fileName, 3600); // 1 hour expiry

    // Update invoice with PDF URL
    await supabaseAdmin
      .from('invoices')
      .update({ pdf_url: signedUrl?.signedUrl })
      .eq('id', invoice_id);

    console.log(`PDF generated successfully for invoice: ${invoice.invoice_number}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        pdf_url: signedUrl?.signedUrl,
        html // Also return HTML for direct rendering
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );
  } catch (error: any) {
    console.error("Error generating invoice PDF:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { 
        status: 500, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );
  }
});
