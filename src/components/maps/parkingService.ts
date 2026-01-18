// GetRido Maps - Parking SPP Service
import { supabase } from '@/integrations/supabase/client';

export interface ParkingZone {
  id: string;
  city: string;
  name: string;
  type: 'spp' | 'private';
  polygon: GeoJSON.Polygon;
  rules: ParkingRules;
  is_active: boolean;
}

export interface ParkingRules {
  days?: string[]; // ['mon', 'tue', 'wed', 'thu', 'fri']
  hours?: { start: string; end: string }; // { start: '08:00', end: '20:00' }
  ratePerHour?: number; // PLN
  minTime?: number; // minutes
  maxTime?: number; // minutes
}

export interface ParkingSession {
  id: string;
  user_id: string;
  vehicle_plate: string;
  zone_id: string;
  start_at: string;
  end_at: string;
  status: 'draft' | 'active' | 'ended' | 'cancelled';
  payment_status: 'pending' | 'paid' | 'failed' | 'simulated';
  amount: number;
  currency: string;
  zone?: ParkingZone;
}

export interface UserVehicle {
  id: string;
  user_id: string;
  plate: string;
  nickname: string | null;
  is_default: boolean;
}

// ===== GEOMETRY HELPERS =====

/**
 * Check if a point is inside a polygon using ray casting algorithm
 */
