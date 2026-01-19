// GetRido Maps - Map Matching Service
// Snaps GPS positions to route for smooth, road-locked navigation
// Premium quality: hysteresis, interpolation, off-route detection

export interface MapMatchedPosition {
  lat: number;
  lng: number;
  isSnapped: boolean;       // Whether position was snapped to route
  distanceToRoute: number;  // Distance from GPS to nearest route point (meters)
  routeProgress: number;    // Progress along route (0-1)
  snappedIdx: number;       // Index of nearest point on polyline
  bearing: number | null;   // Bearing from route segment
}

// ═══════════════════════════════════════════════════════════════
// MAP MATCHING CONSTANTS - Tuned for smooth navigation
// ═══════════════════════════════════════════════════════════════
const SNAP_THRESHOLD = 35;       // Max distance (m) to snap to route
const OFF_ROUTE_THRESHOLD = 60;  // Distance (m) to consider off-route
const HYSTERESIS_DISTANCE = 8;   // Min movement (m) before switching segments
const LOOKAHEAD_SEGMENTS = 10;   // How many segments ahead to search

// Haversine distance in meters
function haversineDistanceMeters(
  lat1: number, lng1: number,
  lat2: number, lng2: number
): number {
  const R = 6371000; // Earth radius in meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Calculate bearing between two points
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

// Project point onto line segment (perpendicular distance)
function projectPointOnSegment(
  px: number, py: number,  // Point (lat/lng)
  ax: number, ay: number,  // Segment start (lat/lng)
  bx: number, by: number   // Segment end (lat/lng)
): { lat: number; lng: number; t: number } {
  const dx = bx - ax;
  const dy = by - ay;
  
  if (dx === 0 && dy === 0) {
    // Segment is a point
    return { lat: ax, lng: ay, t: 0 };
  }
  
  // Parameter t: 0 = start, 1 = end
  let t = ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy);
  t = Math.max(0, Math.min(1, t)); // Clamp to segment
  
  return {
    lat: ax + t * dx,
    lng: ay + t * dy,
    t
  };
}

/**
 * Snap GPS position to route polyline with hysteresis
 * 
 * @param gpsLat - GPS latitude
 * @param gpsLng - GPS longitude
 * @param routeCoordinates - Route polyline [[lng, lat], ...] (GeoJSON format)
 * @param lastSnappedIdx - Previous snapped index (for hysteresis)
 * @returns Map-matched position
 */
export function snapToRoute(
  gpsLat: number,
  gpsLng: number,
  routeCoordinates: [number, number][],
  lastSnappedIdx: number = 0
): MapMatchedPosition {
  if (!routeCoordinates || routeCoordinates.length < 2) {
    return {
      lat: gpsLat,
      lng: gpsLng,
      isSnapped: false,
      distanceToRoute: 0,
      routeProgress: 0,
      snappedIdx: 0,
      bearing: null,
    };
  }

  let bestDistance = Infinity;
  let bestProjection = { lat: gpsLat, lng: gpsLng, t: 0 };
  let bestIdx = lastSnappedIdx;
  let bestBearing: number | null = null;
  
  // Search range: prefer forward movement (hysteresis)
  const searchStart = Math.max(0, lastSnappedIdx - 2);
  const searchEnd = Math.min(routeCoordinates.length - 1, lastSnappedIdx + LOOKAHEAD_SEGMENTS);
  
  for (let i = searchStart; i < searchEnd; i++) {
    const [lng1, lat1] = routeCoordinates[i];
    const [lng2, lat2] = routeCoordinates[i + 1];
    
    // Project GPS point onto this segment
    const projection = projectPointOnSegment(gpsLat, gpsLng, lat1, lng1, lat2, lng2);
    const distance = haversineDistanceMeters(gpsLat, gpsLng, projection.lat, projection.lng);
    
    // Prefer forward segments with hysteresis
    const hysteresisPenalty = i < lastSnappedIdx ? HYSTERESIS_DISTANCE : 0;
    const effectiveDistance = distance + hysteresisPenalty;
    
    if (effectiveDistance < bestDistance) {
      bestDistance = effectiveDistance;
      bestProjection = projection;
      bestIdx = i;
      bestBearing = calculateBearing(lat1, lng1, lat2, lng2);
    }
  }
  
  // Also check beyond lookahead if we're close to end
  if (searchEnd < routeCoordinates.length - 1) {
    for (let i = searchEnd; i < routeCoordinates.length - 1; i++) {
      const [lng1, lat1] = routeCoordinates[i];
      const [lng2, lat2] = routeCoordinates[i + 1];
      
      const projection = projectPointOnSegment(gpsLat, gpsLng, lat1, lng1, lat2, lng2);
      const distance = haversineDistanceMeters(gpsLat, gpsLng, projection.lat, projection.lng);
      
      if (distance < bestDistance * 0.7) { // Only jump if significantly closer
        bestDistance = distance;
        bestProjection = projection;
        bestIdx = i;
        bestBearing = calculateBearing(lat1, lng1, lat2, lng2);
      }
    }
  }
  
  // Actual distance (without hysteresis penalty)
  const actualDistance = haversineDistanceMeters(gpsLat, gpsLng, bestProjection.lat, bestProjection.lng);
  
  // Only snap if within threshold
  const shouldSnap = actualDistance <= SNAP_THRESHOLD;
  
  // Calculate route progress (0-1)
  const routeProgress = (bestIdx + bestProjection.t) / (routeCoordinates.length - 1);
  
  return {
    lat: shouldSnap ? bestProjection.lat : gpsLat,
    lng: shouldSnap ? bestProjection.lng : gpsLng,
    isSnapped: shouldSnap,
    distanceToRoute: actualDistance,
    routeProgress,
    snappedIdx: bestIdx,
    bearing: bestBearing,
  };
}

