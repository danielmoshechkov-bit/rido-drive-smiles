// GetRido Maps - Address Autocomplete Service (Nominatim/OSM)

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

/**
 * Pobiera sugestie adresów z API Nominatim
 */
export async function fetchAddressSuggestions(
  query: string,
  signal?: AbortSignal
): Promise<AddressSuggestion[]> {
  const trimmedQuery = query.trim();
  
  if (trimmedQuery.length < 2) {
    return [];
  }

  const cacheKey = trimmedQuery.toLowerCase();
  const cached = queryCache.get(cacheKey);

  // Zwróć z cache jeśli świeży
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    console.log('[autocompleteService] Cache hit for:', cacheKey);
    return cached.results;
  }

  try {
    const params = new URLSearchParams({
      q: trimmedQuery,
      format: 'json',
      addressdetails: '1',
      limit: '6',
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
    
    const results = data.map((item) => ({
      placeId: String(item.place_id),
      displayName: item.display_name,
      shortName: formatShortName(item),
      type: determineType(item),
      lat: parseFloat(item.lat),
      lng: parseFloat(item.lon),
    }));

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
