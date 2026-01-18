// GetRido Maps - Routing Service
// Uses OSRM (Open Source Routing Machine) for free routing
// Uses Nominatim for geocoding

export interface Coordinates {
  lat: number;
  lng: number;
}

export interface RouteManeuver {
  type: string;
  modifier?: string;
  location: [number, number]; // [lng, lat]
  bearing_before?: number;
  bearing_after?: number;
  exit?: number; // For roundabouts
}

export interface LaneInfo {
  indications: string[];
  valid: boolean;
}

export interface RouteStep {
  distance: number; // meters
  duration: number; // seconds
  name: string;
  maneuver: RouteManeuver;
  intersections?: {
    lanes?: LaneInfo[];
    location: [number, number];
  }[];
  maxspeed?: number; // km/h if available
}

export interface RouteResult {
  coordinates: [number, number][]; // [lng, lat] pairs for GeoJSON
  distance: number; // in kilometers
  duration: number; // in minutes
  startPoint: Coordinates;
  endPoint: Coordinates;
  isAlternative?: boolean;
  routeType?: 'standard' | 'alternative';
  steps?: RouteStep[]; // Turn-by-turn instructions
}

export interface RouteOption {
  id: string;
  coordinates: [number, number][];
  distance: number;  // km
  duration: number;  // min
  stepsCount: number;
  turnsCount: number;  // left/right/uturn
  steps?: RouteStep[];
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
  end: Coordinates,
  options?: { alternatives?: boolean; isAlternative?: boolean; includeSteps?: boolean }
): Promise<RouteResult | null> {
  try {
    // OSRM expects coordinates in lng,lat format
    const coordinates = `${start.lng},${start.lat};${end.lng},${end.lat}`;
    
    const params = new URLSearchParams({
      overview: 'full',
      geometries: 'geojson',
      steps: options?.includeSteps ? 'true' : 'false',
      annotations: 'maxspeed,speed',
    });
    
    // Request alternatives if specified
    if (options?.alternatives) {
      params.set('alternatives', 'true');
    }

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
    
    // Parse steps if available
    let steps: RouteStep[] | undefined;
    if (options?.includeSteps && route.legs) {
      steps = [];
      for (const leg of route.legs) {
        for (const step of leg.steps || []) {
          steps.push({
            distance: step.distance,
            duration: step.duration,
            name: step.name || '',
            maneuver: {
              type: step.maneuver?.type || 'turn',
              modifier: step.maneuver?.modifier,
              location: step.maneuver?.location || [0, 0],
              bearing_before: step.maneuver?.bearing_before,
              bearing_after: step.maneuver?.bearing_after,
              exit: step.maneuver?.exit,
            },
            intersections: step.intersections?.map((int: any) => ({
              lanes: int.lanes?.map((lane: any) => ({
                indications: lane.indications || [],
                valid: lane.valid || false,
              })),
              location: int.location,
            })),
            maxspeed: step.maxspeed?.speed,
          });
        }
      }
    }
    
    return {
      coordinates: route.geometry.coordinates, // Already in [lng, lat] format
      distance: route.distance / 1000, // Convert meters to km
      duration: route.duration / 60, // Convert seconds to minutes
      startPoint: start,
      endPoint: end,
      isAlternative: options?.isAlternative || false,
      routeType: options?.isAlternative ? 'alternative' : 'standard',
      steps,
    };
  } catch (error) {
    console.error('[Routing] Route calculation error:', error);
    return null;
  }
}

/**
 * Calculate routes with step analysis for "Fastest" vs "Simplest" selection
 */
