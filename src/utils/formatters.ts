/**
 * Utility functions for formatting various data types
 */

/**
 * Format Polish IBAN to display format (XX XXXX XXXX XXXX XXXX XXXX XXXX)
 * Works with both raw numbers and formatted input
 */
export function formatIBAN(iban: string | null | undefined): string {
  if (!iban) return '';
  
  // Remove all spaces and non-alphanumeric characters
  const cleaned = iban.replace(/\s+/g, '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
  
  // Polish IBAN format: PL + 26 digits = 28 chars total
  // Or just 26 digits (no country code)
  // Format: XX XXXX XXXX XXXX XXXX XXXX XXXX (for 26 digit account)
  // Or: PLXX XXXX XXXX XXXX XXXX XXXX XXXX (for full IBAN)
  
  if (cleaned.length === 0) return '';
  
  // If it starts with PL, keep it
  let hasCountryCode = /^PL/i.test(cleaned);
  let digits = hasCountryCode ? cleaned.slice(2) : cleaned;
  
  // Format in groups of 4, first group is 2 digits
  const parts: string[] = [];
  
  if (hasCountryCode) {
    parts.push('PL');
  }
  
  // First 2 digits as control number
  if (digits.length > 0) {
    parts.push(digits.slice(0, 2));
    digits = digits.slice(2);
  }
  
  // Rest in groups of 4
  while (digits.length > 0) {
    parts.push(digits.slice(0, 4));
    digits = digits.slice(4);
  }
  
  return parts.join(' ');
}

/**
 * Format phone number to Polish display format
 */
export function formatPhoneNumber(phone: string | null | undefined): string {
  if (!phone) return '';
  
  // Remove all non-digits
  const digits = phone.replace(/\D/g, '');
  
  // Polish format: XXX XXX XXX
  if (digits.length === 9) {
    return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6, 9)}`;
  }
  
  // With country code: +48 XXX XXX XXX
  if (digits.length === 11 && digits.startsWith('48')) {
    return `+48 ${digits.slice(2, 5)} ${digits.slice(5, 8)} ${digits.slice(8, 11)}`;
  }
  
  // Return as-is if doesn't match expected format
  return phone;
}

/**
 * Format NIP number to display format (XXX-XXX-XX-XX)
 */
export function formatNIP(nip: string | null | undefined): string {
  if (!nip) return '';
  
  const digits = nip.replace(/\D/g, '');
  
  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6, 8)}-${digits.slice(8, 10)}`;
  }
  
  return nip;
}

/**
 * Format REGON number
 */
export function formatREGON(regon: string | null | undefined): string {
  if (!regon) return '';
  
  const digits = regon.replace(/\D/g, '');
  
  // 9-digit: XXX XXX XXX
  if (digits.length === 9) {
    return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6, 9)}`;
  }
  
  // 14-digit: XXX XXX XXX XXXXX
  if (digits.length === 14) {
    return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6, 9)} ${digits.slice(9, 14)}`;
  }
  
  return regon;
}

/**
 * Format postal code (XX-XXX)
 */
export function formatPostalCode(postalCode: string | null | undefined): string {
  if (!postalCode) return '';
  
  const digits = postalCode.replace(/\D/g, '');
  
  if (digits.length === 5) {
    return `${digits.slice(0, 2)}-${digits.slice(2, 5)}`;
  }
  
  return postalCode;
}

/**
 * Clean IBAN for storage (remove spaces and formatting)
 */
export function cleanIBAN(iban: string | null | undefined): string {
  if (!iban) return '';
  return iban.replace(/\s+/g, '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
}

/**
 * Validate Polish IBAN (basic check)
 */
export function isValidPolishIBAN(iban: string | null | undefined): boolean {
  if (!iban) return false;
  
  const cleaned = iban.replace(/\s+/g, '').toUpperCase();
  
  // Either 26 digits or PL + 26 digits
  if (cleaned.length === 26 && /^\d+$/.test(cleaned)) {
    return true;
  }
  
  if (cleaned.length === 28 && /^PL\d{26}$/.test(cleaned)) {
    return true;
  }
  
  return false;
}
