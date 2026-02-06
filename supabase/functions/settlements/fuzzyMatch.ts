/**
 * Fuzzy matching utilities for driver name matching
 * Handles Polish characters, reversed names, and typos
 */

// Normalize Polish name - remove diacritics, lowercase, trim
export function normalizePolishName(name: string): string {
  if (!name) return '';
  return name
    .toLowerCase()
    .replace(/ą/g, 'a')
    .replace(/ć/g, 'c')
    .replace(/ę/g, 'e')
    .replace(/ł/g, 'l')
    .replace(/ń/g, 'n')
    .replace(/ó/g, 'o')
    .replace(/ś/g, 's')
    .replace(/ź/g, 'z')
    .replace(/ż/g, 'z')
    .replace(/[^a-z0-9\s]/g, '') // Remove special chars
    .replace(/\s+/g, ' ')
    .trim();
}

// Calculate Levenshtein distance between two strings
export function levenshtein(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix: number[][] = [];

  // Initialize matrix
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  // Fill matrix
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

export interface FuzzyMatchResult {
  driver: any | null;
  score: number;
  matchType: 'exact' | 'reversed' | 'fuzzy' | 'partial' | 'none';
}

/**
 * Find best matching driver using fuzzy matching
 * 
 * Scoring system:
 * - 100: Platform ID exact match (handled separately)
 * - 90: Phone number match (handled separately)
 * - 80: Exact normalized name match
 * - 70: Reversed name match ("Jan Kowalski" = "Kowalski Jan")
 * - 60: First+Last initial match ("Jan K" ≈ "Jan Kowalski")
 * - 50-55: Levenshtein distance ≤ 2
 * - 40: Partial name overlap (one part matches exactly)
 */
export function fuzzyMatchDriver(
  csvName: string,
  existingDrivers: Map<string, any>,
  minScore = 50
): FuzzyMatchResult {
  const normalized = normalizePolishName(csvName);
  if (!normalized) {
    return { driver: null, score: 0, matchType: 'none' };
  }

  const nameParts = normalized.split(' ').filter(p => p.length > 0);
  const reversed = [...nameParts].reverse().join(' ');

  let bestMatch: any = null;
  let bestScore = 0;
  let matchType: FuzzyMatchResult['matchType'] = 'none';

  // Create a set to avoid duplicate driver checks
  const checkedDriverIds = new Set<string>();

  for (const [_key, driver] of existingDrivers.entries()) {
    // Avoid checking same driver multiple times (they can be in map under multiple keys)
    if (checkedDriverIds.has(driver.id)) continue;
    checkedDriverIds.add(driver.id);

    const driverFirstName = driver.first_name || '';
    const driverLastName = driver.last_name || '';
    const driverFullName = normalizePolishName(`${driverFirstName} ${driverLastName}`);
    
    if (!driverFullName) continue;

    // 1. Exact match (after normalization)
    if (driverFullName === normalized) {
      return { driver, score: 80, matchType: 'exact' };
    }

    // 2. Reversed order match
    if (driverFullName === reversed) {
      if (bestScore < 70) {
        bestMatch = driver;
        bestScore = 70;
        matchType = 'reversed';
      }
      continue;
    }

    // 3. First name + Last initial match (e.g., "Jan K" ≈ "Jan Kowalski")
    const driverParts = driverFullName.split(' ').filter(p => p.length > 0);
    if (nameParts.length >= 2 && driverParts.length >= 2) {
      // Check if first names match and second part is initial of last name
      if (
        nameParts[0] === driverParts[0] &&
        (nameParts[1].length === 1 && driverParts[1].startsWith(nameParts[1]))
      ) {
        if (bestScore < 60) {
          bestMatch = driver;
          bestScore = 60;
          matchType = 'partial';
        }
        continue;
      }
      // Reverse check
      if (
        nameParts[1] === driverParts[1] &&
        (nameParts[0].length === 1 && driverParts[0].startsWith(nameParts[0]))
      ) {
        if (bestScore < 60) {
          bestMatch = driver;
          bestScore = 60;
          matchType = 'partial';
        }
        continue;
      }
    }

    // 4. Levenshtein distance for small typos
    const distance = levenshtein(normalized, driverFullName);
    if (distance <= 2) {
      const fuzzyScore = 55 - distance * 2.5; // distance 0=55, 1=52.5, 2=50
      if (bestScore < fuzzyScore) {
        bestMatch = driver;
        bestScore = fuzzyScore;
        matchType = 'fuzzy';
      }
      continue;
    }

    // 5. Partial name overlap (at least one full word matches)
    const overlappingParts = nameParts.filter(p => driverParts.includes(p));
    if (overlappingParts.length > 0 && overlappingParts.length >= Math.min(nameParts.length, driverParts.length) - 1) {
      const partialScore = 40 + overlappingParts.length * 5;
      if (bestScore < partialScore && partialScore >= minScore) {
        bestMatch = driver;
        bestScore = partialScore;
        matchType = 'partial';
      }
    }
  }

  if (bestScore >= minScore) {
    return { driver: bestMatch, score: bestScore, matchType };
  }

  return { driver: null, score: 0, matchType: 'none' };
}
