/**
 * GetRido Maps - Incidents Service (Overpass API / OSM + Community)
 * Pobiera zdarzenia drogowe z publicznych źródeł i zgłoszeń społeczności
 */
import { supabase } from '@/integrations/supabase/client';

export interface Incident {
  id: string;
  type: 'roadwork' | 'closure' | 'construction' | 'event' | 'police' | 'accident' | 'traffic' | 'hazard' | 'speed_cam' | 'red_light_cam';
  title: string;
  lat: number;
  lng: number;
  source: 'osm' | 'community' | 'static';
  fetchedAt: Date;
  expiresAt?: Date;
  isOnRoute?: boolean; // Flag to indicate if incident is on current route
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
 * Calculates minimum distance from a point to a line segment (in meters)
 * Uses approximation for short distances
 */
function distancePointToSegment(
  point: { lat: number; lng: number },
  segmentStart: [number, number], // [lng, lat]
  segmentEnd: [number, number]
): number {
  const x = point.lng;
  const y = point.lat;
  const x1 = segmentStart[0];
  const y1 = segmentStart[1];
  const x2 = segmentEnd[0];
  const y2 = segmentEnd[1];

  const A = x - x1;
  const B = y - y1;
  const C = x2 - x1;
  const D = y2 - y1;

  const dot = A * C + B * D;
  const lenSq = C * C + D * D;
  let param = -1;

  if (lenSq !== 0) {
    param = dot / lenSq;
  }

  let xx: number, yy: number;

  if (param < 0) {
    xx = x1;
    yy = y1;
  } else if (param > 1) {
    xx = x2;
    yy = y2;
  } else {
    xx = x1 + param * C;
    yy = y1 + param * D;
  }

  const dx = x - xx;
  const dy = y - yy;

  // Convert to meters (approximate at mid-latitudes)
  const latMid = (y + yy) / 2;
  const metersPerDegreeLat = 111320;
  const metersPerDegreeLng = 111320 * Math.cos(latMid * Math.PI / 180);

  return Math.sqrt(
    Math.pow(dx * metersPerDegreeLng, 2) + 
    Math.pow(dy * metersPerDegreeLat, 2)
  );
}

/**
 * Get minimum distance from a point to any segment in the route
 */
function getMinDistanceToRoute(
  point: { lat: number; lng: number },
  routeCoords: [number, number][] // Array of [lng, lat]
): number {
  if (routeCoords.length < 2) return Infinity;

  let minDistance = Infinity;

  for (let i = 0; i < routeCoords.length - 1; i++) {
    const distance = distancePointToSegment(point, routeCoords[i], routeCoords[i + 1]);
    if (distance < minDistance) {
      minDistance = distance;
    }
  }

  return minDistance;
}

/**
 * Filter incidents to only those within maxDistanceMeters of the route
 * Marks incidents as "on route" for UI differentiation
 */
export function filterIncidentsNearRoute(
  incidents: Incident[],
  routeCoords: [number, number][], // Array of [lng, lat] from GeoJSON
  maxDistanceMeters: number = 200
): Incident[] {
  if (!routeCoords || routeCoords.length < 2) return incidents;
  
  return incidents
    .map(incident => {
      const distance = getMinDistanceToRoute(
        { lat: incident.lat, lng: incident.lng },
        routeCoords
      );
      return {
        ...incident,
        isOnRoute: distance <= maxDistanceMeters,
      };
    })
    .filter(incident => incident.isOnRoute);
}

/**
 * Filter incidents in driving direction (for when no route is active)
 * Shows only incidents ahead of user within angle and distance limits
 */
export function filterIncidentsInDrivingDirection(
  incidents: Incident[],
  userLocation: { lat: number; lng: number },
  heading: number, // 0-360 degrees
  maxDistanceKm: number = 1.5,
  maxAngleDeg: number = 60
): Incident[] {
  return incidents.filter(incident => {
    // Calculate distance
    const distance = calculateDistanceKm(
      userLocation.lat, userLocation.lng,
      incident.lat, incident.lng
    );
    
    if (distance > maxDistanceKm) return false;
    
    // Calculate bearing to incident
    const bearing = calculateBearing(
      userLocation.lat, userLocation.lng,
      incident.lat, incident.lng
    );
    
    // Calculate angle difference
    let angleDiff = Math.abs(bearing - heading);
    if (angleDiff > 180) angleDiff = 360 - angleDiff;
    
    return angleDiff <= maxAngleDeg;
  });
}

/**
 * Calculate distance between two points in km (Haversine)
 */
function calculateDistanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371; // Earth radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Calculate bearing from point 1 to point 2 (in degrees 0-360)
 */
function calculateBearing(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const lat1Rad = lat1 * Math.PI / 180;
  const lat2Rad = lat2 * Math.PI / 180;
  
  const y = Math.sin(dLng) * Math.cos(lat2Rad);
  const x = Math.cos(lat1Rad) * Math.sin(lat2Rad) - 
            Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLng);
  
