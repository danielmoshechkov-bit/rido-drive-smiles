// GetRido Maps - Address Autocomplete Service (Nominatim/OSM)
// Enhanced with fuzzy matching and category search

export interface AddressSuggestion {
  placeId: string;
  displayName: string;
  shortName: string;
  type: 'address' | 'street' | 'city' | 'poi';
  lat: number;
  lng: number;
}

interface NominatimResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
  type: string;
  class: string;
  address?: {
    road?: string;
    house_number?: string;
    city?: string;
    town?: string;
    village?: string;
    municipality?: string;
    county?: string;
    state?: string;
    country?: string;
  };
}

// Cache dla zapytań (pamięć)
const queryCache = new Map<string, { results: AddressSuggestion[]; timestamp: number }>();
const CACHE_TTL = 60000; // 1 minuta
const MAX_CACHE_SIZE = 100;

// ═══════════════════════════════════════════════════════════════
// Polish character normalization for fuzzy matching
// ═══════════════════════════════════════════════════════════════

const POLISH_CHAR_MAP: Record<string, string> = {
  'ą': 'a', 'ć': 'c', 'ę': 'e', 'ł': 'l', 'ń': 'n',
  'ó': 'o', 'ś': 's', 'ź': 'z', 'ż': 'z',
  'Ą': 'A', 'Ć': 'C', 'Ę': 'E', 'Ł': 'L', 'Ń': 'N',
  'Ó': 'O', 'Ś': 'S', 'Ź': 'Z', 'Ż': 'Z',
};

/**
 * Normalize Polish characters to ASCII equivalents
 */
