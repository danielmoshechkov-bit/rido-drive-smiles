// GetRido Maps - Route Risk Assessment Service (FREE)
// Heurystyczna ocena ryzyka trasy bez live traffic

import { RouteResult, RouteOption } from './routingService';
import { Incident } from './incidentsService';

export interface RiskAssessment {
  riskLevel: 'low' | 'medium' | 'high';
  score: number; // 0-100
  messages: string[];
  suggestAlternative: boolean;
  incidentsNearRoute: Incident[];
}

/**
 * Haversine distance between two points (km)
 */
function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Check if point is near route (within buffer km)
 */
function isPointNearRoute(
  point: { lat: number; lng: number },
  routeCoords: [number, number][],
  bufferKm: number
): boolean {
  // Sample every 5th point for performance
  for (let i = 0; i < routeCoords.length; i += 5) {
    const [lng, lat] = routeCoords[i];
    if (haversineDistance(point.lat, point.lng, lat, lng) <= bufferKm) {
      return true;
    }
  }
  return false;
}

/**
 * Check if route passes through Warsaw center (bounding box)
 */
function isInWarsawCenter(routeCoords: [number, number][]): boolean {
  const WARSAW_CENTER_BBOX = {
    minLat: 52.2,
    maxLat: 52.26,
    minLng: 20.96,
    maxLng: 21.06,
  };
  return routeCoords.some(
    ([lng, lat]) =>
      lat >= WARSAW_CENTER_BBOX.minLat &&
      lat <= WARSAW_CENTER_BBOX.maxLat &&
      lng >= WARSAW_CENTER_BBOX.minLng &&
      lng <= WARSAW_CENTER_BBOX.maxLng
  );
}

/**
 * Check if current time is peak hours (local time)
 */
function isPeakHours(): boolean {
  const now = new Date();
  const hour = now.getHours();
  const day = now.getDay();
  const isWeekend = day === 0 || day === 6;
  return !isWeekend && ((hour >= 7 && hour <= 9) || (hour >= 16 && hour <= 19));
}

/**
 * Assess route risk based on incidents, complexity, and heuristics
 */
export function assessRouteRisk(
  route: RouteResult,
  routeOption: RouteOption | null,
  incidents: Incident[]
): RiskAssessment {
  let score = 0;
  const messages: string[] = [];
  const incidentsNearRoute: Incident[] = [];

  // 1. Check incidents near route (2km buffer)
  for (const incident of incidents) {
    if (isPointNearRoute({ lat: incident.lat, lng: incident.lng }, route.coordinates, 2)) {
      incidentsNearRoute.push(incident);
      score += incident.type === 'roadwork' ? 15 : 20;
    }
  }

  if (incidentsNearRoute.length > 0) {
    const incidentWord = incidentsNearRoute.length === 1 ? 'zdarzenie' : 
                          incidentsNearRoute.length < 5 ? 'zdarzenia' : 'zdarzeń';
    messages.push(
      `Wykryto ${incidentsNearRoute.length} ${incidentWord} na trasie (roboty/zamknięcia)`
    );
  }

  // 2. Check turns count (from routeOption)
  if (routeOption && routeOption.turnsCount > 15) {
    score += 15;
    messages.push('Dużo skrętów na trasie - możliwe spowolnienia');
  } else if (routeOption && routeOption.turnsCount > 8) {
    score += 8;
  }

  // 3. Check steps count (complexity)
  if (routeOption && routeOption.stepsCount > 40) {
    score += 10;
    messages.push('Złożona trasa z wieloma etapami');
  }

  // 4. Check Warsaw center + peak hours
  if (isInWarsawCenter(route.coordinates) && isPeakHours()) {
    score += 20;
    messages.push('Trasa przez centrum Warszawy w godzinach szczytu');
  } else if (isInWarsawCenter(route.coordinates)) {
    score += 5;
  }

  // 5. Long distance factor
  if (route.distance > 50) {
    score += 15;
    messages.push('Długa trasa - większe prawdopodobieństwo utrudnień');
  } else if (route.distance > 30) {
    score += 10;
  }

  // Determine risk level
  let riskLevel: 'low' | 'medium' | 'high';
  if (score < 20) riskLevel = 'low';
  else if (score < 45) riskLevel = 'medium';
  else riskLevel = 'high';

  // Default message if no specific issues
  if (messages.length === 0) {
    messages.push('Brak wykrytych utrudnień na trasie');
  }

  return {
    riskLevel,
    score,
    messages,
    suggestAlternative: score >= 30,
    incidentsNearRoute,
  };
}

/**
 * Calculate risk score for a single route option
 */
export function calculateRiskScore(
  routeOption: RouteOption,
  incidents: Incident[]
): number {
  let score = 0;

  // Check incidents near route
  for (const incident of incidents) {
    if (isPointNearRoute({ lat: incident.lat, lng: incident.lng }, routeOption.coordinates, 2)) {
      score += incident.type === 'roadwork' ? 15 : 20;
    }
  }

  // Turns and steps
  if (routeOption.turnsCount > 15) score += 15;
  else if (routeOption.turnsCount > 8) score += 8;

  if (routeOption.stepsCount > 40) score += 10;

  // Warsaw center + peak
  if (isInWarsawCenter(routeOption.coordinates) && isPeakHours()) {
    score += 20;
  }

  return score;
}

/**
 * Select best alternative with lower risk
 */
export function selectLowerRiskAlternative(
  routeOptions: RouteOption[],
  incidents: Incident[],
  currentRouteId: string
): RouteOption | null {
  const alternatives = routeOptions.filter((r) => r.id !== currentRouteId);

  if (alternatives.length === 0) return null;

  // Find alternative with lowest risk score
  let bestAlt: RouteOption | null = null;
  let lowestRiskScore = Infinity;

  for (const alt of alternatives) {
    const riskScore = calculateRiskScore(alt, incidents);
    if (riskScore < lowestRiskScore) {
      lowestRiskScore = riskScore;
      bestAlt = alt;
    }
  }

  return bestAlt;
}