  let bearing = Math.atan2(y, x) * 180 / Math.PI;
  return (bearing + 360) % 360;
}

/**
 * Get incident type label in Polish
 */
export function getIncidentTypeLabel(type: Incident['type']): string {
  switch (type) {
    case 'police': return 'Policja';
    case 'accident': return 'Wypadek';
    case 'traffic': return 'Korek';
    case 'roadwork': return 'Roboty drogowe';
    case 'hazard': return 'Zagrożenie';
    case 'closure': return 'Droga zamknięta';
    case 'speed_cam': return 'Fotoradar';
    case 'red_light_cam': return 'Kamera na światłach';
    case 'construction': return 'Prace budowlane';
    case 'event': return 'Wydarzenie';
    default: return 'Zdarzenie';
  }
}

/**
 * Fetch community reports from Supabase
 */
async function fetchCommunityReports(bbox: BoundingBox): Promise<Incident[]> {
  try {
    const { data, error } = await supabase
      .from('map_reports')
      .select('*')
      .eq('status', 'approved')
      .gte('expires_at', new Date().toISOString())
      .gte('lat', bbox.minLat)
      .lte('lat', bbox.maxLat)
      .gte('lng', bbox.minLng)
      .lte('lng', bbox.maxLng)
      .limit(50);

    if (error) {
      console.error('[incidentsService] Community reports error:', error);
      return [];
    }

    return (data || []).map((r: any): Incident => ({
      id: `community-${r.id}`,
      type: r.type as Incident['type'],
      title: getIncidentTypeLabel(r.type),
      lat: r.lat,
      lng: r.lng,
      source: 'community',
      fetchedAt: new Date(),
      expiresAt: new Date(r.expires_at),
    }));
  } catch (error) {
    console.error('[incidentsService] Community fetch error:', error);
    return [];
  }
}

/**
 * Fetch static hazards (radars, cameras) from Supabase
 */
async function fetchStaticHazards(bbox: BoundingBox): Promise<Incident[]> {
  try {
    const { data, error } = await supabase
      .from('map_static_hazards')
      .select('*')
      .eq('is_active', true)
      .gte('lat', bbox.minLat)
      .lte('lat', bbox.maxLat)
      .gte('lng', bbox.minLng)
      .lte('lng', bbox.maxLng)
      .limit(100);

    if (error) {
      console.error('[incidentsService] Static hazards error:', error);
      return [];
    }

    return (data || []).map((h: any): Incident => ({
      id: `static-${h.id}`,
      type: h.type as Incident['type'],
      title: getIncidentTypeLabel(h.type) + (h.speed_limit ? ` (${h.speed_limit} km/h)` : ''),
      lat: h.lat,
      lng: h.lng,
      source: 'static',
      fetchedAt: new Date(),
    }));
  } catch (error) {
    console.error('[incidentsService] Static hazards fetch error:', error);
    return [];
  }
}

/**
 * Serwis do pobierania zdarzeń drogowych z Overpass API (OSM) + Community + Static
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
