/**
 * GetRido Maps - POI Service
 * Fetches POI from Overpass API (OSM) and Supabase (Partners)
 */
import { supabase } from '@/integrations/supabase/client';

export interface POI {
  id: string;
  name: string;
  category: 'fuel' | 'parking' | 'ev_charger' | 'shop' | 'restaurant' | 'hotel' | 'service' | 'custom';
  lat: number;
  lng: number;
  address?: string;
  city?: string;
  phone?: string;
  website?: string;
  paymentSupported?: boolean;
  isPartner?: boolean;
  logoUrl?: string;
  openingHours?: string;
  description?: string;
  source: 'osm' | 'partner';
  distance?: number; // Distance from user in km
}

export interface BoundingBox {
  minLat: number;
  minLng: number;
  maxLat: number;
  maxLng: number;
}

// Cache for POI data
interface POICache {
  bbox: string;
  pois: POI[];
  fetchedAt: number;
}

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const COOLDOWN = 10 * 1000; // 10s between fetches
let cache: POICache | null = null;
let lastFetchTime = 0;

// Category to Overpass query mapping
const OVERPASS_CATEGORY_QUERIES: Record<string, string> = {
  fuel: 'node["amenity"="fuel"]',
  parking: 'node["amenity"="parking"]',
  ev_charger: 'node["amenity"="charging_station"]',
  shop: 'node["shop"]',
  restaurant: 'node["amenity"="restaurant"]',
  hotel: 'node["tourism"="hotel"]',
};

/**
 * Fetch POI from Overpass API for given bbox and categories
 */
async function fetchOverpassPOI(
  bbox: BoundingBox,
  categories: string[] = ['fuel', 'ev_charger', 'parking']
): Promise<POI[]> {
  const bboxStr = `${bbox.minLat},${bbox.minLng},${bbox.maxLat},${bbox.maxLng}`;
  
  // Build query for selected categories
  const categoryQueries = categories
    .filter(cat => OVERPASS_CATEGORY_QUERIES[cat])
    .map(cat => `${OVERPASS_CATEGORY_QUERIES[cat]}(${bboxStr});`)
    .join('\n');
  
  if (!categoryQueries) return [];
  
  const query = `
    [out:json][timeout:10];
    (
      ${categoryQueries}
    );
    out body 30;
  `;
  
  try {
    const response = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      body: `data=${encodeURIComponent(query)}`,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    
    if (!response.ok) {
      console.error('[poiService] Overpass error:', response.status);
      return [];
    }
    
    const data = await response.json();
    
    return data.elements.map((el: any): POI | null => {
      if (!el.lat || !el.lon) return null;
      
      const tags = el.tags || {};
      let category: POI['category'] = 'custom';
      
      if (tags.amenity === 'fuel') category = 'fuel';
      else if (tags.amenity === 'parking') category = 'parking';
      else if (tags.amenity === 'charging_station') category = 'ev_charger';
      else if (tags.amenity === 'restaurant') category = 'restaurant';
      else if (tags.shop) category = 'shop';
      else if (tags.tourism === 'hotel') category = 'hotel';
      
      return {
        id: `osm-${el.id}`,
        name: tags.name || getCategoryLabel(category),
        category,
        lat: el.lat,
        lng: el.lon,
        address: tags['addr:street'] ? `${tags['addr:street']} ${tags['addr:housenumber'] || ''}`.trim() : undefined,
        city: tags['addr:city'],
        phone: tags.phone,
        website: tags.website,
        openingHours: tags.opening_hours,
        source: 'osm',
      };
    }).filter((p: POI | null): p is POI => p !== null);
    
  } catch (error) {
    console.error('[poiService] Overpass fetch error:', error);
    return [];
  }
}

/**
 * Fetch partner POI from Supabase
 */
async function fetchPartnerPOI(bbox: BoundingBox): Promise<POI[]> {
  try {
    const { data, error } = await supabase
      .from('map_poi_partners')
      .select('*')
      .eq('is_active', true)
      .gte('lat', bbox.minLat)
      .lte('lat', bbox.maxLat)
      .gte('lng', bbox.minLng)
      .lte('lng', bbox.maxLng)
      .limit(50);
    
    if (error) {
      console.error('[poiService] Supabase error:', error);
      return [];
    }
    
    return (data || []).map((p: any): POI => ({
      id: `partner-${p.id}`,
      name: p.name,
      category: p.category,
      lat: p.lat,
      lng: p.lng,
      address: p.address,
      city: p.city,
      phone: p.phone,
      website: p.website,
      paymentSupported: p.payment_supported,
      isPartner: true,
      logoUrl: p.logo_url,
      openingHours: p.opening_hours,
      description: p.description,
      source: 'partner',
    }));
    
  } catch (error) {
    console.error('[poiService] Partner fetch error:', error);
    return [];
  }
}