/**
 * Check if user is off-route (for reroute trigger)
 */
export function isOffRoute(distanceToRoute: number): boolean {
  return distanceToRoute > OFF_ROUTE_THRESHOLD;
}

/**
 * Get remaining distance along route from current position
 */
export function getRemainingDistance(
  routeCoordinates: [number, number][],
  snappedIdx: number,
  interpolationT: number = 0
): number {
  if (!routeCoordinates || routeCoordinates.length < 2) return 0;
  
  let remaining = 0;
  
  // Add partial distance on current segment
  if (snappedIdx < routeCoordinates.length - 1) {
    const [lng1, lat1] = routeCoordinates[snappedIdx];
    const [lng2, lat2] = routeCoordinates[snappedIdx + 1];
    const segmentLength = haversineDistanceMeters(lat1, lng1, lat2, lng2);
    remaining += segmentLength * (1 - interpolationT);
  }
  
  // Add remaining segments
  for (let i = snappedIdx + 1; i < routeCoordinates.length - 1; i++) {
    const [lng1, lat1] = routeCoordinates[i];
    const [lng2, lat2] = routeCoordinates[i + 1];
    remaining += haversineDistanceMeters(lat1, lng1, lat2, lng2);
  }
  
  return remaining / 1000; // Convert to km
}

// ═══════════════════════════════════════════════════════════════
// HOOK: useMapMatchedPosition - Integrates with navigation
// ═══════════════════════════════════════════════════════════════
import { useState, useEffect, useRef } from 'react';
import { UserLocation } from './useUserLocation';

export function useMapMatchedPosition(
  gpsLocation: UserLocation | null,
  routeCoordinates: [number, number][] | null,
  isNavigating: boolean
): MapMatchedPosition | null {
  const [matchedPosition, setMatchedPosition] = useState<MapMatchedPosition | null>(null);
  const lastSnappedIdxRef = useRef(0);
  
  useEffect(() => {
    if (!isNavigating || !gpsLocation || !routeCoordinates || routeCoordinates.length < 2) {
      setMatchedPosition(null);
      lastSnappedIdxRef.current = 0;
      return;
    }
    
    const matched = snapToRoute(
      gpsLocation.latitude,
      gpsLocation.longitude,
      routeCoordinates,
      lastSnappedIdxRef.current
    );
    
    // Update last snapped index for hysteresis
    if (matched.isSnapped) {
      lastSnappedIdxRef.current = matched.snappedIdx;
    }
    
    setMatchedPosition(matched);
  }, [gpsLocation, routeCoordinates, isNavigating]);
  
  return matchedPosition;
}
