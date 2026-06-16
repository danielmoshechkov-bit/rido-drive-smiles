// Shared map geometry helpers.
//
// Pure (framework-agnostic) math used by the fullscreen map views across portals
// (real-estate `/nieruchomosci`, marketplace `/gielda`, …). No Google Maps or React
// dependency — only plain { lat, lng } objects so these can run anywhere (filters,
// edge functions, tests).

export interface LatLngLiteral {
  lat: number;
  lng: number;
}

/**
 * Ray-casting point-in-polygon test. `polygon` is an ordered ring of {lat,lng}.
 * Note: operates in lat/lng space directly (good enough for city-scale areas).
 */
export function isPointInPolygon(
  lat: number,
  lng: number,
  polygon: LatLngLiteral[],
): boolean {
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

/** Great-circle distance between two points, in metres. */
export function haversineDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * A polygon ring covering the whole world. Used as the outer ring of an inverted
 * "mask" polygon: the world is darkened and the selected area becomes a hole.
 */
export const WORLD_MASK_PATH: LatLngLiteral[] = [
  { lat: -85, lng: -180 },
  { lat: 85, lng: -180 },
  { lat: 85, lng: 180 },
  { lat: -85, lng: 180 },
];

/** Signed area of a ring (shoelace). Sign indicates winding order. */
export function getPolygonSignedArea(points: LatLngLiteral[]): number {
  let area = 0;
  for (let i = 0; i < points.length; i += 1) {
    const current = points[i];
    const next = points[(i + 1) % points.length];
    area += current.lng * next.lat - next.lng * current.lat;
  }
  return area / 2;
}

/** Return the ring wound clockwise (used for the outer ring of a mask polygon). */
export function ensureClockwise(points: LatLngLiteral[]): LatLngLiteral[] {
  if (points.length < 3) return [...points];
  return getPolygonSignedArea(points) <= 0 ? [...points] : [...points].reverse();
}

/** Return the ring wound counter-clockwise (used for hole rings in a mask polygon). */
export function ensureCounterClockwise(points: LatLngLiteral[]): LatLngLiteral[] {
  if (points.length < 3) return [...points];
  return getPolygonSignedArea(points) >= 0 ? [...points] : [...points].reverse();
}

/** Approximate a geodesic circle as a polygon ring of `segments` points. */
export function createCirclePolygon(
  center: LatLngLiteral,
  radiusMeters: number,
  segments = 72,
): LatLngLiteral[] {
  const earthRadius = 6371000;
  const latRad = center.lat * Math.PI / 180;
  const lngRad = center.lng * Math.PI / 180;
  const angularDistance = radiusMeters / earthRadius;

  return Array.from({ length: segments }, (_, index) => {
    const bearing = (2 * Math.PI * index) / segments;
    const pointLat = Math.asin(
      Math.sin(latRad) * Math.cos(angularDistance) +
      Math.cos(latRad) * Math.sin(angularDistance) * Math.cos(bearing)
    );

    const pointLng = lngRad + Math.atan2(
      Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(latRad),
      Math.cos(angularDistance) - Math.sin(latRad) * Math.sin(pointLat)
    );

    return {
      lat: pointLat * 180 / Math.PI,
      lng: pointLng * 180 / Math.PI,
    };
  });
}