function pointInPolygon(lat: number, lng: number, polygon: number[][]): boolean {
  let inside = false;
  const n = polygon.length;
  
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    
    if (((yi > lat) !== (yj > lat)) && (lng < (xj - xi) * (lat - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  
  return inside;
}

/**
 * Check if user is inside any parking zone
 */
export async function checkUserInParkingZone(lat: number, lng: number): Promise<ParkingZone | null> {
  try {
    const { data: zones, error } = await supabase
      .from('parking_zones')
      .select('*')
      .eq('is_active', true);
    
    if (error || !zones) {
      console.error('[ParkingService] Error fetching zones:', error);
      return null;
    }
    
    for (const zone of zones) {
      const polygon = zone.polygon as any;
      if (polygon?.coordinates?.[0]) {
        // GeoJSON polygon has coordinates in [lng, lat] format
        const coords = polygon.coordinates[0].map((c: number[]) => [c[1], c[0]]); // Convert to [lat, lng]
        if (pointInPolygon(lat, lng, coords)) {
          return {
            ...zone,
            type: zone.type as 'spp' | 'private',
            polygon: polygon,
            rules: (zone.rules || {}) as ParkingRules,
          };
        }
      }
    }
    
    return null;
  } catch (error) {
    console.error('[ParkingService] Error checking zone:', error);
    return null;
  }
}

/**
 * Check if destination is in a parking zone
 */
export async function checkDestinationInParkingZone(lat: number, lng: number): Promise<ParkingZone | null> {
  return checkUserInParkingZone(lat, lng);
}

// ===== VEHICLE MANAGEMENT =====

export async function getUserVehicles(userId: string): Promise<UserVehicle[]> {
  const { data, error } = await supabase
    .from('user_vehicles')
    .select('*')
    .eq('user_id', userId)
    .order('is_default', { ascending: false });
  
  if (error) {
    console.error('[ParkingService] Error fetching vehicles:', error);
    return [];
  }
  
  return data || [];
}

export async function addUserVehicle(userId: string, plate: string, nickname?: string): Promise<UserVehicle | null> {
  const { data, error } = await supabase
    .from('user_vehicles')
    .insert({
      user_id: userId,
      plate: plate.toUpperCase().replace(/\s/g, ''),
      nickname,
      is_default: false,
    })
    .select()
    .single();
  
  if (error) {
    console.error('[ParkingService] Error adding vehicle:', error);
    return null;
  }
  
  return data;
}

export async function setDefaultVehicle(userId: string, vehicleId: string): Promise<boolean> {
  // First, unset all defaults
  await supabase
    .from('user_vehicles')
    .update({ is_default: false })
    .eq('user_id', userId);
  
  // Set the new default
  const { error } = await supabase
    .from('user_vehicles')
    .update({ is_default: true })
    .eq('id', vehicleId)
    .eq('user_id', userId);
  
  return !error;
}

// ===== PARKING SESSIONS =====

export async function getActiveSession(userId: string): Promise<ParkingSession | null> {
  const { data, error } = await supabase
    .from('parking_sessions')
    .select(`
      *,
      zone:parking_zones(*)
    `)
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('start_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  
  if (error || !data) {
    return null;
  }
  
  return {
    ...data,
    status: data.status as ParkingSession['status'],
    payment_status: data.payment_status as ParkingSession['payment_status'],
    zone: data.zone ? {
      ...data.zone,
      type: data.zone.type as 'spp' | 'private',
      polygon: data.zone.polygon as unknown as GeoJSON.Polygon,
      rules: (data.zone.rules || {}) as ParkingRules,
    } : undefined,
  };
}

export async function purchaseParkingSession(
  userId: string,
  zoneId: string,
  vehiclePlate: string,
  durationMinutes: number
): Promise<ParkingSession | null> {
  const startAt = new Date();
  const endAt = new Date(startAt.getTime() + durationMinutes * 60 * 1000);
  
  // Calculate amount (MVP: simple calculation)
  const { data: zone } = await supabase
    .from('parking_zones')
    .select('rules')
    .eq('id', zoneId)
    .single();
  
  const rules = (zone?.rules || {}) as ParkingRules;
  const ratePerHour = rules.ratePerHour || 5; // Default 5 PLN/h
  const amount = (durationMinutes / 60) * ratePerHour;
  
  const { data, error } = await supabase
    .from('parking_sessions')
    .insert({
      user_id: userId,
      vehicle_plate: vehiclePlate.toUpperCase(),
      zone_id: zoneId,
      start_at: startAt.toISOString(),
      end_at: endAt.toISOString(),
      status: 'active',
      payment_status: 'simulated', // MVP: no real payment
      amount: Math.round(amount * 100) / 100,
      currency: 'PLN',
      provider: 'simulated',
    })
    .select()
    .single();
  
  if (error) {
    console.error('[ParkingService] Error creating session:', error);
    return null;
  }
  
  return {
    ...data,
    status: data.status as ParkingSession['status'],
    payment_status: data.payment_status as ParkingSession['payment_status'],
  };
}

export async function extendParkingSession(
  sessionId: string,
  additionalMinutes: number
): Promise<ParkingSession | null> {
  // Get current session
  const { data: session, error: fetchError } = await supabase
    .from('parking_sessions')
    .select('*, zone:parking_zones(*)')
    .eq('id', sessionId)
    .single();
  
  if (fetchError || !session) {
    return null;
  }
  
  const currentEndAt = new Date(session.end_at);
  const newEndAt = new Date(currentEndAt.getTime() + additionalMinutes * 60 * 1000);
  
  // Calculate additional amount
  const rules = (session.zone?.rules || {}) as ParkingRules;
  const ratePerHour = rules.ratePerHour || 5;
  const additionalAmount = (additionalMinutes / 60) * ratePerHour;
  
  const { data, error } = await supabase
    .from('parking_sessions')
    .update({
      end_at: newEndAt.toISOString(),
      amount: session.amount + Math.round(additionalAmount * 100) / 100,
    })
    .eq('id', sessionId)
    .select()
    .single();
  
  if (error) {
    console.error('[ParkingService] Error extending session:', error);
    return null;
  }
  
  return {
    ...data,
    status: data.status as ParkingSession['status'],
    payment_status: data.payment_status as ParkingSession['payment_status'],
  };
}

export async function endParkingSession(sessionId: string): Promise<boolean> {
  const { error } = await supabase
    .from('parking_sessions')
    .update({ status: 'ended' })
    .eq('id', sessionId);
  
  return !error;
}

// ===== ADMIN FUNCTIONS =====

export async function getAllParkingZones(): Promise<ParkingZone[]> {
  const { data, error } = await supabase
    .from('parking_zones')
    .select('*')
    .order('city', { ascending: true });
  
  if (error) {
    console.error('[ParkingService] Error fetching all zones:', error);
    return [];
  }
  
  return (data || []).map(z => ({
    ...z,
    type: z.type as 'spp' | 'private',
    polygon: z.polygon as unknown as GeoJSON.Polygon,
    rules: (z.rules || {}) as ParkingRules,
  }));
}

export async function getActiveParkingSessions(): Promise<ParkingSession[]> {
  const { data, error } = await supabase
    .from('parking_sessions')
    .select('*, zone:parking_zones(*)')
    .eq('status', 'active')
    .order('start_at', { ascending: false });
  
  if (error) {
    console.error('[ParkingService] Error fetching active sessions:', error);
    return [];
  }
  
  return (data || []).map(s => ({
    ...s,
    status: s.status as ParkingSession['status'],
    payment_status: s.payment_status as ParkingSession['payment_status'],
    zone: s.zone ? {
      ...s.zone,
      type: s.zone.type as 'spp' | 'private',
      polygon: s.zone.polygon as unknown as GeoJSON.Polygon,
      rules: (s.zone.rules || {}) as ParkingRules,
    } : undefined,
  }));
}

export async function createParkingZone(zone: Omit<ParkingZone, 'id'>): Promise<ParkingZone | null> {
  const { data, error } = await supabase
    .from('parking_zones')
    .insert([{
      city: zone.city,
      name: zone.name,
      type: zone.type,
      polygon: JSON.parse(JSON.stringify(zone.polygon)),
      rules: JSON.parse(JSON.stringify(zone.rules)),
      is_active: zone.is_active,
    }])
    .select()
    .single();
  
  if (error) {
    console.error('[ParkingService] Error creating zone:', error);
    return null;
  }
  
  return {
    ...data,
    type: data.type as 'spp' | 'private',
    polygon: data.polygon as unknown as GeoJSON.Polygon,
    rules: (data.rules || {}) as ParkingRules,
  };
}

export async function updateParkingZone(id: string, updates: Partial<ParkingZone>): Promise<boolean> {
  const { error } = await supabase
    .from('parking_zones')
    .update({
      city: updates.city,
      name: updates.name,
      type: updates.type,
      polygon: updates.polygon ? JSON.parse(JSON.stringify(updates.polygon)) : undefined,
      rules: updates.rules ? JSON.parse(JSON.stringify(updates.rules)) : undefined,
      is_active: updates.is_active,
    })
    .eq('id', id);
  
  return !error;
}

export async function deleteParkingZone(id: string): Promise<boolean> {
  const { error } = await supabase
    .from('parking_zones')
    .delete()
    .eq('id', id);
  
  return !error;
}

// ===== TIMER HELPERS =====

export function getTimeRemaining(endAt: string): { minutes: number; seconds: number; expired: boolean } {
  const now = new Date().getTime();
  const end = new Date(endAt).getTime();
  const diff = end - now;
  
  if (diff <= 0) {
    return { minutes: 0, seconds: 0, expired: true };
  }
  
  const minutes = Math.floor(diff / 60000);
  const seconds = Math.floor((diff % 60000) / 1000);
  
  return { minutes, seconds, expired: false };
}

export function formatTimeRemaining(endAt: string): string {
  const { minutes, seconds, expired } = getTimeRemaining(endAt);
  
  if (expired) return 'Zakończony';
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
  }
  
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}
