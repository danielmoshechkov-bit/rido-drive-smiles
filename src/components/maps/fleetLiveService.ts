// GetRido Maps - Fleet Live Service
import { supabase } from '@/integrations/supabase/client';
import { classifyMovement, MovementType, resetMovementHistory } from './movementClassifier';
import { trackingQueueService, QueuedLocation } from './trackingQueueService';

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
  isDriving?: boolean;
  movementType?: MovementType;
}

let updateInterval: number | null = null;
let flushInterval: number | null = null;
const FLEET_TABLE_NAME = 'driver_locations';

export const fleetLiveService = {
  // Start sharing location every 5 seconds
  startSharing(
    getLocation: () => { 
      lat: number; 
      lng: number; 
      speed: number | null; 
      heading: number | null; 
      accuracy: number 
    } | null,
    mode: 'work' | 'navigation' = 'work'
  ): void {
    if (updateInterval) {
      console.log('[FleetLive] Already sharing');
      return;
    }

    // Reset movement classification history on new session
    resetMovementHistory();

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

      // Classify movement (pieszo vs jazda)
      const classification = classifyMovement(
        location.speed,
        location.accuracy,
        Date.now()
      );

      const timestamp = new Date().toISOString();

      const payload: QueuedLocation = {
        userId: user.id,
        lat: location.lat,
        lng: location.lng,
        speed: location.speed,
        heading: location.heading,
        accuracy: location.accuracy,
        timestamp,
        mode,
        source: 'pwa',
        isDriving: classification.isDriving,
        movementType: classification.type,
      };

      // If online, send directly
      if (navigator.onLine) {
        const { error } = await supabase
          .from(FLEET_TABLE_NAME)
          .upsert({
            user_id: user.id,
            lat: location.lat,
            lng: location.lng,
            speed: location.speed,
            heading: location.heading,
            accuracy: location.accuracy,
            is_active: true,
            updated_at: timestamp,
          }, { 
            onConflict: 'user_id' 
          });

        if (error) {
          console.error('[FleetLive] Error sending location, queueing:', error);
          trackingQueueService.enqueue(payload);
        } else {
          console.log(`[FleetLive] Location sent (${classification.type}, isDriving: ${classification.isDriving})`);
        }
      } else {
        // Offline - queue for later
        trackingQueueService.enqueue(payload);
        console.log('[FleetLive] Offline - queued location');
      }
    };

    // Send immediately, then every 5 seconds
    sendUpdate();
    updateInterval = window.setInterval(sendUpdate, 5000);

    // Flush queue every 10 seconds when online
    flushInterval = window.setInterval(() => {
      if (navigator.onLine && !trackingQueueService.isEmpty()) {
        this.flushQueue();
      }
    }, 10000);

    // Listen for online event to flush queue
    window.addEventListener('online', this.handleOnline);

    console.log('[FleetLive] Started sharing');
  },

  handleOnline: async function() {
    console.log('[FleetLive] Back online - flushing queue');
    await fleetLiveService.flushQueue();
  },

  // Stop sharing and mark as inactive
  async stopSharing(): Promise<void> {
    if (updateInterval) {
      clearInterval(updateInterval);
      updateInterval = null;
    }

    if (flushInterval) {
      clearInterval(flushInterval);
      flushInterval = null;
    }

    window.removeEventListener('online', this.handleOnline);

    // Final flush before stopping
    await this.flushQueue();

    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase
        .from(FLEET_TABLE_NAME)
        .update({ is_active: false })
        .eq('user_id', user.id);
    }

    resetMovementHistory();
    console.log('[FleetLive] Stopped sharing');
  },

  // Check if currently sharing
  isSharing(): boolean {
    return updateInterval !== null;
  },

  // Flush queued locations to backend
  async flushQueue(): Promise<{ success: boolean; count: number }> {
    const queue = trackingQueueService.getQueue();
    if (queue.length === 0) return { success: true, count: 0 };

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, count: 0 };

    try {
      // Upsert latest position
      const latest = queue[queue.length - 1];
      const { error } = await supabase
        .from(FLEET_TABLE_NAME)
        .upsert({
          user_id: user.id,
          lat: latest.lat,
          lng: latest.lng,
          speed: latest.speed,
          heading: latest.heading,
          accuracy: latest.accuracy,
          is_active: true,
          updated_at: latest.timestamp,
        }, { onConflict: 'user_id' });

      if (error) {
        console.error('[FleetLive] Failed to flush queue:', error);
        return { success: false, count: 0 };
      }

      const count = queue.length;
      trackingQueueService.clearQueue();
      console.log(`[FleetLive] Flushed ${count} queued locations`);
      return { success: true, count };
    } catch (error) {
      console.error('[FleetLive] Flush error:', error);
      return { success: false, count: 0 };
    }
  },

  // Upload batch of locations (for future use with history table)
  async uploadBatch(locations: QueuedLocation[]): Promise<{ success: boolean; count: number }> {
    if (locations.length === 0) return { success: true, count: 0 };

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, count: 0 };

    // For now, just upsert the latest position
    const latest = locations[locations.length - 1];
    const { error } = await supabase
      .from(FLEET_TABLE_NAME)
      .upsert({
        user_id: user.id,
        lat: latest.lat,
        lng: latest.lng,
        speed: latest.speed,
        heading: latest.heading,
        accuracy: latest.accuracy,
        is_active: true,
        updated_at: latest.timestamp,
      }, { onConflict: 'user_id' });

    return { success: !error, count: locations.length };
  },

  // Get active drivers (for fleet manager view)
  async getActiveDrivers(): Promise<DriverLocationData[]> {
    const thirtySecondsAgo = new Date(Date.now() - 30000).toISOString();

    const { data, error } = await supabase
      .from(FLEET_TABLE_NAME)
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

  // Get queue stats for UI
  getQueueStats() {
    return trackingQueueService.getStats();
  },

  // Check if queue has pending items
  hasQueuedItems(): boolean {
    return !trackingQueueService.isEmpty();
  },

  getQueueSize(): number {
    return trackingQueueService.getQueueSize();
  },
};
