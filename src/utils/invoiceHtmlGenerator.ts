// Local invoice HTML generator for browser-based PDF printing

export interface InvoiceItem {
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

export interface InvoiceSeller {
  name: string;
  nip?: string;
  address_street?: string;
  address_city?: string;
  address_postal_code?: string;
  bank_name?: string;
  bank_account?: string;
  email?: string;
  phone?: string;
  logo_url?: string;
}

export interface InvoiceBuyer {
  name: string;
  nip?: string;
  address_street?: string;
  address_city?: string;
  address_postal_code?: string;
}

export interface InvoiceData {
  invoice_number: string;
  type: 'invoice' | 'proforma' | 'receipt';
  issue_date: string;
  sale_date: string;
  due_date: string;
  payment_method: 'transfer' | 'cash' | 'card';
  notes?: string;
  items: InvoiceItem[];
  seller: InvoiceSeller;
  buyer: InvoiceBuyer;
}

export const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('pl-PL', { 
    style: 'currency', 
    currency: 'PLN',
    minimumFractionDigits: 2 
  }).format(amount);
};

export const formatDate = (dateStr: string): string => {
  return new Date(dateStr).toLocaleDateString('pl-PL');
};

export const numberToWords = (num: number): string => {
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

export const calculateItemTotals = (item: Partial<InvoiceItem>): InvoiceItem => {
  const quantity = item.quantity || 0;
  const unitNetPrice = item.unit_net_price || 0;
  const vatRate = parseFloat(item.vat_rate || '23');
  
  const netAmount = quantity * unitNetPrice;
  const vatAmount = netAmount * (vatRate / 100);
  const grossAmount = netAmount + vatAmount;
  
  return {
    name: item.name || '',
    pkwiu: item.pkwiu,
    quantity,
    unit: item.unit || 'szt.',
    unit_net_price: unitNetPrice,
    vat_rate: item.vat_rate || '23',
    net_amount: Math.round(netAmount * 100) / 100,
    vat_amount: Math.round(vatAmount * 100) / 100,
    gross_amount: Math.round(grossAmount * 100) / 100
  };
};

export const generateInvoiceHtml = (invoice: InvoiceData): string => {
  const { seller, buyer, items } = invoice;
  
  const netTotal = items.reduce((sum, item) => sum + item.net_amount, 0);
  const vatTotal = items.reduce((sum, item) => sum + item.vat_amount, 0);
  const grossTotal = items.reduce((sum, item) => sum + item.gross_amount, 0);
  
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
    card: 'Karta'
  };

  const typeLabels: Record<string, string> = {
    invoice: 'Faktura VAT',
    proforma: 'Faktura Proforma',
    receipt: 'Rachunek'
  };

  // Generate safe filename for PDF
  const safeFileName = `${invoice.invoice_number.replace(/\//g, '_')}_${invoice.buyer.name.replace(/[^a-zA-Z0-9ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/g, '_').substring(0, 30)}`;
  
  return `
<!DOCTYPE html>
<html lang="pl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${safeFileName}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    @page { margin: 15mm; }
    body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 12px; line-height: 1.4; color: #333; padding: 20px; }
    .invoice { max-width: 800px; margin: 0 auto; background: white; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 30px; padding-bottom: 20px; border-bottom: 2px solid #7c3aed; }
    .logo-area { min-width: 200px; min-height: 60px; }
    .logo-area img { max-width: 200px; max-height: 60px; object-fit: contain; }
    .logo-text { font-size: 20px; font-weight: bold; color: #7c3aed; }
    .invoice-title { text-align: right; }
    .invoice-title h1 { font-size: 20px; color: #333; margin-bottom: 5px; }
    .invoice-number { font-size: 16px; font-weight: bold; color: #7c3aed; }
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
    th { background: #7c3aed; color: white; padding: 10px 8px; text-align: left; font-size: 11px; font-weight: 600; }
    th:first-child { border-radius: 6px 0 0 0; }
    th:last-child { border-radius: 0 6px 0 0; }
    .totals { display: flex; justify-content: flex-end; margin-bottom: 20px; }
    .totals-table { width: 300px; }
    .totals-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #eee; }
    .totals-row.grand { border-bottom: none; background: #7c3aed; color: white; padding: 12px; border-radius: 6px; font-size: 14px; }
    .totals-label { font-weight: 500; }
    .totals-value { font-weight: bold; }
    .amount-words { margin-bottom: 20px; padding: 15px; background: #f0f9ff; border-left: 4px solid #7c3aed; border-radius: 4px; }
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
      <div class="logo-area">
        ${seller.logo_url ? `<img src="${seller.logo_url}" alt="Logo" />` : `<div class="logo-text">${seller.name || ''}</div>`}
      </div>
      <div class="invoice-title">
        <h1>${typeLabels[invoice.type] || 'Faktura VAT'}</h1>
        <div class="invoice-number">${invoice.invoice_number}</div>
      </div>
    </div>

    <div class="parties">
      <div class="party">
        <div class="party-label">Sprzedawca</div>
        <div class="party-name">${seller.name || ''}</div>
        <div class="party-details">
          ${seller.nip ? `NIP: ${seller.nip}<br>` : ''}
          ${seller.address_street || ''}<br>
          ${seller.address_postal_code || ''} ${seller.address_city || ''}<br>
          ${seller.bank_account ? `Bank: ${seller.bank_name || ''}<br>Nr konta: ${seller.bank_account}` : ''}
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
        <div class="date-value">${formatDate(invoice.sale_date)}</div>
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
          <span class="totals-value">${formatCurrency(netTotal)}</span>
        </div>
        <div class="totals-row">
          <span class="totals-label">VAT:</span>
          <span class="totals-value">${formatCurrency(vatTotal)}</span>
        </div>
        <div class="totals-row grand">
          <span class="totals-label">DO ZAPŁATY:</span>
          <span class="totals-value">${formatCurrency(grossTotal)}</span>
        </div>
      </div>
    </div>

    <div class="amount-words">
      <div class="amount-words-label">Słownie</div>
      <div class="amount-words-value">${numberToWords(grossTotal)}</div>
    </div>

    <div class="payment">
      <div class="payment-row">
        <span class="payment-label">Sposób płatności:</span>
        <span class="payment-value">${paymentMethodLabels[invoice.payment_method] || invoice.payment_method}</span>
      </div>
      ${seller.bank_account && invoice.payment_method === 'transfer' ? `
      <div class="payment-row">
        <span class="payment-label">Numer konta:</span>
        <span class="payment-value">${seller.bank_account}</span>
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

export const printInvoice = (invoice: InvoiceData): void => {
  const html = generateInvoiceHtml(invoice);
  const printWindow = window.open('', '_blank');
  if (printWindow) {
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
    }, 250);
  }
};