/**
 * Get user-friendly category label
 */
export function getCategoryLabel(category: POI['category']): string {
  switch (category) {
    case 'fuel': return 'Stacja paliw';
    case 'parking': return 'Parking';
    case 'ev_charger': return 'Ładowarka EV';
    case 'shop': return 'Sklep';
    case 'restaurant': return 'Restauracja';
    case 'hotel': return 'Hotel';
    case 'service': return 'Serwis';
    default: return 'Punkt';
  }
}

/**
 * Get category icon name (Lucide)
 */
export function getCategoryIcon(category: POI['category']): string {
  switch (category) {
    case 'fuel': return 'Fuel';
    case 'parking': return 'ParkingCircle';
    case 'ev_charger': return 'Zap';
    case 'shop': return 'ShoppingBag';
    case 'restaurant': return 'UtensilsCrossed';
    case 'hotel': return 'Bed';
    case 'service': return 'Wrench';
    default: return 'MapPin';
  }
}

/**
 * Calculate distance between two points (Haversine)
 */
export function calculateDistance(
  lat1: number, lng1: number,
  lat2: number, lng2: number
): number {
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
 * Main POI Service
 */
export const poiService = {
  /**
   * Fetch all POI for bbox (OSM + Partners)
   */
  async fetchPOI(
    bbox: BoundingBox,
    categories: string[] = ['fuel', 'ev_charger', 'parking'],
    userLocation?: { lat: number; lng: number }
  ): Promise<POI[]> {
    const bboxKey = `${bbox.minLat.toFixed(3)},${bbox.minLng.toFixed(3)},${bbox.maxLat.toFixed(3)},${bbox.maxLng.toFixed(3)}`;
    
    // Check cache
    if (cache && cache.bbox === bboxKey && Date.now() - cache.fetchedAt < CACHE_TTL) {
      console.log('[poiService] Returning cached POI');
      return cache.pois;
    }
    
    // Check cooldown
    if (Date.now() - lastFetchTime < COOLDOWN) {
      console.log('[poiService] Cooldown active');
      return cache?.pois || [];
    }
    
    lastFetchTime = Date.now();
    
    // Fetch from both sources in parallel
    const [osmPOI, partnerPOI] = await Promise.all([
      fetchOverpassPOI(bbox, categories),
      fetchPartnerPOI(bbox),
    ]);
    
    // Combine and sort (partners first, then by distance if user location available)
    let allPOI = [...partnerPOI, ...osmPOI];
    
    // Add distance if user location provided
    if (userLocation) {
      allPOI = allPOI.map(poi => ({
        ...poi,
        distance: calculateDistance(userLocation.lat, userLocation.lng, poi.lat, poi.lng),
      }));
      
      // Sort: partners first, then by distance
      allPOI.sort((a, b) => {
        if (a.isPartner && !b.isPartner) return -1;
        if (!a.isPartner && b.isPartner) return 1;
        return (a.distance || 0) - (b.distance || 0);
      });
    }
    
    // Limit total
    allPOI = allPOI.slice(0, 100);
    
    console.log(`[poiService] Fetched ${allPOI.length} POI (${partnerPOI.length} partners, ${osmPOI.length} OSM)`);
    
    cache = { bbox: bboxKey, pois: allPOI, fetchedAt: Date.now() };
    return allPOI;
  },
  
  /**
   * Search POI by name/category
   */
  searchPOI(pois: POI[], query: string): POI[] {
    const q = query.toLowerCase().trim();
    if (!q) return pois;
    
    return pois.filter(poi => 
      poi.name.toLowerCase().includes(q) ||
      getCategoryLabel(poi.category).toLowerCase().includes(q) ||
      poi.address?.toLowerCase().includes(q) ||
      poi.city?.toLowerCase().includes(q)
    );
  },
  
  /**
   * Filter POI by category
   */
  filterByCategory(pois: POI[], categories: POI['category'][]): POI[] {
    if (categories.length === 0) return pois;
    return pois.filter(poi => categories.includes(poi.category));
  },
  
  /**
   * Clear cache
   */
  clearCache(): void {
    cache = null;
  },
  
  /**
   * Check if can refresh
   */
  canRefresh(): boolean {
    return Date.now() - lastFetchTime >= COOLDOWN;
  },
};
