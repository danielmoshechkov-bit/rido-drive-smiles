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

// Default column mapping (matches current CSV structure)
export const defaultColumnMapping: CsvColumnMapping = {
  identification: {
    email: 'A',
    uber_id: 'B',
    phone: 'C',
    freenow_id: 'D',
    fuel_card: 'E',
    full_name: 'F',
    bolt_id: '',
    getrido_id: 'X',
  },
  amounts: {
    uber: 'G',
    uber_cashless: 'H',
    uber_cash: 'I',
    bolt_gross: 'J',
    bolt_net: 'K',
    bolt_commission: 'L',
    bolt_cash: 'M',
    freenow_gross: 'N',
    freenow_net: 'O',
    freenow_commission: 'P',
    freenow_cash: 'Q',
    total_cash: 'R',
    total_commission: 'S',
    tax: 'T',
    fuel: 'U',
    fuel_vat: 'V',
    fuel_vat_refund: 'W',
  },
};

// Default fee formulas by plan type
export const defaultFeeFormulas: FeeFormulas = {
  '39+8': '39 + (totalEarnings * 0.08)',
  'tylko 159': '159',
  'stała 200': '200',
};
