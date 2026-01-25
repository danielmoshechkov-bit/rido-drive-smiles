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
  discount_percent?: number;
  discount_amount?: number;
}

export interface InvoiceSeller {
  name: string;
  nip?: string;
  address_street?: string;
  address_building_number?: string;
  address_apartment_number?: string;
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
  address_building_number?: string;
  address_apartment_number?: string;
  address_city?: string;
  address_postal_code?: string;
}

export interface InvoiceData {
  invoice_number: string;
  type: 'invoice' | 'proforma' | 'receipt' | string;
  issue_date: string;
  sale_date: string;
  due_date: string;
  issue_place?: string;
  payment_method: 'transfer' | 'cash' | 'card';
  notes?: string;
  items: InvoiceItem[];
  seller: InvoiceSeller;
  buyer: InvoiceBuyer;
  currency?: string;
  discount_global?: number;
  discount_mode?: 'percent' | 'amount';
  // Payment tracking
  paid_amount?: number;
  is_fully_paid?: boolean;
  // Signature options
  signature_type?: 'none' | 'receiver' | 'issuer' | 'both_none' | 'valid_without_signature';
  issued_by?: string;
}

export type Currency = 'PLN' | 'EUR' | 'USD' | 'GBP' | 'CHF' | 'CZK';

const CURRENCY_CONFIG: Record<string, { locale: string; symbol: string }> = {
  PLN: { locale: 'pl-PL', symbol: 'zł' },
  EUR: { locale: 'de-DE', symbol: '€' },
  USD: { locale: 'en-US', symbol: '$' },
  GBP: { locale: 'en-GB', symbol: '£' },
  CHF: { locale: 'de-CH', symbol: 'CHF' },
  CZK: { locale: 'cs-CZ', symbol: 'Kč' },
};

