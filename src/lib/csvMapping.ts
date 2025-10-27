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
    uber: string;
    uber_cashless: string;
    uber_cash: string;
    bolt_gross: string;
    bolt_net: string;
    bolt_commission: string;
    bolt_cash: string;
    freenow_gross: string;
    freenow_net: string;
    freenow_commission: string;
    freenow_cash: string;
    total_cash: string;
    total_commission: string;
    tax: string;
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
    uber: 'Uber',
    uber_cashless: 'Uber bezgotówka',
    uber_cash: 'uber gotówka',
    bolt_gross: 'bolt brutto',
    bolt_net: 'bolt netto',
    bolt_commission: 'bolt prowizja',
    bolt_cash: 'bolt gotówka',
    freenow_gross: 'freenow brutto',
    freenow_net: 'freenow netto',
    freenow_commission: 'freenow prowizja',
    freenow_cash: 'freenow gotówka',
    total_cash: 'razem gotówka',
    total_commission: 'razem prowizja',
    tax: 'podatek 8%/49',
    fuel: 'paliwo',
    fuel_vat: 'vat z paliwa',
    fuel_vat_refund: 'zwrot vat z paliwa',
  },
};

// Default fee formulas by plan type
export const defaultFeeFormulas: FeeFormulas = {
  '50+8': '50 + (totalEarnings * 0.08)',
  'tylko 159': '159',
  'stała 200': '200',
};
