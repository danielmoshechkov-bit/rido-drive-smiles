// GetRido Maps - Routing Service
// Uses OSRM (Open Source Routing Machine) for free routing
// Uses Nominatim for geocoding

export interface Coordinates {
  lat: number;
  lng: number;
}

export interface RouteResult {
  coordinates: [number, number][]; // [lng, lat] pairs for GeoJSON
  distance: number; // in kilometers
  duration: number; // in minutes
  startPoint: Coordinates;
  endPoint: Coordinates;
}

export interface GeocodingResult {
  lat: number;
  lng: number;
  displayName: string;
}

// OSRM Demo server (free, rate-limited)
const OSRM_API = 'https://router.project-osrm.org';

// Nominatim (OSM Geocoding)
const NOMINATIM_API = 'https://nominatim.openstreetmap.org';

/**
 * Geocode an address to coordinates using Nominatim
 */
export async function geocodeAddress(address: string): Promise<GeocodingResult | null> {
  try {
    const params = new URLSearchParams({
      q: address,
      format: 'json',
      limit: '1',
      countrycodes: 'pl', // Focus on Poland
    });

    const response = await fetch(`${NOMINATIM_API}/search?${params}`, {
      headers: {
        'User-Agent': 'GetRidoMaps/1.0',
      },
    });

    if (!response.ok) {
      throw new Error('Geocoding failed');
    }

    const data = await response.json();
    
    if (data.length === 0) {
      return null;
    }

    return {
      lat: parseFloat(data[0].lat),
      lng: parseFloat(data[0].lon),
      displayName: data[0].display_name,
    };
  } catch (error) {
    console.error('[Routing] Geocoding error:', error);
    return null;
  }
}

/**
 * Calculate route between two points using OSRM
 */
export async function calculateRoute(
  start: Coordinates,
  end: Coordinates
): Promise<RouteResult | null> {
  try {
    // OSRM expects coordinates in lng,lat format
    const coordinates = `${start.lng},${start.lat};${end.lng},${end.lat}`;
    
    const params = new URLSearchParams({
      overview: 'full',
      geometries: 'geojson',
      steps: 'false',
    });

    const response = await fetch(
      `${OSRM_API}/route/v1/driving/${coordinates}?${params}`
    );

    if (!response.ok) {
      throw new Error('Routing failed');
    }

    const data = await response.json();

    if (data.code !== 'Ok' || !data.routes || data.routes.length === 0) {
      console.error('[Routing] No route found:', data);
      return null;
    }

    const route = data.routes[0];
    
    return {
      coordinates: route.geometry.coordinates, // Already in [lng, lat] format
      distance: route.distance / 1000, // Convert meters to km
      duration: route.duration / 60, // Convert seconds to minutes
      startPoint: start,
      endPoint: end,
    };
  } catch (error) {
    console.error('[Routing] Route calculation error:', error);
    return null;
  }
}

/**
 * Parse user input - could be coordinates or address
 */
export function parseCoordinates(input: string): Coordinates | null {
  // Try to parse as coordinates (lat, lng or lat lng)
  const coordPattern = /^(-?\d+\.?\d*)[,\s]+(-?\d+\.?\d*)$/;
  const match = input.trim().match(coordPattern);
  
  if (match) {
    const lat = parseFloat(match[1]);
    const lng = parseFloat(match[2]);
    
    // Basic validation for Poland area
    if (lat >= 49 && lat <= 55 && lng >= 14 && lng <= 25) {
      return { lat, lng };
    }
  }
  
  return null;
}

/**
 * Get location from user input (coordinates or address)
 */
export async function resolveLocation(input: string): Promise<GeocodingResult | null> {
  // First try to parse as coordinates
  const coords = parseCoordinates(input);
  if (coords) {
    return {
      ...coords,
      displayName: `${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}`,
    };
  }
  
  // Otherwise geocode the address
  return geocodeAddress(input);
}
