// Canonical KSeF-compliant invoice_type values
// These are the ONLY values that should be stored in the database
export type KsefInvoiceType = 'VAT' | 'KOR' | 'ZAL' | 'ROZ' | 'UPR' | 'KOR_ZAL' | 'KOR_ROZ';

// UI-friendly types that are NOT stored in DB but used only in selectors
export type UiInvoiceType = 'invoice' | 'proforma' | 'margin' | 'correction' | 'advance' | 'final' | 'simplified';

// Map legacy/UI values → KSeF DB values
const LEGACY_TO_KSEF: Record<string, KsefInvoiceType> = {
  // UI selector values
  'invoice': 'VAT',
  'correction': 'KOR',
  'advance': 'ZAL',
  'final': 'ROZ',
  'simplified': 'UPR',
  // Polish names
  'zaliczkowa': 'ZAL',
  'zaliczka': 'ZAL',
  'rozliczenie': 'ROZ',
  'uproszczona': 'UPR',
  'korygujaca': 'KOR',
  // English alternatives
  'prepayment': 'ZAL',
  'deposit': 'ZAL',
  'advance_invoice': 'ZAL',
  'settlement': 'ROZ',
  'final_invoice': 'ROZ',
  'simplified_invoice': 'UPR',
  'corrective': 'KOR',
  'credit_note': 'KOR',
  // Legacy DB values
  'vat_margin': 'VAT',
};

// Already-correct KSeF values (pass through)
const KSEF_VALUES = new Set<string>(['VAT', 'KOR', 'ZAL', 'ROZ', 'UPR', 'KOR_ZAL', 'KOR_ROZ']);

/**
 * Normalize any invoice_type value to KSeF-compliant value.
 * Use before saving to DB or sending to Edge Function.
 */
export function normalizeInvoiceType(raw: string | null | undefined): KsefInvoiceType {
  if (!raw) return 'VAT';
  const upper = raw.toUpperCase();
  if (KSEF_VALUES.has(upper)) return upper as KsefInvoiceType;
  return LEGACY_TO_KSEF[raw.toLowerCase()] || 'VAT';
}

// Non-KSeF document types (skip KSeF sending)
export const NON_KSEF_TYPES = new Set(['proforma', 'receipt', 'kp', 'kw', 'wz', 'pz', 'nota', 'margin']);

/**
 * Display labels for invoice types shown in UI
 */
export const INVOICE_TYPE_LABELS: Record<string, string> = {
  'VAT': 'Faktura VAT',
  'KOR': 'Faktura korygująca',
  'ZAL': 'Faktura zaliczkowa',
  'ROZ': 'Faktura rozliczająca',
  'UPR': 'Faktura uproszczona',
  'KOR_ZAL': 'Korekta zaliczkowej',
  'KOR_ROZ': 'Korekta rozliczającej',
  // Legacy/UI types still in DB
  'invoice': 'Faktura VAT',
  'proforma': 'Faktura Proforma',
  'margin': 'Faktura VAT marża',
  'vat_margin': 'Faktura VAT marża',
  'correction': 'Faktura korygująca',
  'advance': 'Faktura zaliczkowa',
  'final': 'Faktura rozliczająca',
  'simplified': 'Faktura uproszczona',
};

export function getInvoiceTypeLabel(type: string | null | undefined): string {
  if (!type) return 'Faktura VAT';
  return INVOICE_TYPE_LABELS[type] || type;
}

/**
 * Auto-detect correction reason based on what changed between before/after items
 */
export function detectCorrectionReason(
  beforeItems: Array<{ name: string; quantity: number; unit_net_price: number; net_amount: number }>,
  afterItems: Array<{ name: string; quantity: number; unit_net_price: number; net_amount: number }>
): string {
  const reasons: string[] = [];
  
  for (let i = 0; i < Math.max(beforeItems.length, afterItems.length); i++) {
    const before = beforeItems[i];
    const after = afterItems[i];
    
    if (!before && after) { reasons.push('Dodano pozycję'); continue; }
    if (before && !after) { reasons.push('Usunięto pozycję'); continue; }
    if (!before || !after) continue;
    
    if (before.name !== after.name) reasons.push('Błędna nazwa');
    if (before.quantity !== after.quantity) reasons.push('Błędna ilość');
    if (before.unit_net_price !== after.unit_net_price) reasons.push('Błędna cena');
  }
  
  const unique = [...new Set(reasons)];
  return unique.length > 0 ? unique.join(', ') : 'Korekta faktury';
}
