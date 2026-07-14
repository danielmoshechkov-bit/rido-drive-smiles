// Local invoice HTML generator for browser-based PDF printing
import { GETRIDO_MASCOT_DATAURI } from './getRidoMascot';

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
  short_name?: string;
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
  website?: string;
  logo_url?: string;
  /** Podstawa prawna zwolnienia z VAT — pokazywana na fakturze przy pozycjach „zw"
      (wymóg art. 106e ust. 1 pkt 19 ustawy o VAT). */
  vat_exemption_basis?: string;
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
  hide_footer?: boolean; // stopka www.GetRido.pl + numeracja stron — ustawienie do wyłączenia
  hide_signatures?: boolean; // sekcja podpisów — domyślnie widoczna; true = ukryj
  // KSeF
  ksef_status?: string;
  ksef_reference?: string;
  ksef_acceptance_date?: string;
  // Correction data
  correction_data?: {
    original_invoice_number: string;
    original_invoice_date: string;
    correction_reason: string;
    /** Forma płatności z faktury pierwotnej — gdy różni się od bieżącej,
        PDF pokazuje "Forma płatności: było X → jest Y". */
    payment_method_before?: string;
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

// Numer konta / IBAN w polskim formacie.
// - IBAN z kodem kraju (np. "PL61..."): grupy po 4 od początku -> "PL61 1090 1014 ..."
// - polski NRB (same cyfry, 26): 2 cyfry kontrolne + grupy po 4 -> "19 2030 0074 5996 ..."
export const formatIban = (value?: string): string => {
  if (!value) return '';
  const compact = value.replace(/\s+/g, '').toUpperCase();
  if (/^[A-Z]{2}\d/.test(compact)) {
    // IBAN (kod kraju + cyfry) — grupy po 4 od początku
    return compact.replace(/(.{4})/g, '$1 ').trim();
  }
  if (/^\d+$/.test(compact)) {
    // NRB — pierwsze 2 cyfry, potem grupy po 4
    const head = compact.slice(0, 2);
    const rest = compact.slice(2).replace(/(.{4})/g, '$1 ').trim();
    return rest ? `${head} ${rest}` : head;
  }
  return compact.replace(/(.{4})/g, '$1 ').trim();
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
  
  // Helper: liczba 0-999 słownie
  const upTo999 = (n: number): string => {
    let r = '';
    if (n >= 100) {
      r += hundreds[Math.floor(n / 100)] + ' ';
      n = n % 100;
    }
    if (n >= 10 && n < 20) {
      r += teens[n - 10] + ' ';
    } else {
      if (n >= 20) {
        r += tens[Math.floor(n / 10)] + ' ';
        n = n % 10;
      }
      if (n > 0) r += ones[n] + ' ';
    }
    return r.trim();
  };

  // Polska odmiana dla tysięcy: 1=tysiąc, 2-4=tysiące, 5+=tysięcy (z wyjątkiem 12-14=tysięcy)
  const tysiacForm = (n: number): string => {
    if (n === 1) return 'tysiąc';
    const lastTwo = n % 100;
    const last = n % 10;
    if (lastTwo >= 12 && lastTwo <= 14) return 'tysięcy';
    if (last >= 2 && last <= 4) return 'tysiące';
    return 'tysięcy';
  };

  let result = '';

  // Miliony (do 999 999 999)
  if (zlote >= 1_000_000) {
    const millions = Math.floor(zlote / 1_000_000);
    const lastTwo = millions % 100;
    const last = millions % 10;
    let mForm = 'milionów';
    if (millions === 1) mForm = 'milion';
    else if (last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14)) mForm = 'miliony';
    result += (millions === 1 ? '' : upTo999(millions) + ' ') + mForm + ' ';
  }

  const afterM = zlote % 1_000_000;
  if (afterM >= 1000) {
    const thousands = Math.floor(afterM / 1000);
    result += (thousands === 1 ? '' : upTo999(thousands) + ' ') + tysiacForm(thousands) + ' ';
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

/**
 * Oblicza sumy pozycji faktury.
 * - Tryb 'net' (domyślny): kwota netto = qty × unit_net_price (źródło prawdy = netto)
 * - Tryb 'gross': kwota brutto = qty × unit_gross_price (źródło prawdy = brutto),
 *   netto i VAT są wyliczane wstecz tak, by suma brutto była dokładnie równa qty × cena brutto.
 *   To zgodne z polską ustawą o VAT (art. 106e) — przy cenie brutto, podatek liczy się
 *   metodą "w stu" od kwoty brutto pomnożonej przez ilość.
 */
export const calculateItemTotals = (
  item: Partial<InvoiceItem> & { unit_gross_price?: number; lastEditedField?: 'net' | 'gross' }
): InvoiceItem => {
  const quantity = item.quantity || 0;
  const vatRateStr = item.vat_rate || '23';
  const vatRate = parseFloat(vatRateStr) || 0;
  const useGross = item.lastEditedField === 'gross' && (item.unit_gross_price || 0) > 0;

  let netAmount: number;
  let grossAmount: number;
  let vatAmount: number;
  let unitNetPrice: number;

  if (useGross) {
    const unitGross = item.unit_gross_price || 0;
    grossAmount = Math.round(quantity * unitGross * 100) / 100;
    // VAT "w stu" od kwoty brutto
    netAmount = Math.round((grossAmount / (1 + vatRate / 100)) * 100) / 100;
    vatAmount = Math.round((grossAmount - netAmount) * 100) / 100;
    // jednostkowa netto przeliczona z brutto (do prezentacji)
    unitNetPrice = Math.round((unitGross / (1 + vatRate / 100)) * 100) / 100;
  } else {
    unitNetPrice = item.unit_net_price || 0;
    netAmount = Math.round(quantity * unitNetPrice * 100) / 100;
    vatAmount = Math.round(netAmount * (vatRate / 100) * 100) / 100;
    grossAmount = Math.round((netAmount + vatAmount) * 100) / 100;
  }

  return {
    name: item.name || '',
    pkwiu: item.pkwiu,
    quantity,
    unit: item.unit || 'szt.',
    unit_net_price: unitNetPrice,
    vat_rate: vatRateStr,
    net_amount: netAmount,
    vat_amount: vatAmount,
    gross_amount: grossAmount,
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
  
  return parts.join(', ');
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

  // RÓŻNICA — parowanie pozycji PO z PRZED po NAZWIE (pierwsze wolne dopasowanie),
  // z fallbackiem na tę samą pozycję listy (zmiana nazwy = korekta w miejscu).
  // Surowy indeks zawodzi, gdy listy przyjdą w różnej kolejności — odejmowałby
  // od siebie różne towary. Pozycje usunięte w korekcie wchodzą jako ujemne wiersze.
  const beforePool = cd.before_items.map(item => ({ item, used: false }));
  const takeBefore = (after: InvoiceItem, idx: number) => {
    const match = beforePool.find(e => !e.used && e.item.name === after.name)
      || (beforePool[idx] && !beforePool[idx].used ? beforePool[idx] : undefined);
    if (!match) return null;
    match.used = true;
    return match.item;
  };
  const diffItems = cd.after_items.map((after, i) => {
    const before = takeBefore(after, i) || { name: after.name, quantity: 0, unit_net_price: 0, net_amount: 0, vat_amount: 0, gross_amount: 0 };
    return {
      name: after.name,
      vat_rate: after.vat_rate,
      qty: after.quantity - before.quantity,
      price: after.unit_net_price - before.unit_net_price,
      net: after.net_amount - before.net_amount,
      vat: after.vat_amount - before.vat_amount,
      gross: after.gross_amount - before.gross_amount,
    };
  });
  beforePool.filter(e => !e.used).forEach(({ item }) => {
    diffItems.push({
      name: item.name,
      vat_rate: item.vat_rate,
      qty: -item.quantity,
      price: -item.unit_net_price,
      net: -item.net_amount,
      vat: -item.vat_amount,
      gross: -item.gross_amount,
    });
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
            <td style="text-align: right; padding: 6px 8px;">${d.vat_rate || '23'}%</td>
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
  const isServiceConfirmation = invoice.type === 'service_confirmation';
  
  // Documents without VAT columns
  const noVatDocument = isReceipt || isNota || isMargin || isServiceConfirmation;

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

  // Unified theme colors — all invoice types use the same purple brand color
  const themeColor = '#7c3aed';
  const themeColorLight = '#f8f5ff';
  const themeColorBorder = '#ede9fe';
  let invoiceTitle = 'Faktura VAT';
  let footerNote = '';

  if (isReceipt) {
    invoiceTitle = 'RACHUNEK';
  } else if (isNota) {
    invoiceTitle = 'NOTA KSIĘGOWA';
  } else if (isVatRR) {
    invoiceTitle = 'FAKTURA VAT RR';
    const rrRate = invoice.vat_rr_data?.flat_rate_percent || 7;
    footerNote = `Faktura VAT RR wystawiona na podstawie art. 116 ustawy z dnia 11 marca 2004 r. o podatku od towarów i usług. Zryczałtowany zwrot VAT: ${rrRate}%.`;
  } else if (isProforma) {
    invoiceTitle = 'FAKTURA PROFORMA';
    footerNote = 'Dokument nie jest fakturą VAT w rozumieniu ustawy o podatku od towarów i usług. Nie stanowi podstawy do odliczenia VAT.';
  } else if (isServiceConfirmation) {
    invoiceTitle = 'POTWIERDZENIE WYKONANIA USŁUGI';
    footerNote = 'Niniejszy dokument stanowi potwierdzenie wykonania usługi i nie jest fakturą w rozumieniu ustawy z dnia 11 marca 2004 r. o podatku od towarów i usług. Nie stanowi podstawy do odliczenia podatku VAT ani do księgowania jako dokument kosztowy.';
  } else if (isAdvance) {
    invoiceTitle = 'FAKTURA ZALICZKOWA';
    footerNote = 'Faktura zaliczkowa wystawiona zgodnie z art. 106f ust. 1 ustawy z dnia 11 marca 2004 r. o podatku od towarów i usług. Kwota brutto obejmuje otrzymaną zaliczkę.';
  } else if (isMargin) {
    const procedureLabels: Record<string, string> = {
      'used_goods': 'towarów używanych — art. 120 ust. 4',
      'tourism': 'usług turystycznych — art. 119',
      'art': 'dzieł sztuki — art. 120 ust. 4',
      'antiques': 'przedmiotów kolekcjonerskich i antyków — art. 120 ust. 4',
    };
    const procLabel = procedureLabels[invoice.margin_procedure_type || 'used_goods'] || 'towarów używanych — art. 120 ust. 4';
    invoiceTitle = 'FAKTURA VAT MARŻA';
    footerNote = `Procedura marży dla ${procLabel} ustawy z dnia 11 marca 2004 r. o podatku od towarów i usług. Podatek VAT nie jest wykazywany na fakturze.`;
  } else if (isSimplified) {
    invoiceTitle = 'FAKTURA UPROSZCZONA';
    footerNote = 'Faktura uproszczona wystawiona zgodnie z art. 106e ust. 5 pkt 3 ustawy z dnia 11 marca 2004 r. o podatku od towarów i usług. Kwota należności ogółem zawiera kwotę podatku.';
  } else if (isCorrection) {
    invoiceTitle = 'FAKTURA KORYGUJĄCA';
  } else if (isFinal) {
    invoiceTitle = 'FAKTURA VAT (ROZLICZENIE ZALICZKI)';
    footerNote = 'Faktura rozliczająca zaliczkę wystawiona zgodnie z art. 106f ust. 3 ustawy z dnia 11 marca 2004 r. o podatku od towarów i usług.';
  }
  
  const cellPadding = compact_pdf ? '2px 5px' : '2px 6px';
  const cellFontSize = compact_pdf ? '9px' : '10px';
  
  // Standard items HTML (VAT columns)
  const itemsHtml = displayItems.map((item, index) => `
    <tr>
      <td style="border: 1px solid #ddd; padding: ${cellPadding}; text-align: center; vertical-align: middle; font-size: ${cellFontSize};">${index + 1}</td>
      <td style="border: 1px solid #ddd; padding: ${cellPadding}; text-align: left; vertical-align: middle; font-size: ${cellFontSize};">${item.name}${item.pkwiu ? ` <small>(${item.pkwiu})</small>` : ''}</td>
      <td style="border: 1px solid #ddd; padding: ${cellPadding}; text-align: center; vertical-align: middle; font-size: ${cellFontSize};">${item.unit}</td>
      <td style="border: 1px solid #ddd; padding: ${cellPadding}; text-align: center; vertical-align: middle; font-size: ${cellFontSize};">${item.quantity}</td>
      <td style="border: 1px solid #ddd; padding: ${cellPadding}; text-align: center; vertical-align: middle; font-size: ${cellFontSize};">${formatCurrency(item.unit_net_price, currency)}</td>
      <td style="border: 1px solid #ddd; padding: ${cellPadding}; text-align: center; vertical-align: middle; font-size: ${cellFontSize};">${formatCurrency(item.net_amount, currency)}</td>
      <td style="border: 1px solid #ddd; padding: ${cellPadding}; text-align: center; vertical-align: middle; font-size: ${cellFontSize};">${item.vat_rate}%</td>
      <td style="border: 1px solid #ddd; padding: ${cellPadding}; text-align: center; vertical-align: middle; font-size: ${cellFontSize};">${formatCurrency(item.vat_amount, currency)}</td>
      <td style="border: 1px solid #ddd; padding: ${cellPadding}; text-align: center; vertical-align: middle; font-weight: bold; font-size: ${cellFontSize};">${formatCurrency(item.gross_amount, currency)}</td>
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
  
  const baseFontSize = compact_pdf ? '9px' : '11px';
  const titleFontSize = compact_pdf ? '16px' : '20px';
  const pageMargin = compact_pdf ? '6mm' : '8mm';

  // Standardowa faktura (VAT/zaliczka/rozliczenie/uproszczona/proforma) ma i "Podsumowanie faktury"
  // (lewa) i box "DO ZAPŁATY" (prawa) — układamy je OBOK SIEBIE w dwóch kolumnach (wzór FV-005).
  // Rachunek/nota/korekta/marża/VAT RR mają własny układ → zostają jak były (stos pionowy).
  const useTwoColSummary = !isVatRR && !isReceipt && !isNota && !isCorrection && !isMargin;

  // "Podsumowanie faktury" — tabela stawek VAT (lewa kolumna). Wypełnia całą szerokość swojej kolumny.
  const standardVatSummaryHtml = `
    <div class="vat-summary" style="margin-top: 0; font-size: 10px;">
      <div style="font-size: 11px; font-weight: 600; margin-bottom: 2px; color: #666;">Podsumowanie faktury</div>
      <table style="width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 10px;">
        <thead>
          <tr class="vat-header" style="background-color: ${themeColor} !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;">
            <th style="width: 25%; padding: 2px 6px; text-align: center; vertical-align: middle; font-weight: 600; color: #ffffff !important; background-color: ${themeColor} !important;">Stawka</th>
            <th style="width: 25%; padding: 2px 6px; text-align: center; vertical-align: middle; font-weight: 600; color: #ffffff !important; background-color: ${themeColor} !important;">Netto</th>
            <th style="width: 25%; padding: 2px 6px; text-align: center; vertical-align: middle; font-weight: 600; color: #ffffff !important; background-color: ${themeColor} !important;">VAT</th>
            <th style="width: 25%; padding: 2px 6px; text-align: center; vertical-align: middle; font-weight: 600; color: #ffffff !important; background-color: ${themeColor} !important;">Brutto</th>
          </tr>
        </thead>
        <tbody>
          ${Object.entries(vatSummary).map(([rate, amounts]) => `
            <tr style="background-color: ${themeColorLight};">
              <td style="width: 25%; padding: 2px 6px; text-align: center; vertical-align: middle; color: #333; font-weight: 600;">${rate}%</td>
              <td style="width: 25%; padding: 2px 6px; text-align: center; vertical-align: middle; color: #333;">${formatCurrency(amounts.net, currency)}</td>
              <td style="width: 25%; padding: 2px 6px; text-align: center; vertical-align: middle; color: #333;">${formatCurrency(amounts.vat, currency)}</td>
              <td style="width: 25%; padding: 2px 6px; text-align: center; vertical-align: middle; color: #333; font-weight: 600;">${formatCurrency(amounts.gross, currency)}</td>
            </tr>
          `).join('')}
          <tr style="border-top: 2px solid ${themeColor}; background-color: ${themeColorBorder};">
            <td style="width: 25%; padding: 2px 6px; text-align: center; vertical-align: middle; font-weight: 700; color: ${themeColor};">Razem:</td>
            <td style="width: 25%; padding: 2px 6px; text-align: center; vertical-align: middle; font-weight: 700; color: #333;">${formatCurrency(netTotal, currency)}</td>
            <td style="width: 25%; padding: 2px 6px; text-align: center; vertical-align: middle; font-weight: 700; color: #333;">${formatCurrency(vatTotal, currency)}</td>
            <td style="width: 25%; padding: 2px 6px; text-align: center; vertical-align: middle; font-weight: 700; color: ${themeColor};">${formatCurrency(grossTotal, currency)}</td>
          </tr>
        </tbody>
      </table>
    </div>`;

  // Wiersze boxu "DO ZAPŁATY" (prawa kolumna). DO ZAPŁATY = kwota POZOSTAŁA (brutto − zapłacono).
  const totalsRowsHtml = `
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
        ${(invoice.paid_amount && invoice.paid_amount > 0 && !isAdvance && !isReceipt && !isNota) ? `
        <div class="totals-row">
          <span>Zapłacono:</span>
          <span style="font-weight: bold; color: #16a34a;">${formatCurrency(invoice.paid_amount, currency)}</span>
        </div>` : ''}
        <div class="totals-row grand" style="background-color: ${themeColor} !important; color: #ffffff !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;">
          <span style="color: #ffffff !important; font-weight: bold;">${isAdvance ? 'OTRZYMANO ZALICZKĘ:' : isVatRR ? 'DO WYPŁATY ROLNIKOWI:' : isMargin ? 'KWOTA BRUTTO:' : (isReceipt || isNota) ? 'RAZEM:' : 'DO ZAPŁATY:'}</span>
          <span style="font-weight: bold; font-size: 16px; color: #ffffff !important;">${formatCurrency(isVatRR ? Math.round((netTotal + netTotal * (rrRate / 100)) * 100) / 100 : (isReceipt || isNota) ? netTotal : isMargin ? grossTotal : isAdvance ? grossTotal : (grossTotal - (invoice.paid_amount || 0)), currency)}</span>
        </div>
        ${isFinal && invoice.advance_data?.advance_amount ? `
        <div class="totals-row" style="margin-top: 6px; border-top: 1px solid #ddd; padding-top: 6px;">
          <span>Wpłacona zaliczka${invoice.advance_data.advance_invoice_number ? ` (FZ: ${invoice.advance_data.advance_invoice_number})` : ''}:</span>
          <span style="font-weight: bold; color: #16a34a;">-${formatCurrency(invoice.advance_data.advance_amount, currency)}</span>
        </div>
        ${invoice.advance_data.advance_vat ? `
        <div class="totals-row">
          <span>w tym VAT z zaliczki:</span>
          <span style="font-weight: bold; color: #16a34a;">-${formatCurrency(invoice.advance_data.advance_vat, currency)}</span>
        </div>` : ''}
        <div class="totals-row" style="background: #f0fdf4; padding: 4px 6px; border-radius: 3px;">
          <span style="font-weight: bold;">Pozostało do zapłaty:</span>
          <span style="font-weight: bold; color: ${themeColor};">${formatCurrency(grossTotal - (invoice.advance_data.advance_amount || 0), currency)}</span>
        </div>
        ` : ''}`;

  return `
<!DOCTYPE html>
<html lang="pl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${safeFileName}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; }
    @page { margin: 0; size: A4; }
    @media print {
      html, body { height: 100%; margin: 0 !important; padding: 0 !important; }
      .invoice { max-width: 100%; page-break-inside: avoid; }
      * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; }
      th { background: ${themeColor} !important; background-color: ${themeColor} !important; color: white !important; }
      .totals-row.grand { background: ${themeColor} !important; background-color: ${themeColor} !important; color: white !important; }
      .vat-header { background: ${themeColor} !important; background-color: ${themeColor} !important; color: white !important; }
    }
    body {
      font-family: "DejaVu Sans", Arial, sans-serif;
      font-size: ${baseFontSize};
      line-height: 1.35;
      color: #333;
      /* Margines strony jak we wzorze (~8mm / 22.7pt). Dompdf ignoruje @page margin,
         więc margines realizujemy paddingiem body. Stopka (page_text) rysuje się w
         absolutnych współrzędnych strony i jest niezależna od tego paddingu. */
      padding: 22pt 22pt 28pt 22pt;
      background: white;
    }
    .invoice { width: 100%; max-width: 100%; margin: 0 auto; background: white; }
    /* Layout oparty na display:table (zamiast flex) — renderuje się poprawnie w Dompdf i w Chrome. */
    .top-meta { text-align: right; font-size: 12px; color: #333; margin-bottom: 1px; }
    .header { display: table; width: 100%; margin-bottom: 6px; padding-bottom: 5px; border-bottom: 2px solid ${themeColor}; }
    .logo-area { display: table-cell; vertical-align: middle; width: 55%; }
    .logo-area img { max-width: 264px; max-height: 84px; width: auto; height: auto; }
    .invoice-title { display: table-cell; vertical-align: top; text-align: right; }
    /* Zwarta lista w prawym górnym rogu — osobne divy z małymi marginesami i
       line-height 1.0 (Dompdf pewniej respektuje margin niż line-height na <br>). */
    .inv-title-main { font-size: ${titleFontSize}; font-weight: 700; color: #222; line-height: 16px; margin: 0; }
    .inv-title-num { font-size: 16px; font-weight: 700; color: ${themeColor}; line-height: 13px; margin-top: 2px; }
    .invoice-dates { font-size: 11px; color: #333; text-align: right; margin-top: 4px; line-height: 11px; }
    .invoice-dates-row { margin-bottom: -3px; }
    .invoice-dates-label { color: #555; }
    .parties { display: table; width: 100%; margin-bottom: 4px; }
    .party { display: table-cell; vertical-align: top; padding-right: 16px; }
    .party.buyer { padding-right: 0; padding-left: 16px; }
    .party-label { font-size: 10px; color: #7c3aed; text-transform: uppercase; margin-bottom: 2px; font-weight: 700; }
    .party-name { font-size: 14px; font-weight: 700; line-height: 13px; margin-bottom: 0; color: #111; }
    .party-details { font-size: 11px; color: #333; line-height: 11px; }
    .party-details .lbl { color: #555; }
    .party-contact { font-size: 11px; color: #333; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 6px; }
    th { background: ${themeColor} !important; background-color: ${themeColor} !important; color: white !important; padding: 4px 4px; text-align: center; vertical-align: middle; font-size: 11px; font-weight: 600; white-space: nowrap; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    th:first-child { border-radius: 6px 0 0 0; }
    th:last-child { border-radius: 0 6px 0 0; }
    .vat-summary { margin-bottom: 5px; font-size: 10px; }
    .vat-header { background: ${themeColor} !important; background-color: ${themeColor} !important; color: white !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    .totals { display: block; margin-bottom: 5px; }
    .totals-table { width: 240px; margin-left: auto; border: 1px solid #e3e0f0; border-radius: 6px; padding: 4px 8px; background: #faf9ff; }
    .totals-row { display: table; width: 100%; padding: 1px 0; font-size: 10px; border-bottom: 1px solid #d8d5e8; }
    .totals-row > span:first-child { display: table-cell; text-align: left; color: #444; vertical-align: middle; }
    .totals-row > span:last-child { display: table-cell; text-align: right; vertical-align: middle; }
    .totals-row.grand { border-bottom: none; background: ${themeColor} !important; background-color: ${themeColor} !important; color: white !important; padding: 4px 8px; border-radius: 4px; font-size: 12px; margin-top: 2px; font-weight: bold; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    .amount-words { display: block; margin-top: 4px; margin-bottom: 5px; padding: 1px 0; font-size: 10px; }
    .amount-words-label { color: #666; font-weight: 600; white-space: nowrap; }
    .amount-words-value { font-style: italic; }
    .payment { margin-bottom: 5px; font-size: 10px; }
    .payment-row { display: block; margin-bottom: 0; }
    .payment-label { color: #666; min-width: 80px; }
    .payment-value { font-weight: 500; }
    .notes { margin-bottom: 4px; padding: 4px 11px; background: #f8f5ff; border: 1px solid #ede9fe; border-radius: 6px; font-size: 10px; }
    .notes-label { font-size: 9px; color: ${themeColor}; text-transform: uppercase; margin-bottom: 1px; font-weight: 700; letter-spacing: 0.04em; }
    .footer { display: table; width: 100%; margin-top: 67px; }
    .signature { display: table-cell; width: 50%; text-align: center; padding: 0 30px; }
    .signature-line { border-top: 1px solid #333; margin-top: 8px; padding-top: 3px; font-size: 9px; color: #666; }
     /* Znak wodny — przezroczysty, powtarzany NA CAŁEJ stronie, na wierzchu treści,
        żeby było widać że to KOPIA ROBOCZA na każdej pozycji. */
     .draft-watermark {
       position: fixed;
       inset: 0;
       pointer-events: none;
       z-index: 9999;
       overflow: hidden;
     }
     .draft-watermark-inner {
       position: absolute;
       top: -50%;
       left: -50%;
       width: 200%;
       height: 200%;
       transform: rotate(-28deg);
       font-size: 54px;
       font-weight: 800;
       letter-spacing: 8px;
       color: rgba(124, 58, 237, 0.16);
       line-height: 180px;
       text-align: center;
       word-spacing: 60px;
       white-space: pre-wrap;
     }
     @media print {
       .draft-watermark { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
     }
     .content-layer { position: relative; z-index: 1; background: transparent; }
     .ksef-box {
       margin-top: 6px;
       padding: 4px 12px;
       border: 1px solid #e5e7eb;
       border-radius: 8px;
       width: 100%;
       background: #f8fafc;
     }
     /* QR tuż obok tekstu (mały odstęp jak we wzorze). Dompdf źle liczy display:table
        z auto-szerokością, więc: kolumna QR width:1px + white-space:nowrap (kurczy się
        do QR), kolumna tekstu width:100% (bierze resztę). BEZ table-layout:fixed. */
     .ksef-box-inner { width: 100%; border-collapse: collapse; }
     .ksef-box-qr { vertical-align: middle; padding-right: 12px; white-space: nowrap; width: 1px; }
     .ksef-box-text { vertical-align: middle; width: 100%; }
     /* Stopka strony: maskotka + www.GetRido.pl (lewa) + Strona X z Y (prawa), w jednym rzędzie na dole. */
     /* Stopka rysowana skryptem Dompdf (page_text) — NIE position:fixed (unikamy renderu
        na górze/duplikatów). Widoczna wyłącznie na dole każdej strony. */
     .ksef-box-title { font-weight: 700; margin-bottom: 4px; color: #15803d; }
     .ksef-box-line { margin-top: 2px; }
  </style>
</head>
<body>
  ${(() => {
    const watermarkText = isProforma ? 'PROFORMA' : '';
    if (!watermarkText) return '';
    const repeated = (watermarkText + '   ').repeat(80);
    return `<div class="draft-watermark"><div class="draft-watermark-inner">${repeated}</div></div>`;
  })()}
  <div class="invoice content-layer">
    <div class="top-meta">
      ${invoice.issue_place ? `${invoice.issue_place}, ` : ''}${formatDate(invoice.issue_date)}
    </div>

    <div class="header">
      <div class="logo-area">
        ${seller.logo_url
          ? `<img src="${seller.logo_url}" alt="Logo firmy" />`
          : ''}
      </div>
      <div class="invoice-title">
        <div class="inv-title-main">${invoiceTitle}</div>
        <div class="inv-title-num">${invoice.invoice_number}</div>
        ${isCorrection && invoice.correction_data ? `
        <div style="font-size: 9px; color: #555; margin-top: 4px;">
          <div>do faktury nr: <strong>${invoice.correction_data.original_invoice_number}</strong></div>
          <div>z dnia: ${formatDate(invoice.correction_data.original_invoice_date)}</div>
          <div>Powód korekty: ${invoice.correction_data.correction_reason}</div>
          ${invoice.correction_data.payment_method_before && invoice.correction_data.payment_method_before !== invoice.payment_method ? `
          <div>Forma płatności: było <strong>${paymentMethodLabels[invoice.correction_data.payment_method_before] || invoice.correction_data.payment_method_before}</strong> → jest <strong>${paymentMethodLabels[invoice.payment_method] || invoice.payment_method}</strong></div>
          ` : ''}
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
          ${isAdvance ? `<div class="invoice-dates-row"><span class="invoice-dates-label">Data zaliczki:</span> <strong>${formatDate(invoice.sale_date)}</strong></div>` : `<div class="invoice-dates-row"><span class="invoice-dates-label">Data sprzedaży:</span> <strong>${formatDate(invoice.sale_date)}</strong></div>`}
          <div class="invoice-dates-row"><span class="invoice-dates-label">Termin płatności:</span> <strong>${formatDate(invoice.due_date)}</strong></div>
          <div class="invoice-dates-row"><span class="invoice-dates-label">Sposób płatności:</span> <strong>${paymentMethodLabels[invoice.payment_method] || invoice.payment_method}</strong></div>
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
      <div class="party" style="width: 50%;">
        <div class="party-label">${isVatRR ? 'Nabywca (kupujący)' : 'Sprzedawca'}</div>
        <div class="party-name">${seller.name || ''}</div>
        <div class="party-details">
          ${seller.nip ? `NIP: ${seller.nip}<br>` : ''}
          ${formatAddress(seller)}
          ${(seller.phone || seller.email) ? `<br><span class="party-contact">${seller.phone ? `Tel: ${seller.phone}` : ''}${(seller.phone && seller.email) ? '&nbsp;&nbsp;&nbsp;' : ''}${seller.email ? `E-mail: ${seller.email}` : ''}</span>` : ''}
          ${seller.website ? `<br><span class="party-contact">${seller.website}</span>` : ''}
        </div>
      </div>
      <div class="party buyer" style="width: 50%;">
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
          <th style="width: 22px; text-align: center; vertical-align: middle; background-color: ${themeColor} !important; color: #ffffff !important;">Lp.</th>
          <th style="text-align: center; vertical-align: middle; background-color: ${themeColor} !important; color: #ffffff !important;">${isAdvance ? 'Opis zaliczki' : 'Nazwa towaru / usługi'}</th>
          <th style="width: 32px; text-align: center; vertical-align: middle; background-color: ${themeColor} !important; color: #ffffff !important;">Jm.</th>
          <th style="width: 35px; text-align: center; vertical-align: middle; background-color: ${themeColor} !important; color: #ffffff !important;">Ilość</th>
          <th style="width: 55px; text-align: center; vertical-align: middle; background-color: ${themeColor} !important; color: #ffffff !important;">Cena<br>netto</th>
          <th style="width: 58px; text-align: center; vertical-align: middle; background-color: ${themeColor} !important; color: #ffffff !important;">Wart.<br>netto</th>
          <th style="width: 35px; text-align: center; vertical-align: middle; background-color: ${themeColor} !important; color: #ffffff !important;">VAT</th>
          <th style="width: 52px; text-align: center; vertical-align: middle; background-color: ${themeColor} !important; color: #ffffff !important;">Kwota<br>VAT</th>
          <th style="width: 62px; text-align: center; vertical-align: middle; background-color: ${themeColor} !important; color: #ffffff !important;">Wart.<br>brutto</th>
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
    })() : ''}

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

    ${useTwoColSummary ? `
    <table style="width: 100%; table-layout: fixed; border-collapse: collapse; margin-top: 8px; margin-bottom: 6px;">
      <tr>
        <td style="width: 54%; vertical-align: top; padding-right: 14px;">
          ${standardVatSummaryHtml}
        </td>
        <td style="width: 46%; vertical-align: top;">
          <div class="totals-table" style="width: auto; margin-left: 0;">
            ${totalsRowsHtml}
          </div>
        </td>
      </tr>
    </table>
    ` : `
    <div class="totals">
      <div class="totals-table">
        ${totalsRowsHtml}
      </div>
    </div>
    `}

    <div class="amount-words">
      <span class="amount-words-label">Słownie:</span>
      <span class="amount-words-value">${numberToWords(grossTotal)}</span>
    </div>

    ${items.some(i => String(i.vat_rate).trim() === 'zw') ? `
    <div style="margin-bottom: 5px; padding: 4px 11px; background: #f8f5ff; border: 1px solid #ede9fe; border-radius: 6px; font-size: 10px;">
      <span style="color: #7c3aed; font-weight: 700;">Podstawa zwolnienia z VAT:</span>
      ${seller.vat_exemption_basis || 'zwolnienie od podatku od towarów i usług'}
    </div>
    ` : ''}

    ${(seller.bank_account && invoice.payment_method === 'transfer') ? `
    <div class="payment">
      <div class="payment-row">
        <span class="payment-label">Bank:</span>
        <span class="payment-value">${seller.bank_name || ''}</span>
      </div>
      <div class="payment-row">
        <span class="payment-label">Nr konta:</span>
        <span class="payment-value">${formatIban(seller.bank_account)}</span>
      </div>
      ${seller.swift_code ? `
      <div class="payment-row">
        <span class="payment-label">SWIFT/BIC:</span>
        <span class="payment-value">${seller.swift_code}</span>
      </div>
      ` : ''}
    </div>
    ` : ''}

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
      <table class="ksef-box-inner">
        <tr>
          <td class="ksef-box-qr">
            <img class="ksef-qr" src="https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${encodeURIComponent(verificationUrl)}" alt="Kod QR KSeF" style="width: 70px; height: 70px;" />
          </td>
          <td class="ksef-box-text" style="font-size: 11px; color: #333;">
            <div class="ksef-box-title">Faktura w KSeF</div>
            <div class="ksef-box-line"><strong>Numer KSeF:</strong> ${invoice.ksef_reference}</div>
            ${invoice.ksef_acceptance_date ? `<div class="ksef-box-line"><strong>Data przyjęcia:</strong> ${formatDate(invoice.ksef_acceptance_date)}</div>` : ''}
            <div class="ksef-box-line"><strong>Weryfikacja:</strong> <a href="${verificationUrl}" style="color: ${themeColor};">efaktura.mf.gov.pl</a></div>
          </td>
        </tr>
      </table>
    </div>
    ` : ''}

    ${!invoice.hide_signatures ? `
    <div class="footer">
      ${isServiceConfirmation ? `
      <div class="signature">
        <div class="signature-line">Podpis osoby upoważnionej<br>do wystawienia${invoice.issued_by ? `<br><strong>${invoice.issued_by}</strong>` : ''}</div>
      </div>
      <div class="signature">
        <div class="signature-line">Podpis osoby upoważnionej<br>do odbioru</div>
      </div>
      ` : `
      <div class="signature">
        <div class="signature-line">Podpis osoby upoważnionej<br>do odbioru faktury</div>
      </div>
      <div class="signature">
        <div class="signature-line">Podpis osoby upoważnionej<br>do wystawienia faktury${invoice.issued_by ? `<br><strong>${invoice.issued_by}</strong>` : ''}</div>
      </div>
      `}
    </div>
    ` : ''}
  </div>
  ${!invoice.hide_footer ? `
  <script type="text/php">
    if (isset($pdf)) {
      $ff = $fontMetrics->getFont("DejaVu Sans");
      $pw = $pdf->get_width(); $ph = $pdf->get_height();
      // Stopka na poziomie wzoru (tekst ~24pt od dołu). Maskotka wyśrodkowana pionowo
      // na linii napisu: środek maskotki = środek linii "www.GetRido.pl".
      $fy = $ph - 38;
      $mh = 22;
      try { $pdf->image("${GETRIDO_MASCOT_DATAURI}", 22, $fy - 3, $mh, $mh); } catch (\\Throwable $ie) {}
      $pdf->page_text(50, $fy, "www.GetRido.pl", $ff, 10, array(0,0,0));
      $pdf->page_text($pw - 96, $fy, "Strona {PAGE_NUM} z {PAGE_COUNT}", $ff, 10, array(0,0,0));
    }
  </script>` : ''}
</body>
</html>
  `;
};

export const printInvoice = (invoice: InvoiceData): void => {
  const html = generateInvoiceHtml(invoice);
  printHtmlDocument(html);
};
