/**
 * Helpers for contract generation
 */

/**
 * Parse KRS field to get proper registry label and value.
 * Stored as "KRS: 0001025395" or "CEIDG: 12345678901"
 */
export function parseRegistryField(krs: string | null | undefined): { label: string; value: string } {
  if (!krs) return { label: 'KRS', value: '—' };
  
  if (krs.toUpperCase().startsWith('CEIDG')) {
    return { label: 'CEIDG', value: krs.replace(/^CEIDG:?\s*/i, '') };
  }
  if (krs.toUpperCase().startsWith('KRS')) {
    return { label: 'KRS', value: krs.replace(/^KRS:?\s*/i, '') };
  }
  // Fallback - assume KRS
  return { label: 'KRS', value: krs };
}

/**
 * Detect gender from PESEL number.
 * 10th digit (index 9): odd = male, even = female
 */
export function getGenderFromPesel(pesel: string | null | undefined): 'male' | 'female' | null {
  if (!pesel) return null;
  const digits = pesel.replace(/\D/g, '');
  if (digits.length < 10) return null;
  
  const genderDigit = parseInt(digits[9], 10);
  return genderDigit % 2 === 0 ? 'female' : 'male';
}

/**
 * Get proper salutation based on PESEL
 */
export function getSalutation(pesel: string | null | undefined): string {
  const gender = getGenderFromPesel(pesel);
  if (gender === 'male') return 'Panem';
  if (gender === 'female') return 'Panią';
  return 'Panem/Panią';
}

/**
 * Get proper "zwanym/ą" based on PESEL
 */
export function getZwanymA(pesel: string | null | undefined): string {
  const gender = getGenderFromPesel(pesel);
  if (gender === 'male') return 'zwanym';
  if (gender === 'female') return 'zwaną';
  return 'zwanym/ą';
}
