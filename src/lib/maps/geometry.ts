// Shared map geometry helpers (framework-agnostic, no Google Maps dependency).
// Extracted from src/components/realestate/FullscreenMapView.tsx so the same
// math can back both the real-estate and the vehicle (giełda aut) map views.

export interface LatLng {
  lat: number;
  lng: number;
}

/**
 * Ray-casting point-in-polygon test.
 * `polygon` is an ordered ring of {lat, lng} vertices (not auto-closed; the
 * algorithm wraps the last vertex to the first).
 */
export function isPointInPolygon(lat: number, lng: number, polygon: LatLng[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lat, yi = polygon[i].lng;
    const xj = polygon[j].lat, yj = polygon[j].lng;
    if (((yi > lng) !== (yj > lng)) && (lat < ((xj - xi) * (lng - yi)) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}

/** Great-circle distance between two points, in meters. */
export function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Whole-world rectangle used as the outer ring of an inverted "spotlight" mask.
 * Pair it with a counter-clockwise hole ring to dim everything outside a
 * selected area.
 */
export const WORLD_MASK_PATH: LatLng[] = [
  { lat: -85, lng: -180 },
  { lat: 85, lng: -180 },
  { lat: 85, lng: 180 },
  { lat: -85, lng: 180 },
];

/** Signed area of a ring (shoelace). Sign encodes winding order. */
export function getPolygonSignedArea(points: LatLng[]): number {
  let area = 0;
  for (let i = 0; i < points.length; i += 1) {
    const current = points[i];
    const next = points[(i + 1) % points.length];
    area += current.lng * next.lat - next.lng * current.lat;
  }
  return area / 2;
}

/** Return the ring wound clockwise (suitable for a Google Maps polygon outer ring). */
export function ensureClockwise(points: LatLng[]): LatLng[] {
  if (points.length < 3) return [...points];
  return getPolygonSignedArea(points) <= 0 ? [...points] : [...points].reverse();
}

/** Return the ring wound counter-clockwise (suitable for a polygon hole). */
export function ensureCounterClockwise(points: LatLng[]): LatLng[] {
  if (points.length < 3) return [...points];
  return getPolygonSignedArea(points) >= 0 ? [...points] : [...points].reverse();
}

/** Approximate a geodesic circle as a polygon ring of `segments` vertices. */
export function createCirclePolygon(
  center: LatLng,
  radiusMeters: number,
  segments = 72,
): LatLng[] {
  const earthRadius = 6371000;
  const latRad = center.lat * Math.PI / 180;
  const lngRad = center.lng * Math.PI / 180;
  const angularDistance = radiusMeters / earthRadius;

  return Array.from({ length: segments }, (_, index) => {
    const bearing = (2 * Math.PI * index) / segments;
    const pointLat = Math.asin(
      Math.sin(latRad) * Math.cos(angularDistance) +
      Math.cos(latRad) * Math.sin(angularDistance) * Math.cos(bearing),
    );
    const pointLng = lngRad + Math.atan2(
      Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(latRad),
      Math.cos(angularDistance) - Math.sin(latRad) * Math.sin(pointLat),
    );
    return {
      lat: pointLat * 180 / Math.PI,
      lng: pointLng * 180 / Math.PI,
    };
  });
}
