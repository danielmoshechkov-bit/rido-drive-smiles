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
  // Margin invoice data
  is_margin?: boolean;
  margin_purchase_price?: number;
  margin_procedure_type?: 'used_goods' | 'tourism' | 'art' | 'antiques';
  // VAT RR (farmer invoice) data
  vat_rr_data?: {
    farmer_pesel?: string;
    farmer_id_number?: string;
    flat_rate_percent: number; // typically 7%
    declaration_text?: string;
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

// Helper to generate correction-specific tables (BYŁO / JEST / RÓŻNICA) — matching GetRido branded style
const generateCorrectionTablesHtml = (
  cd: NonNullable<InvoiceData['correction_data']>,
  currency: string,
  _cellPadding: string,
  _cellFontSize: string
): string => {
  const fmt = (v: number) => formatCurrency(v, currency);
  const fmtDiff = (v: number) => {
    const sign = v > 0 ? '+' : '';
    const color = v < 0 ? '#A32D2D' : v > 0 ? '#16a34a' : '#333';
    return `<span style="color: ${color}; font-weight: 500;">${sign}${fmt(v)}</span>`;
  };

  const thBefore = 'text-align: right; padding: 6px 8px; font-weight: 500; color: #666; border-bottom: 0.5px solid #ddd;';
  const thAfter = 'text-align: right; padding: 6px 8px; font-weight: 500; color: #7c3aed; border-bottom: 0.5px solid #CECBF6;';
  const thDiff = 'text-align: right; padding: 6px 8px; font-weight: 500; color: #854F0B; border-bottom: 0.5px solid #FAC775;';
  const thNameBefore = 'text-align: left; padding: 6px 8px; font-weight: 500; color: #666; border-bottom: 0.5px solid #ddd;';
  const thNameAfter = 'text-align: left; padding: 6px 8px; font-weight: 500; color: #7c3aed; border-bottom: 0.5px solid #CECBF6;';
  const thNameDiff = 'text-align: left; padding: 6px 8px; font-weight: 500; color: #854F0B; border-bottom: 0.5px solid #FAC775;';

  const makeRow = (item: InvoiceItem, style: string = '') => `
    <tr>
      <td style="padding: 6px 8px; ${style}">${item.name}</td>
      <td style="text-align: right; padding: 6px 8px; ${style}">${item.quantity}</td>
      <td style="text-align: right; padding: 6px 8px; ${style}">${fmt(item.unit_net_price)}</td>
      <td style="text-align: right; padding: 6px 8px; ${style}">${fmt(item.net_amount)}</td>
      <td style="text-align: right; padding: 6px 8px; ${style}">${item.vat_rate}%</td>
      <td style="text-align: right; padding: 6px 8px; ${style}">${fmt(item.vat_amount)}</td>
      <td style="text-align: right; padding: 6px 8px; ${style}">${fmt(item.gross_amount)}</td>
    </tr>`;

  // PRZED KOREKTĄ
  const byloHtml = `
    <div style="padding: 16px 28px 0;">
      <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 10px;">
        <div style="width: 3px; height: 16px; background: #B4B2A9; border-radius: 2px;"></div>
        <div style="font-size: 11px; font-weight: 500; color: #666; text-transform: uppercase; letter-spacing: 0.06em;">Przed korektą</div>
      </div>
      <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
        <thead><tr style="background: #f5f5f4;">
          <th style="${thNameBefore}">Nazwa towaru/usługi</th>
          <th style="${thBefore}">Ilość</th>
          <th style="${thBefore}">Cena netto</th>
          <th style="${thBefore}">Wartość netto</th>
          <th style="${thBefore}">VAT%</th>
          <th style="${thBefore}">Kwota VAT</th>
          <th style="${thBefore}">Brutto</th>
        </tr></thead>
        <tbody>${cd.before_items.map(item => makeRow(item, 'color: #666;')).join('')}</tbody>
      </table>
    </div>`;

  // PO KOREKCIE
  const jestHtml = `
    <div style="padding: 16px 28px 0;">
      <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 10px;">
        <div style="width: 3px; height: 16px; background: #7c3aed; border-radius: 2px;"></div>
        <div style="font-size: 11px; font-weight: 500; color: #7c3aed; text-transform: uppercase; letter-spacing: 0.06em;">Po korekcie</div>
      </div>
      <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
        <thead><tr style="background: #EEEDFE;">
          <th style="${thNameAfter}">Nazwa towaru/usługi</th>
          <th style="${thAfter}">Ilość</th>
          <th style="${thAfter}">Cena netto</th>
          <th style="${thAfter}">Wartość netto</th>
          <th style="${thAfter}">VAT%</th>
          <th style="${thAfter}">Kwota VAT</th>
          <th style="${thAfter}">Brutto</th>
        </tr></thead>
        <tbody>${cd.after_items.map(item => makeRow(item)).join('')}</tbody>
      </table>
    </div>`;

  // RÓŻNICA
  const diffItems = cd.after_items.map((after, i) => {
    const before = cd.before_items[i] || { name: after.name, quantity: 0, unit_net_price: 0, net_amount: 0, vat_amount: 0, gross_amount: 0 };
    return {
      name: after.name,
      qty: after.quantity - before.quantity,
      price: after.unit_net_price - before.unit_net_price,
      net: after.net_amount - before.net_amount,
      vat: after.vat_amount - before.vat_amount,
      gross: after.gross_amount - before.gross_amount,
    };
  });

  const roznicaHtml = `
    <div style="padding: 16px 28px;">
      <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 10px;">
        <div style="width: 3px; height: 16px; background: #BA7517; border-radius: 2px;"></div>
        <div style="font-size: 11px; font-weight: 500; color: #BA7517; text-transform: uppercase; letter-spacing: 0.06em;">Różnica (kwota korekty)</div>
      </div>
      <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
        <thead><tr style="background: #FAEEDA;">
          <th style="${thNameDiff}">Nazwa towaru/usługi</th>
          <th style="${thDiff}">Ilość</th>
          <th style="${thDiff}">Cena netto</th>
          <th style="${thDiff}">Wartość netto</th>
          <th style="${thDiff}">VAT%</th>
          <th style="${thDiff}">Kwota VAT</th>
          <th style="${thDiff}">Brutto</th>
        </tr></thead>
        <tbody>${diffItems.map(d => `
          <tr>
            <td style="padding: 6px 8px; font-weight: 500;">${d.name}</td>
            <td style="text-align: right; padding: 6px 8px;">${d.qty}</td>
            <td style="text-align: right; padding: 6px 8px;">${fmtDiff(d.price)}</td>
            <td style="text-align: right; padding: 6px 8px;">${fmtDiff(d.net)}</td>
            <td style="text-align: right; padding: 6px 8px;">${cd.after_items[0]?.vat_rate || '23'}%</td>
            <td style="text-align: right; padding: 6px 8px;">${fmtDiff(d.vat)}</td>
            <td style="text-align: right; padding: 6px 8px; color: ${d.gross < 0 ? '#A32D2D' : '#16a34a'}; font-weight: 500;">${fmtDiff(d.gross)}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`;

  // PODSUMOWANIE KOREKTY
  const summaryLabel = cd.diff_totals.gross < 0 ? 'Do zwrotu nabywcy' : 'Do dopłaty';
  const summaryColor = cd.diff_totals.gross < 0 ? '#A32D2D' : '#16a34a';
  const summaryBg = cd.diff_totals.gross < 0 ? '#FCEBEB' : '#ECFDF5';
  const summaryBorder = cd.diff_totals.gross < 0 ? '#F7C1C1' : '#A7F3D0';

  const summaryHtml = `
    <div style="border-top: 0.5px solid #ddd; padding: 16px 28px; display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
      <div style="background: #f5f5f4; border-radius: 6px; padding: 12px 16px;">
        <div style="font-size: 11px; font-weight: 500; color: #666; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 10px;">Podsumowanie korekty</div>
        <table style="width: 100%; font-size: 12px; border-collapse: collapse;">
          <tr><td style="padding: 3px 0; color: #666;">Netto przed korektą:</td><td style="text-align: right; padding: 3px 0; color: #666;">${fmt(cd.before_totals.net)}</td></tr>
          <tr><td style="padding: 3px 0; color: #666;">Netto po korekcie:</td><td style="text-align: right; padding: 3px 0; color: #666;">${fmt(cd.after_totals.net)}</td></tr>
          <tr style="border-top: 0.5px solid #ddd;"><td style="padding: 4px 0 3px; font-weight: 500;">Różnica netto:</td><td style="text-align: right; padding: 4px 0 3px; font-weight: 500; color: ${summaryColor};">${fmtDiff(cd.diff_totals.net)}</td></tr>
          <tr><td style="padding: 3px 0; color: #666;">VAT przed korektą:</td><td style="text-align: right; padding: 3px 0; color: #666;">${fmt(cd.before_totals.vat)}</td></tr>
          <tr><td style="padding: 3px 0; color: #666;">VAT po korekcie:</td><td style="text-align: right; padding: 3px 0; color: #666;">${fmt(cd.after_totals.vat)}</td></tr>
          <tr style="border-top: 0.5px solid #ddd;"><td style="padding: 4px 0 3px; font-weight: 500;">Różnica VAT:</td><td style="text-align: right; padding: 4px 0 3px; font-weight: 500; color: ${summaryColor};">${fmtDiff(cd.diff_totals.vat)}</td></tr>
        </table>
      </div>
      <div style="display: flex; flex-direction: column; gap: 8px;">
        <div style="background: ${summaryBg}; border: 0.5px solid ${summaryBorder}; border-radius: 6px; padding: 12px 16px; flex: 1;">
          <div style="font-size: 11px; font-weight: 500; color: ${summaryColor}; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 4px;">${summaryLabel}</div>
          <div style="font-size: 24px; font-weight: 500; color: ${summaryColor};">${fmtDiff(cd.diff_totals.gross)}</div>
          <div style="font-size: 11px; color: ${summaryColor}; opacity: 0.8; margin-top: 2px;">${cd.diff_totals.gross < 0 ? 'Zmniejszenie należności' : 'Zwiększenie należności'}</div>
        </div>
      </div>
    </div>`;

  return byloHtml + jestHtml + roznicaHtml + summaryHtml;
};

export const generateInvoiceHtml = (invoice: InvoiceData): string => {
  const { seller, buyer, items, currency = 'PLN', compact_pdf = false } = invoice;
  const hasAcceptedKsef = isOfficialKsefReference(invoice.ksef_reference);
  const verificationUrl = hasAcceptedKsef
    ? `https://efaktura.mf.gov.pl/web/verify?id=${encodeURIComponent(invoice.ksef_reference!)}`
    : '';
  
  const isCorrection = ['correction', 'KOR', 'KOR_ZAL', 'KOR_ROZ'].includes(invoice.type) && !!invoice.correction_data;
  const isAdvance = ['advance', 'ZAL'].includes(invoice.type);
  const isMargin = invoice.is_margin === true || ['margin', 'vat_margin'].includes(invoice.type);
  const isSimplified = ['simplified', 'UPR'].includes(invoice.type);
  const isFinal = ['final', 'ROZ'].includes(invoice.type);
  const isReceipt = invoice.type === 'receipt';
  const isNota = invoice.type === 'nota';
  const isVatRR = invoice.type === 'vat_rr';
  const isProforma = invoice.type === 'proforma';
  
  // Documents without VAT columns
  const noVatDocument = isReceipt || isNota || isMargin;

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

  // Determine theme colors based on invoice type
  let themeColor = '#7c3aed'; // default purple
  let themeColorLight = '#f8f5ff';
  let themeColorBorder = '#ede9fe';
  let invoiceTitle = 'Faktura VAT';
  let footerNote = '';

  if (isReceipt) {
    themeColor = '#2563eb';
    themeColorLight = '#eff6ff';
    themeColorBorder = '#bfdbfe';
    invoiceTitle = 'RACHUNEK';
    footerNote = '';
  } else if (isNota) {
    themeColor = '#64748b';
    themeColorLight = '#f1f5f9';
    themeColorBorder = '#cbd5e1';
    invoiceTitle = 'NOTA KSIĘGOWA';
    footerNote = '';
  } else if (isVatRR) {
    themeColor = '#15803d';
    themeColorLight = '#f0fdf4';
    themeColorBorder = '#bbf7d0';
    invoiceTitle = 'FAKTURA VAT RR';
    const rrRate = invoice.vat_rr_data?.flat_rate_percent || 7;
    footerNote = `Faktura VAT RR wystawiona na podstawie art. 116 ustawy z dnia 11 marca 2004 r. o podatku od towarów i usług. Zryczałtowany zwrot VAT: ${rrRate}%.`;
  } else if (isProforma) {
    themeColor = '#7c3aed';
    themeColorLight = '#f8f5ff';
    themeColorBorder = '#ede9fe';
    invoiceTitle = 'FAKTURA PROFORMA';
    footerNote = 'Dokument nie jest fakturą VAT w rozumieniu ustawy o podatku od towarów i usług. Nie stanowi podstawy do odliczenia VAT.';
  } else if (isAdvance) {
    themeColor = '#1D9E75';
    themeColorLight = '#E1F5EE';
    themeColorBorder = '#9FE1CB';
    invoiceTitle = 'FAKTURA ZALICZKOWA';
    footerNote = 'Faktura zaliczkowa wystawiona zgodnie z art. 106b ust. 1 pkt 4 ustawy z dnia 11 marca 2004 r. o podatku od towarów i usług.';
  } else if (isMargin) {
    themeColor = '#BA7517';
    themeColorLight = '#FAEEDA';
    themeColorBorder = '#FAC775';
    invoiceTitle = 'FAKTURA VAT MARŻA';
    const procedureLabels: Record<string, string> = {
      'used_goods': 'towarów używanych — art. 120 ust. 4',
      'tourism': 'usług turystycznych — art. 119',
      'art': 'dzieł sztuki — art. 120 ust. 4',
      'antiques': 'przedmiotów kolekcjonerskich i antyków — art. 120 ust. 4',
    };
    const procLabel = procedureLabels[invoice.margin_procedure_type || 'used_goods'] || 'towarów używanych — art. 120 ust. 4';
    footerNote = `Procedura marży dla ${procLabel} ustawy z dnia 11 marca 2004 r. o podatku od towarów i usług. Podatek VAT nie jest wykazywany na fakturze.`;
  } else if (isSimplified) {
    themeColor = '#444441';
    themeColorLight = '#f5f5f4';
    themeColorBorder = '#d4d4d4';
    invoiceTitle = 'FAKTURA UPROSZCZONA';
    footerNote = 'Faktura uproszczona wystawiona zgodnie z art. 106e ust. 5 pkt 3 ustawy z dnia 11 marca 2004 r. o podatku od towarów i usług.';
  } else if (isCorrection) {
    invoiceTitle = 'FAKTURA KORYGUJĄCA';
  } else if (isFinal) {
    invoiceTitle = 'FAKTURA VAT (ROZLICZENIE ZALICZKI)';
  }
  
  const cellPadding = compact_pdf ? '2px 4px' : '4px 6px';
  const cellFontSize = compact_pdf ? '8px' : '9px';
  
  // Standard items HTML (VAT columns)
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

  // Simple items HTML (no VAT columns) — for rachunek, nota
  const simpleItemsHtml = displayItems.map((item, index) => `
    <tr>
      <td style="border: 1px solid #ddd; padding: ${cellPadding}; text-align: center; font-size: ${cellFontSize};">${index + 1}</td>
      <td style="border: 1px solid #ddd; padding: ${cellPadding}; font-size: ${cellFontSize};">${item.name}</td>
      <td style="border: 1px solid #ddd; padding: ${cellPadding}; text-align: center; font-size: ${cellFontSize};">${item.unit}</td>
      <td style="border: 1px solid #ddd; padding: ${cellPadding}; text-align: right; font-size: ${cellFontSize};">${item.quantity}</td>
      <td style="border: 1px solid #ddd; padding: ${cellPadding}; text-align: right; font-size: ${cellFontSize};">${formatCurrency(item.unit_net_price, currency)}</td>
      <td style="border: 1px solid #ddd; padding: ${cellPadding}; text-align: right; font-weight: bold; font-size: ${cellFontSize};">${formatCurrency(item.net_amount, currency)}</td>
    </tr>
  `).join('');

  // VAT RR items HTML — with flat-rate VAT
  const rrRate = invoice.vat_rr_data?.flat_rate_percent || 7;
  const vatRRItemsHtml = displayItems.map((item, index) => {
    const rrVat = Math.round(item.net_amount * (rrRate / 100) * 100) / 100;
    const rrGross = Math.round((item.net_amount + rrVat) * 100) / 100;
    return `
    <tr>
      <td style="border: 1px solid #ddd; padding: ${cellPadding}; text-align: center; font-size: ${cellFontSize};">${index + 1}</td>
      <td style="border: 1px solid #ddd; padding: ${cellPadding}; font-size: ${cellFontSize};">${item.name}</td>
      <td style="border: 1px solid #ddd; padding: ${cellPadding}; text-align: center; font-size: ${cellFontSize};">${item.unit}</td>
      <td style="border: 1px solid #ddd; padding: ${cellPadding}; text-align: right; font-size: ${cellFontSize};">${item.quantity}</td>
      <td style="border: 1px solid #ddd; padding: ${cellPadding}; text-align: right; font-size: ${cellFontSize};">${formatCurrency(item.unit_net_price, currency)}</td>
      <td style="border: 1px solid #ddd; padding: ${cellPadding}; text-align: right; font-size: ${cellFontSize};">${formatCurrency(item.net_amount, currency)}</td>
      <td style="border: 1px solid #ddd; padding: ${cellPadding}; text-align: center; font-size: ${cellFontSize};">${rrRate}%</td>
      <td style="border: 1px solid #ddd; padding: ${cellPadding}; text-align: right; font-size: ${cellFontSize};">${formatCurrency(rrVat, currency)}</td>
      <td style="border: 1px solid #ddd; padding: ${cellPadding}; text-align: right; font-weight: bold; font-size: ${cellFontSize};">${formatCurrency(rrGross, currency)}</td>
    </tr>`;
  }).join('');

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
    VAT: 'Faktura VAT',
    proforma: 'Faktura Proforma',
    receipt: 'Rachunek',
    vat_margin: 'Faktura VAT marża',
    margin: 'Faktura VAT marża',
    vat_rr: 'Faktura VAT RR',
    correction: 'Faktura korygująca',
    KOR: 'Faktura korygująca',
    KOR_ZAL: 'Korekta faktury zaliczkowej',
    KOR_ROZ: 'Korekta faktury rozliczającej',
    advance: 'Faktura zaliczkowa',
    ZAL: 'Faktura zaliczkowa',
    final: 'Faktura VAT (Rozliczenie)',
    ROZ: 'Faktura rozliczająca',
    simplified: 'Faktura uproszczona',
    UPR: 'Faktura uproszczona',
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
      th { background: ${themeColor} !important; background-color: ${themeColor} !important; color: white !important; }
      .totals-row.grand { background: ${themeColor} !important; background-color: ${themeColor} !important; color: white !important; }
      .vat-header { background: ${themeColor} !important; background-color: ${themeColor} !important; color: white !important; }
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
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px; padding-bottom: 6px; border-bottom: 2px solid ${themeColor}; }
    .logo-area { min-width: 100px; }
    .logo-area img { max-width: 100px; max-height: 30px; object-fit: contain; }
    .invoice-title { text-align: right; }
    .invoice-title h1 { font-size: ${titleFontSize}; color: #333; margin-bottom: 1px; }
    .invoice-title h1 .invoice-number { color: ${themeColor}; }
    .invoice-dates { font-size: 8px; color: #555; text-align: right; margin-top: 4px; }
    .invoice-dates-row { margin-bottom: 2px; }
    .invoice-dates-label { color: #888; }
    .parties { display: flex; gap: 16px; margin-bottom: 8px; }
    .party { flex: 1; }
    .party-label { font-size: 8px; color: #666; text-transform: uppercase; margin-bottom: 2px; font-weight: 600; }
    .party-name { font-size: 10px; font-weight: bold; margin-bottom: 1px; }
    .party-details { font-size: 8px; color: #555; line-height: 1.3; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
    th { background: ${themeColor} !important; background-color: ${themeColor} !important; color: white !important; padding: 4px 3px; text-align: left; font-size: 8px; font-weight: 600; white-space: nowrap; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    th:first-child { border-radius: 3px 0 0 0; }
    th:last-child { border-radius: 0 3px 0 0; }
    .vat-summary { margin-bottom: 8px; font-size: 8px; }
    .vat-header { background: ${themeColor} !important; background-color: ${themeColor} !important; color: white !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    .totals { display: flex; justify-content: flex-end; margin-bottom: 6px; }
    .totals-table { width: 180px; }
    .totals-row { display: flex; justify-content: space-between; padding: 3px 0; border-bottom: 1px solid #eee; font-size: 9px; }
    .totals-row.grand { border-bottom: none; background: ${themeColor} !important; background-color: ${themeColor} !important; color: white !important; padding: 5px 6px; border-radius: 3px; font-size: 11px; margin-top: 2px; font-weight: bold; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    .amount-words { display: flex; gap: 4px; margin-bottom: 6px; padding: 5px 8px; background: #f0f9ff; border-left: 2px solid ${themeColor}; border-radius: 2px; font-size: 8px; }
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
  ${isProforma ? '<div class="draft-watermark">PROFORMA</div>' : (!hasAcceptedKsef && !isReceipt && !isNota ? '<div class="draft-watermark">KOPIA ROBOCZA</div>' : '')}
  <div class="invoice content-layer">
    <div class="top-meta">
      ${invoice.issue_place ? `${invoice.issue_place}, ` : ''}${formatDate(invoice.issue_date)}
    </div>

    <div class="header">
      <div class="logo-area">
        ${seller.logo_url ? `<img src="${seller.logo_url}" alt="Logo" />` : ''}
      </div>
      <div class="invoice-title">
        <h1 style="color: #333;">${invoiceTitle}<br><span style="color: ${themeColor};">${invoice.invoice_number}</span></h1>
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
          <div>Faktura rozliczająca zaliczkę nr: ${invoice.advance_data.advance_invoice_number}</div>
        </div>
        ` : ''}
        <div class="invoice-dates">
          ${isAdvance ? `<div class="invoice-dates-row"><span class="invoice-dates-label">Data zaliczki:</span> ${formatDate(invoice.sale_date)}</div>` : `<div class="invoice-dates-row"><span class="invoice-dates-label">Data sprzedaży:</span> ${formatDate(invoice.sale_date)}</div>`}
          <div class="invoice-dates-row"><span class="invoice-dates-label">Termin płatności:</span> ${formatDate(invoice.due_date)}</div>
        </div>
      </div>
    </div>

    ${isMargin ? `
    <div style="background: ${themeColorLight}; padding: 8px 16px; margin-bottom: 8px; border-radius: 4px; border-left: 3px solid ${themeColor}; font-size: 9px; color: ${themeColor}; font-weight: 500;">
      ⚠ Na tej fakturze nie wykazuje się kwoty podatku VAT — faktura wystawiana w procedurze marży
    </div>` : ''}

    ${isAdvance ? `
    <div style="background: ${themeColorLight}; padding: 8px 16px; margin-bottom: 8px; border-radius: 4px; border-left: 3px solid ${themeColor}; font-size: 9px; color: #0F6E56; font-weight: 500;">
      Zaliczka na poczet realizacji: ${displayItems[0]?.name || 'Zamówienie'}
    </div>` : ''}

    <div class="parties">
      <div class="party">
        <div class="party-label">${isVatRR ? 'Nabywca (kupujący)' : 'Sprzedawca'}</div>
        <div class="party-name">${seller.name || ''}</div>
        <div class="party-details">
          ${seller.nip ? `NIP: ${seller.nip}<br>` : ''}
          ${formatAddress(seller)}
        </div>
      </div>
      <div class="party">
        <div class="party-label">${isVatRR ? 'Dostawca (rolnik ryczałtowy)' : 'Nabywca'}</div>
        ${isSimplified && buyer.nip && !buyer.name ? `
        <div class="party-name">NIP nabywcy: ${buyer.nip}</div>
        <div class="party-details" style="font-style: italic;">(pełne dane nabywcy opcjonalne przy fakturze uproszczonej)</div>
        ` : `
        <div class="party-name">${buyer.name || ''}</div>
        <div class="party-details">
          ${buyer.nip ? `NIP: ${buyer.nip}<br>` : ''}
          ${isVatRR && invoice.vat_rr_data?.farmer_pesel ? `PESEL: ${invoice.vat_rr_data.farmer_pesel}<br>` : ''}
          ${isVatRR && invoice.vat_rr_data?.farmer_id_number ? `Nr dowodu: ${invoice.vat_rr_data.farmer_id_number}<br>` : ''}
          ${formatAddress(buyer)}
        </div>
        `}
      </div>
    </div>

    ${isCorrection && invoice.correction_data ? generateCorrectionTablesHtml(invoice.correction_data, currency, cellPadding, cellFontSize) : (isReceipt || isNota) ? `
    <table>
      <thead>
        <tr>
          <th style="width: 22px; background-color: ${themeColor} !important; color: #ffffff !important;">Lp.</th>
          <th style="background-color: ${themeColor} !important; color: #ffffff !important;">Nazwa towaru / usługi</th>
          <th style="width: 32px; background-color: ${themeColor} !important; color: #ffffff !important;">Jm.</th>
          <th style="width: 45px; background-color: ${themeColor} !important; color: #ffffff !important;">Ilość</th>
          <th style="width: 75px; background-color: ${themeColor} !important; color: #ffffff !important;">Cena</th>
          <th style="width: 80px; background-color: ${themeColor} !important; color: #ffffff !important;">Wartość</th>
        </tr>
      </thead>
      <tbody>
        ${simpleItemsHtml}
      </tbody>
    </table>
    ` : isVatRR ? `
    <table>
      <thead>
        <tr>
          <th style="width: 22px; background-color: ${themeColor} !important; color: #ffffff !important;">Lp.</th>
          <th style="background-color: ${themeColor} !important; color: #ffffff !important;">Nazwa produktu rolnego</th>
          <th style="width: 32px; background-color: ${themeColor} !important; color: #ffffff !important;">Jm.</th>
          <th style="width: 40px; background-color: ${themeColor} !important; color: #ffffff !important;">Ilość</th>
          <th style="width: 65px; background-color: ${themeColor} !important; color: #ffffff !important;">Cena jedn.</th>
          <th style="width: 65px; background-color: ${themeColor} !important; color: #ffffff !important;">Wart. netto</th>
          <th style="width: 35px; background-color: ${themeColor} !important; color: #ffffff !important;">Stawka</th>
          <th style="width: 55px; background-color: ${themeColor} !important; color: #ffffff !important;">Zwrot VAT</th>
          <th style="width: 65px; background-color: ${themeColor} !important; color: #ffffff !important;">Wart. brutto</th>
        </tr>
      </thead>
      <tbody>
        ${vatRRItemsHtml}
      </tbody>
    </table>
    ` : isMargin ? `
    <table>
      <thead>
        <tr>
          <th style="width: 22px; background-color: ${themeColor} !important; color: #ffffff !important;">Lp.</th>
          <th style="background-color: ${themeColor} !important; color: #ffffff !important;">Nazwa towaru</th>
          <th style="width: 32px; background-color: ${themeColor} !important; color: #ffffff !important;">Jm.</th>
          <th style="width: 35px; background-color: ${themeColor} !important; color: #ffffff !important;">Ilość</th>
          <th style="width: 80px; background-color: ${themeColor} !important; color: #ffffff !important;">Cena sprzedaży</th>
        </tr>
      </thead>
      <tbody>
        ${displayItems.map((item, index) => `
        <tr>
          <td style="border: 1px solid #ddd; padding: ${cellPadding}; text-align: center; font-size: ${cellFontSize};">${index + 1}</td>
          <td style="border: 1px solid #ddd; padding: ${cellPadding}; font-size: ${cellFontSize};">${item.name}${item.pkwiu ? ` <small>(${item.pkwiu})</small>` : ''}</td>
          <td style="border: 1px solid #ddd; padding: ${cellPadding}; text-align: center; font-size: ${cellFontSize};">${item.unit}</td>
          <td style="border: 1px solid #ddd; padding: ${cellPadding}; text-align: right; font-size: ${cellFontSize};">${item.quantity}</td>
          <td style="border: 1px solid #ddd; padding: ${cellPadding}; text-align: right; font-weight: bold; font-size: ${cellFontSize};">${formatCurrency(item.gross_amount, currency)}</td>
        </tr>
        `).join('')}
      </tbody>
    </table>
    ` : `
    <table>
      <thead>
        <tr>
          <th style="width: 22px; background-color: ${themeColor} !important; color: #ffffff !important;">Lp.</th>
          <th style="background-color: ${themeColor} !important; color: #ffffff !important;">${isAdvance ? 'Opis zaliczki' : 'Nazwa towaru / usługi'}</th>
          <th style="width: 32px; background-color: ${themeColor} !important; color: #ffffff !important;">Jm.</th>
          <th style="width: 35px; background-color: ${themeColor} !important; color: #ffffff !important;">Ilość</th>
          <th style="width: 60px; background-color: ${themeColor} !important; color: #ffffff !important;">Cena netto</th>
          <th style="width: 65px; background-color: ${themeColor} !important; color: #ffffff !important;">Wart. netto</th>
          <th style="width: 35px; background-color: ${themeColor} !important; color: #ffffff !important;">VAT</th>
          <th style="width: 55px; background-color: ${themeColor} !important; color: #ffffff !important;">Kwota VAT</th>
          <th style="width: 70px; background-color: ${themeColor} !important; color: #ffffff !important;">Wart. brutto</th>
        </tr>
      </thead>
      <tbody>
        ${itemsHtml}
      </tbody>
    </table>
    `}

    ${isVatRR ? (() => {
      const rrNetT = displayItems.reduce((s, i) => s + i.net_amount, 0);
      const rrVatT = Math.round(rrNetT * (rrRate / 100) * 100) / 100;
      const rrGrossT = Math.round((rrNetT + rrVatT) * 100) / 100;
      return `
    <div class="vat-summary" style="margin-top: 8px; font-size: 8px;">
      <div style="font-size: 9px; font-weight: 600; margin-bottom: 4px; color: #666;">Podsumowanie faktury VAT RR</div>
      <table style="width: 60%; max-width: 350px; border-collapse: collapse; table-layout: fixed; font-size: 8px;">
        <thead>
          <tr class="vat-header" style="background-color: ${themeColor} !important;">
            <th style="width: 25%; padding: 4px 6px; text-align: right; font-weight: 600; color: #fff !important; background-color: ${themeColor} !important;">Stawka</th>
            <th style="width: 25%; padding: 4px 6px; text-align: right; font-weight: 600; color: #fff !important; background-color: ${themeColor} !important;">Netto</th>
            <th style="width: 25%; padding: 4px 6px; text-align: right; font-weight: 600; color: #fff !important; background-color: ${themeColor} !important;">Zwrot VAT</th>
            <th style="width: 25%; padding: 4px 6px; text-align: right; font-weight: 600; color: #fff !important; background-color: ${themeColor} !important;">Brutto</th>
          </tr>
        </thead>
        <tbody>
          <tr style="background-color: ${themeColorLight};">
            <td style="padding: 3px 6px; text-align: right; font-weight: 600;">${rrRate}%</td>
            <td style="padding: 3px 6px; text-align: right;">${formatCurrency(rrNetT, currency)}</td>
            <td style="padding: 3px 6px; text-align: right;">${formatCurrency(rrVatT, currency)}</td>
            <td style="padding: 3px 6px; text-align: right; font-weight: 600;">${formatCurrency(rrGrossT, currency)}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <div style="background: ${themeColorLight}; padding: 8px 12px; margin: 8px 0; border-radius: 4px; border-left: 3px solid ${themeColor}; font-size: 8px;">
      <div style="font-weight: 600; margin-bottom: 4px; color: ${themeColor};">Oświadczenie rolnika ryczałtowego</div>
      <div style="color: #555;">${invoice.vat_rr_data?.declaration_text || 'Oświadczam, że jestem rolnikiem ryczałtowym zwolnionym od podatku od towarów i usług na podstawie art. 43 ust. 1 pkt 3 ustawy z dnia 11 marca 2004 r. o podatku od towarów i usług.'}</div>
    </div>`;
    })() : (isReceipt || isNota) ? '' : !isCorrection && !isMargin ? `
    <div class="vat-summary" style="margin-top: 8px; font-size: 8px;">
      <div style="font-size: 9px; font-weight: 600; margin-bottom: 4px; color: #666;">Podsumowanie faktury</div>
      <table style="width: 60%; max-width: 350px; border-collapse: collapse; table-layout: fixed; font-size: 8px;">
        <thead>
          <tr class="vat-header" style="background-color: ${themeColor} !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;">
            <th style="width: 25%; padding: 4px 6px; text-align: right; font-weight: 600; color: #ffffff !important; background-color: ${themeColor} !important;">Stawka</th>
            <th style="width: 25%; padding: 4px 6px; text-align: right; font-weight: 600; color: #ffffff !important; background-color: ${themeColor} !important;">Netto</th>
            <th style="width: 25%; padding: 4px 6px; text-align: right; font-weight: 600; color: #ffffff !important; background-color: ${themeColor} !important;">VAT</th>
            <th style="width: 25%; padding: 4px 6px; text-align: right; font-weight: 600; color: #ffffff !important; background-color: ${themeColor} !important;">Brutto</th>
          </tr>
        </thead>
        <tbody>
          ${Object.entries(vatSummary).map(([rate, amounts]) => `
            <tr style="background-color: ${themeColorLight};">
              <td style="width: 25%; padding: 3px 6px; text-align: right; color: #333; font-weight: 600;">${rate}%</td>
              <td style="width: 25%; padding: 3px 6px; text-align: right; color: #333;">${formatCurrency(amounts.net, currency)}</td>
              <td style="width: 25%; padding: 3px 6px; text-align: right; color: #333;">${formatCurrency(amounts.vat, currency)}</td>
              <td style="width: 25%; padding: 3px 6px; text-align: right; color: #333; font-weight: 600;">${formatCurrency(amounts.gross, currency)}</td>
            </tr>
          `).join('')}
          <tr style="border-top: 2px solid ${themeColor}; background-color: ${themeColorBorder};">
            <td style="width: 25%; padding: 4px 6px; text-align: right; font-weight: 700; color: ${themeColor};">Razem:</td>
            <td style="width: 25%; padding: 4px 6px; text-align: right; font-weight: 700; color: #333;">${formatCurrency(netTotal, currency)}</td>
            <td style="width: 25%; padding: 4px 6px; text-align: right; font-weight: 700; color: #333;">${formatCurrency(vatTotal, currency)}</td>
            <td style="width: 25%; padding: 4px 6px; text-align: right; font-weight: 700; color: ${themeColor};">${formatCurrency(grossTotal, currency)}</td>
          </tr>
        </tbody>
      </table>
    </div>
    ` : ''}

    ${isMargin && invoice.margin_purchase_price ? `
    <div style="display: flex; gap: 16px; margin-top: 8px; margin-bottom: 8px;">
      <div style="flex: 1; background: ${themeColorLight}; border-radius: 4px; padding: 8px 12px; border: 0.5px solid ${themeColorBorder};">
        <div style="font-size: 8px; color: #666; font-weight: 500; margin-bottom: 4px;">Dane wewnętrzne (tylko dla sprzedawcy/księgowej)</div>
        <div style="font-size: 9px; display: grid; grid-template-columns: 1fr 1fr; gap: 2px;">
          <span style="color: #666;">Cena zakupu:</span><span style="font-weight: 500;">${formatCurrency(invoice.margin_purchase_price, currency)}</span>
          <span style="color: #666;">Marża:</span><span style="font-weight: 500;">${formatCurrency(grossTotal - invoice.margin_purchase_price, currency)}</span>
          <span style="color: #666;">VAT od marży (23%):</span><span style="font-weight: 500; color: ${themeColor};">${formatCurrency((grossTotal - invoice.margin_purchase_price) * 0.23 / 1.23, currency)}</span>
        </div>
        <div style="font-size: 7px; color: #888; margin-top: 4px; font-style: italic;">* Dane widoczne tylko w systemie — nie drukowane na fakturze dla klienta</div>
      </div>
    </div>
    ` : ''}

    <div class="totals">
      <div class="totals-table">
        ${(isReceipt || isNota) ? '' : !isMargin ? `
        <div class="totals-row">
          <span>Razem netto:</span>
          <span style="font-weight: bold;">${formatCurrency(netTotal, currency)}</span>
        </div>
        ${!isVatRR ? `
        <div class="totals-row">
          <span>VAT:</span>
          <span style="font-weight: bold;">${formatCurrency(vatTotal, currency)}</span>
        </div>` : `
        <div class="totals-row">
          <span>Zryczałtowany zwrot VAT (${rrRate}%):</span>
          <span style="font-weight: bold;">${formatCurrency(Math.round(netTotal * (rrRate / 100) * 100) / 100, currency)}</span>
        </div>`}
        ` : ''}
        <div class="totals-row grand" style="background-color: ${themeColor} !important; color: #ffffff !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;">
          <span style="color: #ffffff !important; font-weight: bold;">${isAdvance ? 'OTRZYMANO ZALICZKĘ:' : isVatRR ? 'DO WYPŁATY ROLNIKOWI:' : (isReceipt || isNota) ? 'RAZEM:' : 'DO ZAPŁATY:'}</span>
          <span style="font-weight: bold; font-size: 13px; color: #ffffff !important;">${formatCurrency(isVatRR ? Math.round((netTotal + netTotal * (rrRate / 100)) * 100) / 100 : (isReceipt || isNota) ? netTotal : grossTotal, currency)}</span>
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

    ${footerNote ? `
    <div style="background: ${themeColorLight}; padding: 8px 12px; margin-bottom: 8px; border-radius: 4px; border-top: 0.5px solid ${themeColorBorder}; font-size: 8px; color: #666;">
      ${footerNote}
    </div>
    ` : ''}

    ${hasAcceptedKsef ? `
    <div class="ksef-box">
      <img class="ksef-qr" src="https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${encodeURIComponent(verificationUrl)}" alt="Kod QR KSeF" style="width: 80px; height: 80px;" />
      <div style="font-size: 10px; color: #6b7280;">
        <div class="ksef-box-title">Faktura w KSeF</div>
        <div class="ksef-box-line"><strong>Numer KSeF:</strong> ${invoice.ksef_reference}</div>
        ${invoice.ksef_acceptance_date ? `<div class="ksef-box-line"><strong>Data przyjęcia:</strong> ${formatDate(invoice.ksef_acceptance_date)}</div>` : ''}
        <div class="ksef-box-line"><strong>Weryfikacja:</strong> <a href="${verificationUrl}" style="color: ${themeColor};">efaktura.mf.gov.pl</a></div>
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