export async function calculateRoutesWithOptions(
  start: Coordinates,
  end: Coordinates
): Promise<RouteOption[]> {
  try {
    const coordinates = `${start.lng},${start.lat};${end.lng},${end.lat}`;
    
    const params = new URLSearchParams({
      overview: 'full',
      geometries: 'geojson',
      steps: 'true',        // CRITICAL: get step-by-step instructions
      alternatives: 'true',  // Get alternative routes
    });

    const response = await fetch(
      `${OSRM_API}/route/v1/driving/${coordinates}?${params}`
    );

    if (!response.ok) {
      throw new Error('Routing failed');
    }

    const data = await response.json();

    if (data.code !== 'Ok' || !data.routes) {
      console.error('[Routing] No routes found:', data);
      return [];
    }

    return data.routes.map((route: any, idx: number) => {
      // Count steps and turns + parse step data
      let stepsCount = 0;
      let turnsCount = 0;
      const parsedSteps: RouteStep[] = [];

      for (const leg of route.legs || []) {
        for (const step of leg.steps || []) {
          stepsCount++;
          const maneuver = step.maneuver;
          if (maneuver) {
            // Count turns (left, right, sharp turns, u-turns)
            const turnTypes = ['turn', 'end of road', 'fork', 'new name'];
            const turnModifiers = ['left', 'right', 'sharp left', 'sharp right', 'uturn', 'slight left', 'slight right'];
            
            if (turnTypes.includes(maneuver.type) && turnModifiers.includes(maneuver.modifier)) {
              turnsCount++;
            }
          }
          
          // Parse step for voice navigation
          parsedSteps.push({
            distance: step.distance,
            duration: step.duration,
            name: step.name || '',
            maneuver: {
              type: maneuver?.type || 'turn',
              modifier: maneuver?.modifier,
              location: maneuver?.location || [0, 0],
              bearing_before: maneuver?.bearing_before,
              bearing_after: maneuver?.bearing_after,
              exit: maneuver?.exit,
            },
            intersections: step.intersections?.map((int: any) => ({
              lanes: int.lanes?.map((lane: any) => ({
                indications: lane.indications || [],
                valid: lane.valid || false,
              })),
              location: int.location,
            })),
            maxspeed: step.maxspeed?.speed,
          });
        }
      }

      return {
        id: `route-${idx}`,
        coordinates: route.geometry.coordinates,
        distance: route.distance / 1000,
        duration: route.duration / 60,
        stepsCount,
        turnsCount,
        steps: parsedSteps,
      };
    });
  } catch (error) {
    console.error('[Routing] Routes calculation error:', error);
    return [];
  }
}

/**
 * Select best route based on mode
 */
export function selectBestRoute(
  routes: RouteOption[],
  mode: 'fastest' | 'simplest'
): RouteOption | null {
  if (!routes.length) return null;

  if (mode === 'fastest') {
    return routes.reduce((a, b) => a.duration < b.duration ? a : b);
  }

  // Simplest: fewest turns, then shortest duration as tiebreaker
  return routes.reduce((a, b) => {
    if (a.turnsCount !== b.turnsCount) {
      return a.turnsCount < b.turnsCount ? a : b;
    }
    return a.duration < b.duration ? a : b;
  });
}

/**
 * Calculate alternative route using OSRM alternatives
 */
export async function calculateAlternativeRoute(
  start: Coordinates,
  end: Coordinates
): Promise<RouteResult | null> {
  try {
    const coordinates = `${start.lng},${start.lat};${end.lng},${end.lat}`;
    
    const params = new URLSearchParams({
      overview: 'full',
      geometries: 'geojson',
      steps: 'false',
      alternatives: 'true',
    });

    const response = await fetch(
      `${OSRM_API}/route/v1/driving/${coordinates}?${params}`
    );

    if (!response.ok) {
      throw new Error('Alternative routing failed');
    }

    const data = await response.json();

    if (data.code !== 'Ok' || !data.routes || data.routes.length < 2) {
      console.log('[Routing] No alternative found, trying different approach');
      return null;
    }

    // Return the second route as alternative
    const route = data.routes[1];
    
    return {
      coordinates: route.geometry.coordinates,
      distance: route.distance / 1000,
      duration: route.duration / 60,
      startPoint: start,
      endPoint: end,
      isAlternative: true,
      routeType: 'alternative',
    };
  } catch (error) {
    console.error('[Routing] Alternative route calculation error:', error);
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
