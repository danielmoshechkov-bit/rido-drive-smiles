/**
 * GetRido Maps - Incidents Service (Overpass API / OSM)
 * Pobiera zdarzenia drogowe z publicznych źródeł
 */
export interface Incident {
  id: string;
  type: 'roadwork' | 'closure' | 'construction' | 'event';
  title: string;
  lat: number;
  lng: number;
  source: 'osm';
  fetchedAt: Date;
}

export interface BoundingBox {
  minLat: number;
  minLng: number;
  maxLat: number;
  maxLng: number;
}

interface IncidentCache {
  bbox: string;
  incidents: Incident[];
  fetchedAt: number;
}

const CACHE_TTL = 3 * 60 * 1000; // 3 min
const COOLDOWN = 30 * 1000; // 30s między odświeżeniami
let cache: IncidentCache | null = null;
let lastFetchTime = 0;

/**
 * Serwis do pobierania zdarzeń drogowych z Overpass API (OSM)
 */
export const incidentsService = {
  /**
   * Pobierz zdarzenia dla danego bounding boxa
   */
  async fetchIncidents(bbox: BoundingBox): Promise<Incident[]> {
    const bboxKey = `${bbox.minLat.toFixed(3)},${bbox.minLng.toFixed(3)},${bbox.maxLat.toFixed(3)},${bbox.maxLng.toFixed(3)}`;
    
    // Sprawdź cache
    if (cache && cache.bbox === bboxKey && Date.now() - cache.fetchedAt < CACHE_TTL) {
      console.log('[incidentsService] Returning cached incidents');
      return cache.incidents;
    }
    
    // Sprawdź cooldown
    if (Date.now() - lastFetchTime < COOLDOWN) {
      console.log('[incidentsService] Cooldown active, returning cached or empty');
      return cache?.incidents || [];
    }
    
    lastFetchTime = Date.now();
    
    try {
      // Overpass query dla zdarzeń drogowych
      const query = `
        [out:json][timeout:10];
        (
          way["highway"="construction"](${bbox.minLat},${bbox.minLng},${bbox.maxLat},${bbox.maxLng});
          way["access"="no"]["highway"](${bbox.minLat},${bbox.minLng},${bbox.maxLat},${bbox.maxLng});
          node["highway"="construction"](${bbox.minLat},${bbox.minLng},${bbox.maxLat},${bbox.maxLng});
          way["construction"](${bbox.minLat},${bbox.minLng},${bbox.maxLat},${bbox.maxLng});
        );
        out center;
      `;
      
      const response = await fetch('https://overpass-api.de/api/interpreter', {
        method: 'POST',
        body: `data=${encodeURIComponent(query)}`,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });
      
      if (!response.ok) {
        console.error('[incidentsService] Overpass API error:', response.status);
        return cache?.incidents || [];
      }
      
      const data = await response.json();
      
      const incidents: Incident[] = data.elements
        .map((el: any, idx: number) => {
          const lat = el.center?.lat || el.lat;
          const lng = el.center?.lon || el.lon;
          
          if (!lat || !lng) return null;
          
          const type: Incident['type'] = 
            el.tags?.highway === 'construction' || el.tags?.construction 
              ? 'roadwork' 
              : el.tags?.access === 'no' 
                ? 'closure' 
                : 'construction';
          
          const title = el.tags?.name || 
            (type === 'roadwork' ? 'Roboty drogowe' : 
             type === 'closure' ? 'Droga zamknięta' : 'Prace budowlane');
          
          return {
            id: `osm-${el.id || idx}`,
            type,
            title,
            lat,
            lng,
            source: 'osm' as const,
            fetchedAt: new Date(),
          };
        })
        .filter((i: Incident | null): i is Incident => i !== null);
      
      console.log(`[incidentsService] Fetched ${incidents.length} incidents from OSM`);
      
      cache = { bbox: bboxKey, incidents, fetchedAt: Date.now() };
      return incidents;
      
    } catch (error) {
      console.error('[incidentsService] Fetch error:', error);
      return cache?.incidents || [];
    }
  },
  
  /**
   * Czy można odświeżyć (cooldown)
   */
  canRefresh(): boolean {
    return Date.now() - lastFetchTime >= COOLDOWN;
  },
  
  /**
   * Ile sekund do końca cooldown
   */
  getCooldownRemaining(): number {
    return Math.max(0, Math.ceil((COOLDOWN - (Date.now() - lastFetchTime)) / 1000));
  },
  
  /**
   * Ostatni czas pobrania
   */
  getLastFetchTime(): Date | null {
    return lastFetchTime > 0 ? new Date(lastFetchTime) : null;
  },
  
  /**
   * Wyczyść cache (np. przy zmianie trasy)
   */
  clearCache(): void {
    cache = null;
  },
};