export function normalizePolish(str: string): string {
  return str.replace(/[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/g, (char) => POLISH_CHAR_MAP[char] || char);
}

/**
 * Normalize string for comparison (lowercase + Polish chars + trim)
 */
export function normalizeForComparison(str: string): string {
  return normalizePolish(str.toLowerCase().trim());
}

/**
 * Fuzzy match for typos - checks if input is "close enough" to target
 * Handles missing letters, swapped letters, common Polish typos
 */
export function fuzzyMatch(input: string, target: string): boolean {
  const normInput = normalizeForComparison(input);
  const normTarget = normalizeForComparison(target);
  
  // Exact or substring match
  if (normTarget.includes(normInput) || normInput.includes(normTarget)) {
    return true;
  }
  
  // Length difference check - allow up to 2 chars difference
  const lenDiff = Math.abs(normInput.length - normTarget.length);
  if (lenDiff > 2) return false;
  
  // Character overlap check (handles missing/extra letters)
  // "borsuca" vs "borsucza" - missing 'z'
  let matchCount = 0;
  const targetChars = normTarget.split('');
  const inputChars = normInput.split('');
  
  for (const char of inputChars) {
    const idx = targetChars.indexOf(char);
    if (idx !== -1) {
      matchCount++;
      targetChars.splice(idx, 1); // Remove matched char
    }
  }
  
  // If 80%+ of input chars match target, consider it a match
  const matchRatio = matchCount / normInput.length;
  if (matchRatio >= 0.8) return true;
  
  // Levenshtein-lite: simple edit distance for short strings
  if (normInput.length <= 10 && normTarget.length <= 10) {
    let edits = 0;
    const longer = normInput.length > normTarget.length ? normInput : normTarget;
    const shorter = normInput.length > normTarget.length ? normTarget : normInput;
    
    let j = 0;
    for (let i = 0; i < longer.length && j < shorter.length; i++) {
      if (longer[i] === shorter[j]) {
        j++;
      } else {
        edits++;
      }
    }
    edits += (longer.length - j); // Remaining unmatched
    
    // Allow up to 2 edits for short strings
    if (edits <= 2) return true;
  }
  
  return false;
}

// ═══════════════════════════════════════════════════════════════
// Category search mappings
// ═══════════════════════════════════════════════════════════════

const CATEGORY_KEYWORDS: Record<string, { query: string; type: 'poi' }> = {
  'stacja': { query: 'stacja paliw', type: 'poi' },
  'stacja paliw': { query: 'stacja paliw', type: 'poi' },
  'benzyna': { query: 'stacja paliw', type: 'poi' },
  'paliwo': { query: 'stacja paliw', type: 'poi' },
  'tankowanie': { query: 'stacja paliw', type: 'poi' },
  'orlen': { query: 'orlen', type: 'poi' },
  'bp': { query: 'bp', type: 'poi' },
  'shell': { query: 'shell', type: 'poi' },
  'lotos': { query: 'lotos', type: 'poi' },
  'ładowarka': { query: 'charging station', type: 'poi' },
  'ladowarka': { query: 'charging station', type: 'poi' },
  'ładowanie': { query: 'charging station', type: 'poi' },
  'ev': { query: 'charging station', type: 'poi' },
  'elektryczna': { query: 'charging station', type: 'poi' },
  'parking': { query: 'parking', type: 'poi' },
  'parkowanie': { query: 'parking', type: 'poi' },
  'sklep': { query: 'sklep', type: 'poi' },
  'market': { query: 'supermarket', type: 'poi' },
  'supermarket': { query: 'supermarket', type: 'poi' },
  'biedronka': { query: 'biedronka', type: 'poi' },
  'lidl': { query: 'lidl', type: 'poi' },
  'żabka': { query: 'żabka', type: 'poi' },
  'zabka': { query: 'żabka', type: 'poi' },
  'restauracja': { query: 'restauracja', type: 'poi' },
  'jedzenie': { query: 'restauracja', type: 'poi' },
  'mcdonald': { query: 'mcdonalds', type: 'poi' },
  'kfc': { query: 'kfc', type: 'poi' },
};

/**
 * Check if query matches a category keyword
 */
function getCategoryQuery(query: string): string | null {
  const normalized = normalizeForComparison(query);
  
  for (const [keyword, config] of Object.entries(CATEGORY_KEYWORDS)) {
    if (normalized.includes(normalizeForComparison(keyword))) {
      return config.query;
    }
  }
  
  return null;
}

/**
 * Pobiera sugestie adresów z API Nominatim
 * Enhanced with fuzzy matching and category search
 */
export async function fetchAddressSuggestions(
  query: string,
  signal?: AbortSignal
): Promise<AddressSuggestion[]> {
  const trimmedQuery = query.trim();
  
  if (trimmedQuery.length < 2) {
    return [];
  }

  const cacheKey = normalizeForComparison(trimmedQuery);
  const cached = queryCache.get(cacheKey);

  // Zwróć z cache jeśli świeży
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    console.log('[autocompleteService] Cache hit for:', cacheKey);
    return cached.results;
  }

  // Check if query is a category search
  const categoryQuery = getCategoryQuery(trimmedQuery);
  const searchQuery = categoryQuery || trimmedQuery;

  try {
    let results = await performNominatimSearch(searchQuery, signal);
    
    // If no results and we have Polish chars, try without them
    if (results.length === 0 && /[ąćęłńóśźż]/i.test(trimmedQuery)) {
      const normalizedQuery = normalizePolish(trimmedQuery);
      console.log('[autocompleteService] Retrying with normalized query:', normalizedQuery);
      results = await performNominatimSearch(normalizedQuery, signal);
    }
    
    // If still no results, try fuzzy matching - common typos
    if (results.length === 0) {
      // Try adding common Polish endings that might be missing
      const fuzzyVariants = [
        trimmedQuery + 'a',   // borsucz -> borsucza
        trimmedQuery + 'za',  // borsu -> borsucza  
        trimmedQuery.slice(0, -1) + 'cza', // borsuca -> borsucza
        trimmedQuery.replace(/c([aeiou])/g, 'cz$1'), // ca -> cza
      ];
      
      for (const variant of fuzzyVariants) {
        if (variant !== trimmedQuery && variant.length >= 3) {
          console.log('[autocompleteService] Trying fuzzy variant:', variant);
          results = await performNominatimSearch(variant, signal);
          if (results.length > 0) break;
        }
      }
    }
    
    // If still no results, try removing house number
    if (results.length === 0) {
      const withoutNumber = trimmedQuery.replace(/\s+\d+[a-zA-Z]?$/, '').trim();
      if (withoutNumber !== trimmedQuery && withoutNumber.length >= 2) {
        console.log('[autocompleteService] Retrying without number:', withoutNumber);
        results = await performNominatimSearch(withoutNumber, signal);
      }
    }

    // Zapisz do cache
    queryCache.set(cacheKey, { results, timestamp: Date.now() });

    // Ogranicz rozmiar cache
    if (queryCache.size > MAX_CACHE_SIZE) {
      const firstKey = queryCache.keys().next().value;
      if (firstKey) queryCache.delete(firstKey);
    }

    console.log('[autocompleteService] Fetched', results.length, 'results for:', trimmedQuery);
    return results;

  } catch (error) {
    if ((error as Error).name === 'AbortError') {
      console.log('[autocompleteService] Request aborted for:', trimmedQuery);
      return [];
    }
    console.error('[autocompleteService] Error:', error);
    return [];
  }
}

