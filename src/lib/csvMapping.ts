// Utility functions for CSV column mapping

export interface CsvColumnMapping {
  identification: {
    email: string;
    phone: string;
    full_name: string;
    uber_id: string;
    bolt_id: string;
    freenow_id: string;
    getrido_id: string;
    fuel_card: string;
  };
  amounts: {
    // Uber fields
    uber_payout_d: string;        // Kolumna D - "Wypłacono ci"
    uber_cash_f: string;           // Kolumna F - gotówka
    uber_base: string;             // D + F (podstawa opodatkowania)
    uber_tax_8: string;            // Podatek 8% od (D + F)
    uber_net: string;              // D - podatek 8%
    
    // Bolt fields
    bolt_projected_d: string;      // Kolumna D - "Projected payout"
    bolt_payout_s: string;         // Kolumna S - "Wypłata"
    bolt_tax_8: string;            // Podatek 8% od Kolumny D
    bolt_net: string;              // S - podatek 8%
    
    // FreeNow fields
    freenow_base_s: string;        // Kolumna S - podstawa do podatku
    freenow_commission_t: string;  // Kolumna T - prowizja
    freenow_cash_f: string;        // Kolumna F - gotówka
    freenow_tax_8: string;         // Podatek 8% od Kolumny S
    freenow_net: string;           // S - podatek 8% - prowizja T - gotówka F
    
    // Shared fields
    total_cash: string;
    total_commission: string;
    fuel: string;
    fuel_vat: string;
    fuel_vat_refund: string;
  };
}

export interface FeeFormulas {
  [planType: string]: string;
}

// Convert column letter (A, B, AA, AB) to 0-based index
export function letterToIndex(letter: string): number {
  if (!letter || letter === '') return -1;
  
  letter = letter.toUpperCase();
  let result = 0;
  
  for (let i = 0; i < letter.length; i++) {
    result = result * 26 + (letter.charCodeAt(i) - 'A'.charCodeAt(0) + 1);
  }
  
  return result - 1;
}

// Resolve column mapping value to index
export function resolveColumnIndex(
  mappingValue: string, 
  headerValues: string[]
): number {
  if (!mappingValue) return -1;
  
  // Check if it's a letter (column name like A, B, AA)
  if (/^[A-Za-z]+$/.test(mappingValue)) {
    return letterToIndex(mappingValue);
  }
  
  // Check if it's a number (1-based index)
  if (/^[0-9]+$/.test(mappingValue)) {
    return parseInt(mappingValue, 10) - 1;
  }
  
  // Otherwise, treat as header name and search for it
  const searchTerm = mappingValue.toLowerCase();
  const index = headerValues.findIndex(h => 
    h.toLowerCase().includes(searchTerm)
  );
  
  return index;
}

// Default column mapping - using Polish column names from CSV
export const defaultColumnMapping: CsvColumnMapping = {
  identification: {
    email: 'adres mailowy',
    uber_id: 'id uber',
    phone: 'nr tel',
    freenow_id: 'id freenow',
    fuel_card: 'nr karty paliwowej',
    full_name: 'Imie nazwisko',
    bolt_id: '',
    getrido_id: 'getrido ID',
  },
  amounts: {
    // Uber - kolumny z CSV template
    uber_payout_d: 'H',           // Kolumna H w template = D w Uber CSV
    uber_cash_f: 'I',              // Kolumna I w template = F w Uber CSV
    uber_base: '',                 // Obliczane: D + F
    uber_tax_8: '',                // Obliczane: (D + F) * 0.08
    uber_net: '',                  // Obliczane: D - podatek
    
    // Bolt - kolumny z CSV template
    bolt_projected_d: 'J',         // Kolumna J w template = D w Bolt CSV
    bolt_payout_s: 'K',            // Kolumna K w template = S w Bolt CSV
    bolt_tax_8: '',                // Obliczane: D * 0.08
    bolt_net: '',                  // Obliczane: S - podatek
    
    // FreeNow - kolumny z CSV template
    freenow_base_s: 'N',           // Kolumna N w template = S w FreeNow CSV
    freenow_commission_t: 'O',     // Kolumna O w template = T w FreeNow CSV
    freenow_cash_f: 'M',           // Kolumna M w template = F w FreeNow CSV
    freenow_tax_8: '',             // Obliczane: S * 0.08
    freenow_net: '',               // Obliczane: S - podatek - prowizja - gotówka
    
    // Shared
    total_cash: 'F',               // Razem gotówka
    total_commission: 'razem prowizja',
    fuel: 'P',                     // Paliwo
    fuel_vat: 'vat z paliwa',
    fuel_vat_refund: 'U',          // Zwrot VAT
  },
};

// Default fee formulas by plan type
export const defaultFeeFormulas: FeeFormulas = {
  '50+8': '50 + (totalEarnings * 0.08)',
  'tylko 159': '159',
  'stała 200': '200',
};
