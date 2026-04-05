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
  swift_code?: string;
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
  // PDF options
  compact_pdf?: boolean;
  // KSeF
  ksef_status?: string;
  ksef_reference?: string;
  ksef_acceptance_date?: string;
  // Correction data
  correction_data?: {
    original_invoice_number: string;
    original_invoice_date: string;
    correction_reason: string;
    before_items: InvoiceItem[];
    after_items: InvoiceItem[];
    before_totals: { net: number; vat: number; gross: number };
    after_totals: { net: number; vat: number; gross: number };
    diff_totals: { net: number; vat: number; gross: number };
  };
  // Advance invoice data
  advance_data?: {
    advance_invoice_number?: string;
    advance_invoice_date?: string;
    advance_amount?: number;
    advance_vat?: number;
  };
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

export const isOfficialKsefReference = (value?: string): boolean => {
  if (!value) return false;
  const trimmed = value.trim();
  return /^\d{10}-\d{8}-[A-Z0-9-]+$/i.test(trimmed) && !trimmed.includes('-SO-');
};

export const printHtmlDocument = (html: string): void => {
  const printWindow = window.open('', '_blank');
  if (!printWindow) return;

  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();

  const startedAt = Date.now();
  const waitForAssetsAndPrint = () => {
    const qrImages = printWindow.document.querySelectorAll('img.ksef-qr');

    if (qrImages.length === 0) {
      setTimeout(() => printWindow.print(), 250);
      return;
    }

    const allReady = Array.from(qrImages).every((img) => (img as HTMLImageElement).complete);
    if (allReady || Date.now() - startedAt > 3000) {
      setTimeout(() => printWindow.print(), 100);
      return;
    }

    setTimeout(waitForAssetsAndPrint, 150);
  };

  setTimeout(waitForAssetsAndPrint, 150);
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

// Helper to generate correction-specific tables (BYŁO / JEST / RÓŻNICA)
const generateCorrectionTablesHtml = (
  cd: NonNullable<InvoiceData['correction_data']>,
  currency: string,
  cellPadding: string,
  cellFontSize: string
): string => {
  const thStyle = 'background-color: #7c3aed !important; color: #ffffff !important; padding: 4px 3px; font-size: 8px; font-weight: 600; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;';
  const tdStyle = (extra = '') => `border: 1px solid #ddd; padding: ${cellPadding}; font-size: ${cellFontSize}; ${extra}`;

  const makeRow = (item: InvoiceItem, idx: number) => `
    <tr>
      <td style="${tdStyle('text-align: center;')}">${idx + 1}</td>
      <td style="${tdStyle()}">${item.name}</td>
      <td style="${tdStyle('text-align: center;')}">${item.unit}</td>
      <td style="${tdStyle('text-align: right;')}">${item.quantity}</td>
      <td style="${tdStyle('text-align: right;')}">${formatCurrency(item.unit_net_price, currency)}</td>
      <td style="${tdStyle('text-align: right;')}">${formatCurrency(item.net_amount, currency)}</td>
      <td style="${tdStyle('text-align: center;')}">${item.vat_rate}%</td>
      <td style="${tdStyle('text-align: right;')}">${formatCurrency(item.vat_amount, currency)}</td>
      <td style="${tdStyle('text-align: right; font-weight: bold;')}">${formatCurrency(item.gross_amount, currency)}</td>
    </tr>`;

  const tableHead = `<thead><tr>
    <th style="width: 22px; ${thStyle}">Lp.</th>
    <th style="${thStyle}">Nazwa towaru / usługi</th>
    <th style="width: 32px; ${thStyle}">Jm.</th>
    <th style="width: 35px; ${thStyle}">Ilość</th>
    <th style="width: 60px; ${thStyle}">Cena netto</th>
    <th style="width: 65px; ${thStyle}">Wart. netto</th>
    <th style="width: 35px; ${thStyle}">VAT</th>
    <th style="width: 55px; ${thStyle}">Kwota VAT</th>
    <th style="width: 70px; ${thStyle}">Wart. brutto</th>
  </tr></thead>`;

  const totalsRow = (label: string, t: { net: number; vat: number; gross: number }, bg: string) => `
    <tr style="background: ${bg}; font-weight: 600;">
      <td colspan="5" style="${tdStyle('text-align: right;')}">${label}</td>
      <td style="${tdStyle('text-align: right;')}">${formatCurrency(t.net, currency)}</td>
      <td style="${tdStyle()}"></td>
      <td style="${tdStyle('text-align: right;')}">${formatCurrency(t.vat, currency)}</td>
      <td style="${tdStyle('text-align: right;')}">${formatCurrency(t.gross, currency)}</td>
    </tr>`;

  const byloHtml = `
    <div style="margin-bottom: 12px;">
      <div style="font-size: 10px; font-weight: 700; margin-bottom: 4px; color: #666; text-transform: uppercase; padding: 4px 8px; background: #f3f4f6; border-radius: 4px;">Przed korektą (BYŁO)</div>
      <table style="width: 100%; border-collapse: collapse;">${tableHead}<tbody>
        ${cd.before_items.map((item, i) => makeRow(item, i)).join('')}
        ${totalsRow('Razem BYŁO:', cd.before_totals, '#f3f4f6')}
      </tbody></table>
    </div>`;

  const jestHtml = `
    <div style="margin-bottom: 12px;">
      <div style="font-size: 10px; font-weight: 700; margin-bottom: 4px; color: #7c3aed; text-transform: uppercase; padding: 4px 8px; background: #ede9fe; border-radius: 4px;">Po korekcie (JEST)</div>
      <table style="width: 100%; border-collapse: collapse;">${tableHead}<tbody>
        ${cd.after_items.map((item, i) => makeRow(item, i)).join('')}
        ${totalsRow('Razem PO KOREKCIE:', cd.after_totals, '#ede9fe')}
      </tbody></table>
    </div>`;

  const diffItems = cd.after_items.map((after, i) => {
    const before = cd.before_items[i] || { net_amount: 0, vat_amount: 0, gross_amount: 0, name: after.name };
    return {
      name: after.name,
      net: after.net_amount - before.net_amount,
      vat: after.vat_amount - before.vat_amount,
      gross: after.gross_amount - before.gross_amount,
    };
  });

  const fmtDiff = (v: number) => {
    const sign = v > 0 ? '+' : '';
    const color = v < 0 ? '#dc2626' : v > 0 ? '#16a34a' : '#333';
    return `<span style="color: ${color}; font-weight: 600;">${sign}${formatCurrency(v, currency)}</span>`;
  };

  const roznicaHtml = `
    <div style="margin-bottom: 12px; border: 2px solid #7c3aed; border-radius: 6px; padding: 8px;">
      <div style="font-size: 10px; font-weight: 700; margin-bottom: 6px; color: #7c3aed; text-transform: uppercase;">Kwota korekty (RÓŻNICA)</div>
      <table style="width: 100%; border-collapse: collapse; font-size: 9px;">
        <thead><tr>
          <th style="text-align: left; padding: 3px 6px; border-bottom: 1px solid #ddd;">Nazwa</th>
          <th style="text-align: right; padding: 3px 6px; border-bottom: 1px solid #ddd;">Wart. netto</th>
          <th style="text-align: right; padding: 3px 6px; border-bottom: 1px solid #ddd;">Kwota VAT</th>
          <th style="text-align: right; padding: 3px 6px; border-bottom: 1px solid #ddd;">Wart. brutto</th>
        </tr></thead>
        <tbody>
          ${diffItems.map(d => `
            <tr>
              <td style="padding: 3px 6px;">${d.name}</td>
              <td style="padding: 3px 6px; text-align: right;">${fmtDiff(d.net)}</td>
              <td style="padding: 3px 6px; text-align: right;">${fmtDiff(d.vat)}</td>
              <td style="padding: 3px 6px; text-align: right;">${fmtDiff(d.gross)}</td>
            </tr>`).join('')}
          <tr style="border-top: 2px solid #7c3aed; font-weight: 700; font-size: 11px;">
            <td style="padding: 6px; color: #7c3aed;">RAZEM KOREKTA:</td>
            <td style="padding: 6px; text-align: right;">${fmtDiff(cd.diff_totals.net)}</td>
            <td style="padding: 6px; text-align: right;">${fmtDiff(cd.diff_totals.vat)}</td>
            <td style="padding: 6px; text-align: right;">${fmtDiff(cd.diff_totals.gross)}</td>
          </tr>
        </tbody>
      </table>
    </div>`;

  return byloHtml + jestHtml + roznicaHtml;
};

export const generateInvoiceHtml = (invoice: InvoiceData): string => {
  const { seller, buyer, items, currency = 'PLN', compact_pdf = false } = invoice;
  const hasAcceptedKsef = isOfficialKsefReference(invoice.ksef_reference);
  const verificationUrl = hasAcceptedKsef
    ? `https://efaktura.mf.gov.pl/web/verify?id=${encodeURIComponent(invoice.ksef_reference!)}`
    : '';
  
  const isCorrection = invoice.type === 'correction' && !!invoice.correction_data;
  const isAdvance = invoice.type === 'advance';
  const isFinal = invoice.type === 'final';
  const isSimplified = invoice.type === 'simplified';

  const displayItems = isCorrection ? invoice.correction_data!.after_items : items;
  
  const netTotal = displayItems.reduce((sum, item) => sum + item.net_amount, 0);
  const vatTotal = displayItems.reduce((sum, item) => sum + item.vat_amount, 0);
  const grossTotal = displayItems.reduce((sum, item) => sum + item.gross_amount, 0);
  
  // Group items by VAT rate for summary
  const vatSummary: Record<string, { net: number; vat: number; gross: number }> = {};
  displayItems.forEach(item => {
    const rate = item.vat_rate;
    if (!vatSummary[rate]) {
      vatSummary[rate] = { net: 0, vat: 0, gross: 0 };
    }
    vatSummary[rate].net += item.net_amount;
    vatSummary[rate].vat += item.vat_amount;
    vatSummary[rate].gross += item.gross_amount;
  });
  
  const cellPadding = compact_pdf ? '2px 4px' : '4px 6px';
  const cellFontSize = compact_pdf ? '8px' : '9px';
  
  const itemsHtml = displayItems.map((item, index) => `
    <tr>
      <td style="border: 1px solid #ddd; padding: ${cellPadding}; text-align: center; font-size: ${cellFontSize};">${index + 1}</td>
      <td style="border: 1px solid #ddd; padding: ${cellPadding}; font-size: ${cellFontSize};">${item.name}${item.pkwiu ? ` <small>(${item.pkwiu})</small>` : ''}</td>
      <td style="border: 1px solid #ddd; padding: ${cellPadding}; text-align: center; font-size: ${cellFontSize};">${item.unit}</td>
      <td style="border: 1px solid #ddd; padding: ${cellPadding}; text-align: right; font-size: ${cellFontSize};">${item.quantity}</td>
      <td style="border: 1px solid #ddd; padding: ${cellPadding}; text-align: right; font-size: ${cellFontSize};">${formatCurrency(item.unit_net_price, currency)}</td>
      <td style="border: 1px solid #ddd; padding: ${cellPadding}; text-align: right; font-size: ${cellFontSize};">${formatCurrency(item.net_amount, currency)}</td>
      <td style="border: 1px solid #ddd; padding: ${cellPadding}; text-align: center; font-size: ${cellFontSize};">${item.vat_rate}%</td>
      <td style="border: 1px solid #ddd; padding: ${cellPadding}; text-align: right; font-size: ${cellFontSize};">${formatCurrency(item.vat_amount, currency)}</td>
      <td style="border: 1px solid #ddd; padding: ${cellPadding}; text-align: right; font-weight: bold; font-size: ${cellFontSize};">${formatCurrency(item.gross_amount, currency)}</td>
    </tr>
  `).join('');

  // VAT summary rows - table format with fixed column widths
  const vatSummaryHtml = Object.entries(vatSummary).map(([rate, amounts]) => `
    <tr>
      <td style="width: 25%; padding: 4px 8px; text-align: right; font-weight: 600;">${rate}%</td>
      <td style="width: 25%; padding: 4px 8px; text-align: right;">${formatCurrency(amounts.net, currency)}</td>
      <td style="width: 25%; padding: 4px 8px; text-align: right;">${formatCurrency(amounts.vat, currency)}</td>
      <td style="width: 25%; padding: 4px 8px; text-align: right; font-weight: 600;">${formatCurrency(amounts.gross, currency)}</td>
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
    final: 'Faktura VAT (Rozliczenie)',
    simplified: 'Faktura uproszczona',
    kp: 'KP - Kasa Przyjmie',
    kw: 'KW - Kasa Wyda',
    wz: 'WZ - Wydanie Zewnętrzne',
    pz: 'PZ - Przyjęcie Zewnętrzne',
    nota: 'Nota księgowa'
  };

  const safeFileName = `${invoice.invoice_number.replace(/\//g, '_')}_${invoice.buyer.name.replace(/[^a-zA-Z0-9ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/g, '_').substring(0, 30)}`;
  
  const baseFontSize = compact_pdf ? '8px' : '9px';
  const titleFontSize = compact_pdf ? '12px' : '14px';
  const pageMargin = compact_pdf ? '6mm' : '8mm';

  return `
<!DOCTYPE html>
<html lang="pl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${safeFileName}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; }
    @page { margin: ${pageMargin}; size: A4; }
    @media print {
      html, body { height: 100%; margin: 0 !important; padding: 0 !important; }
      .invoice { max-width: 100%; page-break-inside: avoid; }
      * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; }
      th { background: #7c3aed !important; background-color: #7c3aed !important; color: white !important; }
      .totals-row.grand { background: #7c3aed !important; background-color: #7c3aed !important; color: white !important; }
      .vat-header { background: #7c3aed !important; background-color: #7c3aed !important; color: white !important; }
    }
    body { 
      font-family: Arial, sans-serif; 
      font-size: ${baseFontSize}; 
      line-height: 1.3; 
      color: #333; 
      padding: 8px;
      background: white;
    }
    .invoice { max-width: 800px; margin: 0 auto; background: white; }
    .top-meta { display: flex; justify-content: flex-end; font-size: 8px; color: #666; margin-bottom: 4px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px; padding-bottom: 6px; border-bottom: 2px solid #7c3aed; }
    .logo-area { min-width: 100px; }
    .logo-area img { max-width: 100px; max-height: 30px; object-fit: contain; }
    .invoice-title { text-align: right; }
    .invoice-title h1 { font-size: ${titleFontSize}; color: #333; margin-bottom: 1px; }
    .invoice-title h1 .invoice-number { color: #7c3aed; }
    .invoice-dates { font-size: 8px; color: #555; text-align: right; margin-top: 4px; }
    .invoice-dates-row { margin-bottom: 2px; }
    .invoice-dates-label { color: #888; }
    .parties { display: flex; gap: 16px; margin-bottom: 8px; }
    .party { flex: 1; }
    .party-label { font-size: 8px; color: #666; text-transform: uppercase; margin-bottom: 2px; font-weight: 600; }
    .party-name { font-size: 10px; font-weight: bold; margin-bottom: 1px; }
    .party-details { font-size: 8px; color: #555; line-height: 1.3; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
    th { background: #7c3aed !important; background-color: #7c3aed !important; color: white !important; padding: 4px 3px; text-align: left; font-size: 8px; font-weight: 600; white-space: nowrap; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    th:first-child { border-radius: 3px 0 0 0; }
    th:last-child { border-radius: 0 3px 0 0; }
    .vat-summary { margin-bottom: 8px; font-size: 8px; }
    .vat-header { background: #7c3aed !important; background-color: #7c3aed !important; color: white !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    .totals { display: flex; justify-content: flex-end; margin-bottom: 6px; }
    .totals-table { width: 180px; }
    .totals-row { display: flex; justify-content: space-between; padding: 3px 0; border-bottom: 1px solid #eee; font-size: 9px; }
    .totals-row.grand { border-bottom: none; background: #7c3aed !important; background-color: #7c3aed !important; color: white !important; padding: 5px 6px; border-radius: 3px; font-size: 11px; margin-top: 2px; font-weight: bold; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    .amount-words { display: flex; gap: 4px; margin-bottom: 6px; padding: 5px 8px; background: #f0f9ff; border-left: 2px solid #7c3aed; border-radius: 2px; font-size: 8px; }
    .amount-words-label { color: #666; font-weight: 600; white-space: nowrap; }
    .amount-words-value { font-style: italic; }
    .payment { margin-bottom: 6px; font-size: 8px; }
    .payment-row { display: flex; gap: 12px; margin-bottom: 2px; }
    .payment-label { color: #666; min-width: 80px; }
    .payment-value { font-weight: 500; }
    .notes { margin-bottom: 8px; padding: 6px; background: #fef3c7; border-radius: 4px; font-size: 8px; }
    .notes-label { font-size: 7px; color: #92400e; text-transform: uppercase; margin-bottom: 2px; font-weight: 600; }
    .footer { display: flex; justify-content: space-between; margin-top: 16px; padding-top: 8px; }
    .signature { width: 160px; text-align: center; }
    .signature-line { border-top: 1px solid #333; margin-top: 30px; padding-top: 4px; font-size: 7px; color: #666; }
     .draft-watermark {
       position: fixed;
       inset: 0;
       display: flex;
       align-items: center;
       justify-content: center;
       font-size: 52px;
       font-weight: 700;
       letter-spacing: 6px;
       color: rgba(124, 58, 237, 0.12);
       transform: rotate(-28deg);
       pointer-events: none;
       z-index: 0;
     }
     .content-layer { position: relative; z-index: 1; }
     .ksef-box {
       margin-top: 20px;
       padding: 12px;
       border: 1px solid #e5e7eb;
       border-radius: 8px;
       display: flex;
       align-items: center;
       gap: 12px;
       background: #f8fafc;
     }
     .ksef-box-title { font-weight: 700; margin-bottom: 4px; color: #15803d; }
     .ksef-box-line { margin-top: 2px; }
  </style>
</head>
<body>
  ${!hasAcceptedKsef ? '<div class="draft-watermark">KOPIA ROBOCZA</div>' : ''}
  <div class="invoice content-layer">
    <div class="top-meta">
      ${invoice.issue_place ? `${invoice.issue_place}, ` : ''}${formatDate(invoice.issue_date)}
    </div>

    <div class="header">
      <div class="logo-area">
        ${seller.logo_url ? `<img src="${seller.logo_url}" alt="Logo" />` : ''}
      </div>
      <div class="invoice-title">
        <h1 style="color: #333;">${typeLabels[invoice.type] || 'Faktura VAT'}<br><span style="color: #7c3aed;">${invoice.invoice_number}</span></h1>
        ${isCorrection && invoice.correction_data ? `
        <div style="font-size: 9px; color: #555; margin-top: 4px;">
          <div>do faktury nr: <strong>${invoice.correction_data.original_invoice_number}</strong></div>
          <div>z dnia: ${formatDate(invoice.correction_data.original_invoice_date)}</div>
          <div>Powód korekty: ${invoice.correction_data.correction_reason}</div>
        </div>
        ` : ''}
        ${isAdvance ? `
        <div style="font-size: 9px; color: #555; margin-top: 4px;">
          <div>Data otrzymania zaliczki: ${formatDate(invoice.sale_date)}</div>
        </div>
        ` : ''}
        ${isFinal && invoice.advance_data?.advance_invoice_number ? `
        <div style="font-size: 9px; color: #555; margin-top: 4px;">
          <div>Faktura rozliczająca zaliczkę</div>
        </div>
        ` : ''}
        <div class="invoice-dates">
          ${!isAdvance ? `<div class="invoice-dates-row"><span class="invoice-dates-label">Data sprzedaży:</span> ${formatDate(invoice.sale_date)}</div>` : ''}
          <div class="invoice-dates-row"><span class="invoice-dates-label">Termin płatności:</span> ${formatDate(invoice.due_date)}</div>
        </div>
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

    ${isCorrection && invoice.correction_data ? generateCorrectionTablesHtml(invoice.correction_data, currency, cellPadding, cellFontSize) : `
    <table>
      <thead>
        <tr>
          <th style="width: 22px; background-color: #7c3aed !important; color: #ffffff !important;">Lp.</th>
          <th style="background-color: #7c3aed !important; color: #ffffff !important;">Nazwa towaru / usługi</th>
          <th style="width: 32px; background-color: #7c3aed !important; color: #ffffff !important;">Jm.</th>
          <th style="width: 35px; background-color: #7c3aed !important; color: #ffffff !important;">Ilość</th>
          <th style="width: 60px; background-color: #7c3aed !important; color: #ffffff !important;">Cena netto</th>
          <th style="width: 65px; background-color: #7c3aed !important; color: #ffffff !important;">Wart. netto</th>
          <th style="width: 35px; background-color: #7c3aed !important; color: #ffffff !important;">VAT</th>
          <th style="width: 55px; background-color: #7c3aed !important; color: #ffffff !important;">Kwota VAT</th>
          <th style="width: 70px; background-color: #7c3aed !important; color: #ffffff !important;">Wart. brutto</th>
        </tr>
      </thead>
      <tbody>
        ${itemsHtml}
      </tbody>
    </table>
    `}

    <div class="vat-summary" style="margin-top: 8px; font-size: 8px;">
      <div style="font-size: 9px; font-weight: 600; margin-bottom: 4px; color: #666;">Podsumowanie faktury</div>
      <table style="width: 60%; max-width: 350px; border-collapse: collapse; table-layout: fixed; font-size: 8px;">
        <thead>
          <tr class="vat-header" style="background-color: #7c3aed !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;">
            <th style="width: 25%; padding: 4px 6px; text-align: right; font-weight: 600; color: #ffffff !important; background-color: #7c3aed !important;">Stawka</th>
            <th style="width: 25%; padding: 4px 6px; text-align: right; font-weight: 600; color: #ffffff !important; background-color: #7c3aed !important;">Netto</th>
            <th style="width: 25%; padding: 4px 6px; text-align: right; font-weight: 600; color: #ffffff !important; background-color: #7c3aed !important;">VAT</th>
            <th style="width: 25%; padding: 4px 6px; text-align: right; font-weight: 600; color: #ffffff !important; background-color: #7c3aed !important;">Brutto</th>
          </tr>
        </thead>
        <tbody>
          ${Object.entries(vatSummary).map(([rate, amounts]) => `
            <tr style="background-color: #f8f5ff;">
              <td style="width: 25%; padding: 3px 6px; text-align: right; color: #333; font-weight: 600;">${rate}%</td>
              <td style="width: 25%; padding: 3px 6px; text-align: right; color: #333;">${formatCurrency(amounts.net, currency)}</td>
              <td style="width: 25%; padding: 3px 6px; text-align: right; color: #333;">${formatCurrency(amounts.vat, currency)}</td>
              <td style="width: 25%; padding: 3px 6px; text-align: right; color: #333; font-weight: 600;">${formatCurrency(amounts.gross, currency)}</td>
            </tr>
          `).join('')}
          <tr style="border-top: 2px solid #7c3aed; background-color: #ede9fe;">
            <td style="width: 25%; padding: 4px 6px; text-align: right; font-weight: 700; color: #7c3aed;">Razem:</td>
            <td style="width: 25%; padding: 4px 6px; text-align: right; font-weight: 700; color: #333;">${formatCurrency(netTotal, currency)}</td>
            <td style="width: 25%; padding: 4px 6px; text-align: right; font-weight: 700; color: #333;">${formatCurrency(vatTotal, currency)}</td>
            <td style="width: 25%; padding: 4px 6px; text-align: right; font-weight: 700; color: #7c3aed;">${formatCurrency(grossTotal, currency)}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="totals">
      <div class="totals-table">
        <div class="totals-row">
          <span>Razem netto:</span>
          <span style="font-weight: bold;">${formatCurrency(netTotal, currency)}</span>
        </div>
        <div class="totals-row">
          <span>VAT:</span>
          <span style="font-weight: bold;">${formatCurrency(vatTotal, currency)}</span>
        </div>
        <div class="totals-row grand" style="background-color: #7c3aed !important; color: #ffffff !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;">
          <span style="color: #ffffff !important; font-weight: bold;">DO ZAPŁATY:</span>
          <span style="font-weight: bold; font-size: 13px; color: #ffffff !important;">${formatCurrency(grossTotal, currency)}</span>
        </div>
        ${(invoice.paid_amount && invoice.paid_amount > 0) ? `
        <div class="totals-row" style="margin-top: 6px; border-top: 1px solid #ddd; padding-top: 6px;">
          <span>Zapłacono:</span>
          <span style="font-weight: bold; color: #16a34a;">${formatCurrency(invoice.paid_amount, currency)}</span>
        </div>
        <div class="totals-row" style="background: #fef3c7; padding: 4px 6px; border-radius: 3px;">
          <span style="font-weight: bold;">Pozostało:</span>
          <span style="font-weight: bold; color: #dc2626;">${formatCurrency(grossTotal - invoice.paid_amount, currency)}</span>
        </div>
        ` : ''}
      </div>
    </div>

    <div class="amount-words">
      <span class="amount-words-label">Słownie:</span>
      <span class="amount-words-value">${numberToWords(grossTotal)}</span>
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
        <span class="payment-label">IBAN:</span>
        <span class="payment-value">${seller.bank_account}</span>
      </div>
      ${seller.swift_code ? `
      <div class="payment-row">
        <span class="payment-label">SWIFT/BIC:</span>
        <span class="payment-value">${seller.swift_code}</span>
      </div>
      ` : ''}
      ` : ''}
    </div>

    ${invoice.notes ? `
    <div class="notes">
      <div class="notes-label">Uwagi</div>
      <div>${invoice.notes}</div>
    </div>
    ` : ''}

    ${hasAcceptedKsef ? `
    <div class="ksef-box">
      <img class="ksef-qr" src="https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${encodeURIComponent(verificationUrl)}" alt="Kod QR KSeF" style="width: 80px; height: 80px;" />
      <div style="font-size: 10px; color: #6b7280;">
        <div class="ksef-box-title">Faktura w KSeF</div>
        <div class="ksef-box-line"><strong>Numer KSeF:</strong> ${invoice.ksef_reference}</div>
        ${invoice.ksef_acceptance_date ? `<div class="ksef-box-line"><strong>Data przyjęcia:</strong> ${formatDate(invoice.ksef_acceptance_date)}</div>` : ''}
        <div class="ksef-box-line"><strong>Weryfikacja:</strong> <a href="${verificationUrl}" style="color: #7c3aed;">efaktura.mf.gov.pl</a></div>
      </div>
    </div>
    ` : ''}

    <div class="footer">
      <div class="signature">
        <div class="signature-line">Podpis osoby upoważnionej<br>do odbioru faktury</div>
      </div>
      <div class="signature">
        <div class="signature-line">Podpis osoby upoważnionej<br>do wystawienia faktury${invoice.issued_by ? `<br><strong>${invoice.issued_by}</strong>` : ''}</div>
      </div>
    </div>
  </div>
</body>
</html>
  `;
};

export const printInvoice = (invoice: InvoiceData): void => {
  const html = generateInvoiceHtml(invoice);
  printHtmlDocument(html);
};