/**
 * Perform actual Nominatim search
 */
async function performNominatimSearch(
  query: string,
  signal?: AbortSignal
): Promise<AddressSuggestion[]> {
  const params = new URLSearchParams({
    q: query,
    format: 'json',
    addressdetails: '1',
    limit: '8',
    countrycodes: 'pl', // Tylko Polska
    dedupe: '1',
  });

  const response = await fetch(
    `https://nominatim.openstreetmap.org/search?${params}`,
    {
      headers: {
        'User-Agent': 'GetRidoMaps/1.0 (https://getrido.pl)',
        'Accept-Language': 'pl',
      },
      signal,
    }
  );

  if (!response.ok) {
    throw new Error(`Nominatim error: ${response.status}`);
  }

  const data: NominatimResult[] = await response.json();
  
  return data.map((item) => ({
    placeId: String(item.place_id),
    displayName: item.display_name,
    shortName: formatShortName(item),
    type: determineType(item),
    lat: parseFloat(item.lat),
    lng: parseFloat(item.lon),
  }));
}

/**
 * Formatuje krótką nazwę lokalizacji
 */
function formatShortName(result: NominatimResult): string {
  const addr = result.address;
  if (!addr) {
    // Fallback: weź pierwszą część display_name
    const parts = result.display_name.split(',');
    return parts.slice(0, 2).join(',').trim();
  }

  const parts: string[] = [];

  // Ulica + numer
  if (addr.road) {
    if (addr.house_number) {
      parts.push(`${addr.road} ${addr.house_number}`);
    } else {
      parts.push(addr.road);
    }
  }

  // Miasto
  const city = addr.city || addr.town || addr.village || addr.municipality;
  if (city && !parts.includes(city)) {
    parts.push(city);
  }

  if (parts.length === 0) {
    // Fallback
    return result.display_name.split(',')[0].trim();
  }

  return parts.join(', ');
}

/**
 * Określa typ lokalizacji
 */
function determineType(result: NominatimResult): AddressSuggestion['type'] {
  const { type, class: cls } = result;

  // Miasta
  if (type === 'city' || type === 'town' || type === 'village' || type === 'municipality') {
    return 'city';
  }

  // Ulice
  if (type === 'road' || type === 'street' || cls === 'highway') {
    return 'street';
  }

  // POI (punkty zainteresowania)
  if (
    cls === 'amenity' ||
    cls === 'shop' ||
    cls === 'tourism' ||
    cls === 'leisure' ||
    cls === 'railway' ||
    cls === 'aeroway'
  ) {
    return 'poi';
  }

  // Domyślnie adres
  return 'address';
}

/**
 * Czyści cache (do testów)
 */
export function clearAutocompleteCache(): void {
  queryCache.clear();
}
