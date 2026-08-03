// GetRido — geokodowanie adresów (Nominatim / OSM, bez kluczy API)
// Używane przy zapisie danych firmy, aby usługodawca automatycznie
// pojawił się na mapie GetRido.

export interface GeocodeResult {
  lat: number;
  lng: number;
  displayName: string;
}

const cache = new Map<string, GeocodeResult | null>();

export function buildFullAddress(parts: {
  address?: string | null;
  postalCode?: string | null;
  city?: string | null;
}): string {
  return [parts.address, [parts.postalCode, parts.city].filter(Boolean).join(' '), 'Polska']
    .filter(Boolean)
    .join(', ')
    .trim();
}

export async function geocodeAddress(query: string): Promise<GeocodeResult | null> {
  const q = query.trim();
  if (q.length < 5) return null;
  if (cache.has(q)) return cache.get(q) ?? null;

  try {
    const url =
      `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=pl&q=${encodeURIComponent(q)}`;
    const res = await fetch(url, { headers: { 'Accept-Language': 'pl' } });
    if (!res.ok) throw new Error(`Nominatim ${res.status}`);
    const json = await res.json();
    const hit = Array.isArray(json) ? json[0] : null;
    const result: GeocodeResult | null = hit
      ? { lat: parseFloat(hit.lat), lng: parseFloat(hit.lon), displayName: hit.display_name }
      : null;
    cache.set(q, result);
    return result;
  } catch (e) {
    console.warn('[geocode] błąd geokodowania:', e);
    return null;
  }
}
