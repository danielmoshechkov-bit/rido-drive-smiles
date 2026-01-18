// GetRido Maps - Fleet Live Service
import { supabase } from '@/integrations/supabase/client';

export interface DriverLocationData {
  userId: string;
  lat: number;
  lng: number;
  speed: number | null;
  heading: number | null;
  accuracy: number;
  updatedAt: Date;
  driverName?: string;
  isActive: boolean;
}

let updateInterval: number | null = null;

export const fleetLiveService = {
  // Start sharing location every 5 seconds
  startSharing(
    getLocation: () => { 
      lat: number; 
      lng: number; 
      speed: number | null; 
      heading: number | null; 
      accuracy: number 
    } | null
  ): void {
    if (updateInterval) {
      console.log('[FleetLive] Already sharing');
      return;
    }

    const sendUpdate = async () => {
      const location = getLocation();
      if (!location) {
        console.log('[FleetLive] No location available');
        return;
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.log('[FleetLive] No authenticated user');
        return;
      }

      const { error } = await supabase
        .from('driver_locations')
        .upsert({
          user_id: user.id,
          lat: location.lat,
          lng: location.lng,
          speed: location.speed,
          heading: location.heading,
          accuracy: location.accuracy,
          is_active: true,
          updated_at: new Date().toISOString(),
        }, { 
          onConflict: 'user_id' 
        });

      if (error) {
        console.error('[FleetLive] Error sending location:', error);
      } else {
        console.log('[FleetLive] Location sent');
      }
    };

    // Send immediately, then every 5 seconds
    sendUpdate();
    updateInterval = window.setInterval(sendUpdate, 5000);
    console.log('[FleetLive] Started sharing');
  },

  // Stop sharing and mark as inactive
  async stopSharing(): Promise<void> {
    if (updateInterval) {
      clearInterval(updateInterval);
      updateInterval = null;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase
        .from('driver_locations')
        .update({ is_active: false })
        .eq('user_id', user.id);
    }

    console.log('[FleetLive] Stopped sharing');
  },

  // Check if currently sharing
  isSharing(): boolean {
    return updateInterval !== null;
  },

  // Get active drivers (for fleet manager view)
  async getActiveDrivers(): Promise<DriverLocationData[]> {
    const thirtySecondsAgo = new Date(Date.now() - 30000).toISOString();

    const { data, error } = await supabase
      .from('driver_locations')
      .select('*')
      .eq('is_active', true)
      .gte('updated_at', thirtySecondsAgo);

    if (error) {
      console.error('[FleetLive] Error fetching drivers:', error);
      return [];
    }

    if (!data) return [];

    // Get driver names separately
    const userIds = data.map(d => d.user_id);
    const { data: driverData } = await supabase
      .from('driver_app_users')
      .select('user_id, driver_id, drivers(first_name, last_name)')
      .in('user_id', userIds);

    const driverMap = new Map<string, string>();
    if (driverData) {
      for (const d of driverData) {
        if (d.drivers) {
          const driver = d.drivers as { first_name: string | null; last_name: string | null };
          driverMap.set(
            d.user_id, 
            `${driver.first_name || ''} ${driver.last_name || ''}`.trim() || 'Kierowca'
          );
        }
      }
    }

    return data.map(d => ({
      userId: d.user_id,
      lat: d.lat,
      lng: d.lng,
      speed: d.speed,
      heading: d.heading,
      accuracy: d.accuracy || 0,
      updatedAt: new Date(d.updated_at),
      driverName: driverMap.get(d.user_id) || 'Kierowca',
      isActive: d.is_active || false,
    }));
  },
};