export const formatCurrency = (amount: number, currency: string = 'PLN'): string => {
  const config = CURRENCY_CONFIG[currency] || CURRENCY_CONFIG.PLN;
  return new Intl.NumberFormat(config.locale, { 
    style: 'currency', 
    currency: currency,
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
    gross_amount: Math.round(grossAmount * 100) / 100,
    discount_percent: item.discount_percent,
    discount_amount: item.discount_amount,
  };
};

// Helper to format address
const formatAddress = (entity: InvoiceSeller | InvoiceBuyer): string => {
  const parts: string[] = [];
  
  if (entity.address_street) {
    let streetLine = entity.address_street;
    if (entity.address_building_number) {
      streetLine += ` ${entity.address_building_number}`;
    }
    if (entity.address_apartment_number) {
      streetLine += `/${entity.address_apartment_number}`;
    }
    parts.push(streetLine);
  }
  
  if (entity.address_postal_code || entity.address_city) {
    parts.push(`${entity.address_postal_code || ''} ${entity.address_city || ''}`.trim());
  }
  
  return parts.join('<br>');
};

export const generateInvoiceHtml = (invoice: InvoiceData): string => {
  const { seller, buyer, items, currency = 'PLN' } = invoice;
  
  const netTotal = items.reduce((sum, item) => sum + item.net_amount, 0);
  const vatTotal = items.reduce((sum, item) => sum + item.vat_amount, 0);
  const grossTotal = items.reduce((sum, item) => sum + item.gross_amount, 0);
  
  const itemsHtml = items.map((item, index) => `
    <tr>
      <td style="border: 1px solid #ddd; padding: 8px; text-align: center;">${index + 1}</td>
      <td style="border: 1px solid #ddd; padding: 8px;">${item.name}${item.pkwiu ? ` <small>(${item.pkwiu})</small>` : ''}</td>
      <td style="border: 1px solid #ddd; padding: 8px; text-align: center;">${item.unit}</td>
      <td style="border: 1px solid #ddd; padding: 8px; text-align: right;">${item.quantity}</td>
      <td style="border: 1px solid #ddd; padding: 8px; text-align: right;">${formatCurrency(item.unit_net_price, currency)}</td>
      <td style="border: 1px solid #ddd; padding: 8px; text-align: right;">${formatCurrency(item.net_amount, currency)}</td>
      <td style="border: 1px solid #ddd; padding: 8px; text-align: center;">${item.vat_rate}%</td>
      <td style="border: 1px solid #ddd; padding: 8px; text-align: right;">${formatCurrency(item.vat_amount, currency)}</td>
      <td style="border: 1px solid #ddd; padding: 8px; text-align: right; font-weight: bold;">${formatCurrency(item.gross_amount, currency)}</td>
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
    receipt: 'Rachunek',
    vat_margin: 'Faktura VAT marża',
    vat_rr: 'Faktura VAT RR',
    correction: 'Faktura korygująca',
    advance: 'Faktura zaliczkowa',
    final: 'Faktura końcowa',
    kp: 'KP - Kasa Przyjmie',
    kw: 'KW - Kasa Wyda',
    wz: 'WZ - Wydanie Zewnętrzne',
    pz: 'PZ - Przyjęcie Zewnętrzne',
    nota: 'Nota księgowa'
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
    @page { 
      margin: 10mm; 
      size: A4;
    }
    @media print {
      html, body { 
        height: 100%; 
        margin: 0 !important; 
        padding: 0 !important;
      }
      .invoice { 
        max-width: 100%; 
        page-break-inside: avoid;
      }
      thead { display: table-header-group; }
      tfoot { display: table-footer-group; }
    }
    body { 
      font-family: 'Segoe UI', Arial, sans-serif; 
      font-size: 11px; 
      line-height: 1.3; 
      color: #333; 
      padding: 10px;
      background: white;
    }
    .invoice { 
      max-width: 800px; 
      margin: 0 auto; 
      background: white;
      min-height: 100%;
    }
    .header { 
      display: flex; 
      justify-content: space-between; 
      align-items: flex-start; 
      margin-bottom: 15px; 
      padding-bottom: 10px; 
      border-bottom: 2px solid #7c3aed; 
    }
    .logo-area { min-width: 150px; min-height: 40px; }
    .logo-area img { max-width: 150px; max-height: 40px; object-fit: contain; }
    .logo-text { font-size: 18px; font-weight: bold; color: #7c3aed; }
    .invoice-title { text-align: right; }
    .invoice-title h1 { font-size: 16px; color: #333; margin-bottom: 3px; }
    .invoice-number { font-size: 13px; font-weight: bold; color: #7c3aed; }
    .parties { display: flex; gap: 20px; margin-bottom: 15px; }
    .party { flex: 1; }
    .party-label { font-size: 10px; color: #666; text-transform: uppercase; margin-bottom: 4px; font-weight: 600; }
    .party-name { font-size: 12px; font-weight: bold; margin-bottom: 2px; }
    .party-details { font-size: 10px; color: #555; line-height: 1.4; }
    .dates { display: flex; gap: 20px; margin-bottom: 12px; padding: 10px; background: #f8fafc; border-radius: 6px; flex-wrap: wrap; }
    .date-item { }
    .date-label { font-size: 9px; color: #666; text-transform: uppercase; }
    .date-value { font-size: 11px; font-weight: 600; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
    th { background: #7c3aed; color: white; padding: 6px 4px; text-align: left; font-size: 10px; font-weight: 600; }
    th:first-child { border-radius: 4px 0 0 0; }
    th:last-child { border-radius: 0 4px 0 0; }
    td { padding: 4px; font-size: 10px; }
    .totals { display: flex; justify-content: flex-end; margin-bottom: 12px; }
    .totals-table { width: 250px; }
    .totals-row { display: flex; justify-content: space-between; padding: 5px 0; border-bottom: 1px solid #eee; font-size: 11px; }
    .totals-row.grand { border-bottom: none; background: #7c3aed; color: white; padding: 8px; border-radius: 4px; font-size: 12px; }
    .totals-label { font-weight: 500; }
    .totals-value { font-weight: bold; }
    .amount-words { margin-bottom: 12px; padding: 10px; background: #f0f9ff; border-left: 3px solid #7c3aed; border-radius: 3px; }
    .amount-words-label { font-size: 9px; color: #666; text-transform: uppercase; margin-bottom: 2px; }
    .amount-words-value { font-style: italic; font-size: 10px; }
    .payment { margin-bottom: 12px; font-size: 11px; }
    .payment-row { display: flex; gap: 20px; margin-bottom: 4px; }
    .payment-label { color: #666; min-width: 100px; }
    .payment-value { font-weight: 500; }
    .notes { margin-bottom: 15px; padding: 10px; background: #fef3c7; border-radius: 6px; font-size: 10px; }
    .notes-label { font-size: 9px; color: #92400e; text-transform: uppercase; margin-bottom: 4px; font-weight: 600; }
    .footer { display: flex; justify-content: space-between; margin-top: 20px; padding-top: 10px; }
    .signature { width: 180px; text-align: center; }
    .signature-line { border-top: 1px solid #333; margin-top: 30px; padding-top: 6px; font-size: 9px; color: #666; }
  </style>
</head>
<body>
  <div class="invoice">
    <div class="header">
      <div class="logo-area">
        ${seller.logo_url ? `<img src="${seller.logo_url}" alt="Logo" />` : ''}
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
          ${formatAddress(seller)}
        </div>
      </div>
      <div class="party">
        <div class="party-label">Nabywca</div>
        <div class="party-name">${buyer.name || ''}</div>
        <div class="party-details">
          ${buyer.nip ? `NIP: ${buyer.nip}<br>` : ''}
          ${formatAddress(buyer)}
        </div>
      </div>
    </div>

    <div class="dates">
      ${invoice.issue_place ? `
      <div class="date-item">
        <div class="date-label">Miejsce wystawienia</div>
        <div class="date-value">${invoice.issue_place}</div>
      </div>
      ` : ''}
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
          <span class="totals-value">${formatCurrency(netTotal, currency)}</span>
        </div>
        <div class="totals-row">
          <span class="totals-label">VAT:</span>
          <span class="totals-value">${formatCurrency(vatTotal, currency)}</span>
        </div>
        <div class="totals-row grand">
          <span class="totals-label">DO ZAPŁATY:</span>
          <span class="totals-value">${formatCurrency(grossTotal, currency)}</span>
        </div>
        ${(invoice.paid_amount && invoice.paid_amount > 0) ? `
        <div class="totals-row" style="margin-top: 10px; border-top: 1px solid #ddd; padding-top: 10px;">
          <span class="totals-label">Zapłacono:</span>
          <span class="totals-value" style="color: #16a34a;">${formatCurrency(invoice.paid_amount, currency)}</span>
        </div>
        <div class="totals-row" style="background: #fef3c7; padding: 8px; border-radius: 4px;">
          <span class="totals-label" style="font-weight: bold;">Pozostało do zapłaty:</span>
          <span class="totals-value" style="font-weight: bold; color: #dc2626;">${formatCurrency(grossTotal - invoice.paid_amount, currency)}</span>
        </div>
        ` : ''}
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
        <span class="payment-label">Bank:</span>
        <span class="payment-value">${seller.bank_name || ''}</span>
      </div>
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
      ${invoice.signature_type === 'valid_without_signature' || invoice.signature_type === 'none' || !invoice.signature_type ? `
      <div style="width: 100%; text-align: center; font-size: 11px; color: #666; font-style: italic;">
        Faktura ważna bez podpisu
      </div>
      ` : `
      <div class="signature">
        ${invoice.signature_type === 'receiver' || invoice.signature_type === 'both_none' ? '' : `
        <div class="signature-line">Podpis osoby upoważnionej<br>do odbioru faktury</div>
        `}
      </div>
      <div class="signature">
        ${invoice.signature_type === 'issuer' || invoice.signature_type === 'both_none' ? '' : `
        <div class="signature-line">Podpis osoby upoważnionej<br>do wystawienia faktury${invoice.issued_by ? `<br><strong>${invoice.issued_by}</strong>` : ''}</div>
        `}
      </div>
      `}
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
