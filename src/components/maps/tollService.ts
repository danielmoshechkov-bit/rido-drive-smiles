// GetRido Maps - Toll Segments Service
import { supabase } from '@/integrations/supabase/client';

export interface TollSegment {
  id: string;
  country: string;
  name: string;
  type: 'toll_gate' | 'vignette';
  geometry: GeoJSON.LineString | GeoJSON.Polygon;
  price_rules: TollPriceRules;
  is_active: boolean;
}

export interface TollPriceRules {
  basePricePLN?: number;
  pricePerKm?: number;
  validityDays?: number; // For vignettes
  vehicleClasses?: { class: string; multiplier: number }[];
}

export interface TollPurchase {
  id: string;
  user_id: string;
  segment_id: string;
  start_at: string;
  end_at: string | null;
  status: 'active' | 'expired' | 'refunded';
  amount: number;
  currency: string;
  segment?: TollSegment;
}

// ===== GEOMETRY HELPERS =====

/**
 * Check if a route intersects with a toll segment geometry
 * Simplified: checks if any route point is within buffer distance of segment
 */
function routeIntersectsSegment(
  routeCoords: [number, number][],
  segmentGeometry: TollSegment['geometry'],
  bufferKm: number = 0.1
): boolean {
  // Get segment coordinates
  let segmentCoords: number[][] = [];
  
  if (segmentGeometry.type === 'LineString') {
    segmentCoords = segmentGeometry.coordinates as number[][];
  } else if (segmentGeometry.type === 'Polygon') {
    segmentCoords = (segmentGeometry.coordinates as number[][][])[0];
  }
  
  if (segmentCoords.length === 0) return false;
  
  // Check each route point against segment
  for (const [routeLng, routeLat] of routeCoords) {
    for (const [segLng, segLat] of segmentCoords) {
      const dist = haversineDistance(routeLat, routeLng, segLat, segLng);
      if (dist < bufferKm) {
        return true;
      }
    }
  }
  
  return false;
}

/**
 * Haversine distance in km
 */
function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// ===== TOLL DETECTION =====

/**
 * Check if route passes through any toll segments
 */
export async function detectTollsOnRoute(
  routeCoords: [number, number][]
): Promise<TollSegment[]> {
  try {
    const { data: segments, error } = await supabase
      .from('toll_segments')
      .select('*')
      .eq('is_active', true);
    
    if (error || !segments) {
      console.error('[TollService] Error fetching segments:', error);
      return [];
    }
    
    const intersectingSegments: TollSegment[] = [];
    
    for (const segment of segments) {
      const geometry = segment.geometry as unknown as TollSegment['geometry'];
      
      if (routeIntersectsSegment(routeCoords, geometry)) {
        intersectingSegments.push({
          ...segment,
          type: segment.type as 'toll_gate' | 'vignette',
          geometry,
          price_rules: (segment.price_rules || {}) as TollPriceRules,
        });
      }
    }
    
    return intersectingSegments;
  } catch (error) {
    console.error('[TollService] Error detecting tolls:', error);
    return [];
  }
}

// ===== TOLL PURCHASES =====

export async function purchaseToll(
  userId: string,
  segmentId: string
): Promise<TollPurchase | null> {
  // Get segment to calculate price
  const { data: segment } = await supabase
    .from('toll_segments')
    .select('*')
    .eq('id', segmentId)
    .single();
  
  if (!segment) return null;
  
  const rules = (segment.price_rules || {}) as TollPriceRules;
  const amount = rules.basePricePLN || 10; // Default 10 PLN
  
  const startAt = new Date();
  let endAt: Date | null = null;
  
  // Vignettes have validity period
  if (segment.type === 'vignette' && rules.validityDays) {
    endAt = new Date(startAt.getTime() + rules.validityDays * 24 * 60 * 60 * 1000);
  }
  
  const { data, error } = await supabase
    .from('toll_purchases')
    .insert({
      user_id: userId,
      segment_id: segmentId,
      start_at: startAt.toISOString(),
      end_at: endAt?.toISOString() || null,
      status: 'active',
      amount,
      currency: 'PLN',
      provider: 'simulated',
    })
    .select()
    .single();
  
  if (error) {
    console.error('[TollService] Error creating purchase:', error);
    return null;
  }
  
  return {
    ...data,
    status: data.status as TollPurchase['status'],
  };
}

export async function getUserTollPurchases(userId: string): Promise<TollPurchase[]> {
  const { data, error } = await supabase
    .from('toll_purchases')
    .select('*, segment:toll_segments(*)')
    .eq('user_id', userId)
    .order('start_at', { ascending: false });
  
  if (error) {
    return [];
  }
  
  return (data || []).map(p => ({
    ...p,
    status: p.status as TollPurchase['status'],
    segment: p.segment ? {
      ...p.segment,
      type: p.segment.type as 'toll_gate' | 'vignette',
      geometry: p.segment.geometry as unknown as TollSegment['geometry'],
      price_rules: (p.segment.price_rules || {}) as TollPriceRules,
    } : undefined,
  }));
}

/**
 * Check if user has active purchase for a segment
 */
export async function hasActiveTollPurchase(
  userId: string,
  segmentId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from('toll_purchases')
    .select('id')
    .eq('user_id', userId)
    .eq('segment_id', segmentId)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle();
  
  return !error && !!data;
}

// ===== ADMIN FUNCTIONS =====

export async function getAllTollSegments(): Promise<TollSegment[]> {
  const { data, error } = await supabase
    .from('toll_segments')
    .select('*')
    .order('country', { ascending: true });
  
  if (error) {
    return [];
  }
  
  return (data || []).map(s => ({
    ...s,
    type: s.type as 'toll_gate' | 'vignette',
    geometry: s.geometry as unknown as TollSegment['geometry'],
    price_rules: (s.price_rules || {}) as TollPriceRules,
  }));
}

export async function createTollSegment(segment: Omit<TollSegment, 'id'>): Promise<TollSegment | null> {
  const { data, error } = await supabase
    .from('toll_segments')
    .insert({
      country: segment.country,
      name: segment.name,
      type: segment.type,
      geometry: segment.geometry as unknown as Record<string, unknown>,
      price_rules: segment.price_rules as unknown as Record<string, unknown>,
      is_active: segment.is_active,
    })
    .select()
    .single();
  
  if (error) {
    return null;
  }
  
  return {
    ...data,
    type: data.type as 'toll_gate' | 'vignette',
    geometry: data.geometry as unknown as TollSegment['geometry'],
    price_rules: (data.price_rules || {}) as TollPriceRules,
  };
}

export async function updateTollSegment(id: string, updates: Partial<TollSegment>): Promise<boolean> {
  const { error } = await supabase
    .from('toll_segments')
    .update({
      country: updates.country,
      name: updates.name,
      type: updates.type,
      geometry: updates.geometry as unknown as Record<string, unknown>,
      price_rules: updates.price_rules as unknown as Record<string, unknown>,
      is_active: updates.is_active,
    })
    .eq('id', id);
  
  return !error;
}

export async function deleteTollSegment(id: string): Promise<boolean> {
  const { error } = await supabase
    .from('toll_segments')
    .delete()
    .eq('id', id);
  
  return !error;
}

// ===== HELPERS =====

export function calculateTollPrice(segment: TollSegment): number {
  const rules = segment.price_rules;
  return rules.basePricePLN || 10;
}

export function formatTollType(type: TollSegment['type']): string {
  return type === 'toll_gate' ? 'Bramka' : 'Winieta';
}
