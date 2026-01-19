// GetRido Maps - Navigation Hook (Turn-by-Turn with Auto-Rerouting)
import { useState, useCallback, useRef, useEffect } from 'react';
import { RouteResult } from './routingService';
import { GpsState, UserLocation } from './useUserLocation';

// ═══════════════════════════════════════════════════════════════
// OFF-ROUTE DETECTION CONSTANTS
// ═══════════════════════════════════════════════════════════════
const OFF_ROUTE_THRESHOLD = 60; // meters - distance from route to trigger reroute
const REROUTE_COOLDOWN = 8000; // ms - minimum time between reroutes
const OFF_ROUTE_CONFIRM_TIME = 2500; // ms - must be off-route for this long before rerouting

export interface NavigationState {
  isNavigating: boolean;
  remainingDistance: number;  // km
  remainingDuration: number;  // min
  eta: Date | null;
  followMode: boolean;
  wakeLockActive: boolean;
  isOffRoute: boolean;
  isRerouting: boolean;  // NEW: shows toast during reroute
}

interface RemainingDistanceResult {
  remaining: number;       // km - remaining distance along route
  closestDistance: number; // meters - distance from user to closest point on route
  closestIdx: number;      // index of closest point
}

// Calculate distance between two points in km (Haversine formula)
function haversineDistance(
  lat1: number, lng1: number, 
  lat2: number, lng2: number
): number {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Find remaining distance along route from current position
// Returns both remaining distance AND distance to route (for off-route detection)
function calculateRemainingDistance(
  location: UserLocation,
  route: RouteResult
): RemainingDistanceResult {
  if (!route.coordinates || route.coordinates.length < 2) {
    return { remaining: route.distance, closestDistance: 0, closestIdx: 0 };
  }

  // Find the closest point on the route
  let minDist = Infinity;
  let closestIdx = 0;

  for (let i = 0; i < route.coordinates.length; i++) {
    const [lng, lat] = route.coordinates[i];
    const dist = haversineDistance(location.latitude, location.longitude, lat, lng);
    if (dist < minDist) {
      minDist = dist;
      closestIdx = i;
    }
  }

  // Sum remaining distance from closest point to end
  let remaining = 0;
  for (let i = closestIdx; i < route.coordinates.length - 1; i++) {
    const [lng1, lat1] = route.coordinates[i];
    const [lng2, lat2] = route.coordinates[i + 1];
    remaining += haversineDistance(lat1, lng1, lat2, lng2);
  }

  return {
    remaining,
    closestDistance: minDist * 1000, // Convert km to meters
    closestIdx,
  };
}

export function useNavigation(
  route: RouteResult | null, 
  gps: GpsState,
  onReroute?: () => void  // Callback when user goes off-route
) {
  const [state, setState] = useState<NavigationState>({
    isNavigating: false,
    remainingDistance: 0,
    remainingDuration: 0,
    eta: null,
    followMode: false,
    wakeLockActive: false,
    isOffRoute: false,
    isRerouting: false,
  });

  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const lastRerouteRef = useRef<number>(0);
  const offRouteStartRef = useRef<number | null>(null); // Track when user went off-route

  // Start navigation
  const startNavigation = useCallback(async () => {
    if (!route) return;

    // 1. Request Screen Wake Lock API (if available)
    if ('wakeLock' in navigator) {
      try {
        wakeLockRef.current = await navigator.wakeLock.request('screen');
        console.log('[Navigation] Wake Lock acquired');
      } catch (e) {
        console.warn('[Navigation] Wake Lock not available:', e);
      }
    }

    // 2. Switch GPS to navigation mode
    if (gps.setMode) {
      gps.setMode('navigation');
    }

    // 3. Set navigation state
    setState({
      isNavigating: true,
      followMode: true,
      remainingDistance: route.distance,
      remainingDuration: route.duration,
      eta: new Date(Date.now() + route.duration * 60000),
      wakeLockActive: !!wakeLockRef.current,
      isOffRoute: false,
      isRerouting: false,
    });
    
    // Reset reroute tracking
    lastRerouteRef.current = 0;
    offRouteStartRef.current = null;
  }, [route, gps]);

  // Stop navigation
  const stopNavigation = useCallback(() => {
    // Release wake lock
    if (wakeLockRef.current) {
      wakeLockRef.current.release();
      wakeLockRef.current = null;
      console.log('[Navigation] Wake Lock released');
    }

    // Switch GPS back to normal mode
    if (gps.setMode) {
      gps.setMode('normal');
    }

    setState({
      isNavigating: false,
      remainingDistance: 0,
      remainingDuration: 0,
      eta: null,
      followMode: false,
      wakeLockActive: false,
      isOffRoute: false,
      isRerouting: false,
    });
  }, [gps]);

  // Toggle follow mode
  const toggleFollowMode = useCallback(() => {
    setState(prev => ({ ...prev, followMode: !prev.followMode }));
  }, []);

  // Update remaining distance/time based on GPS position + OFF-ROUTE DETECTION
  useEffect(() => {
    if (state.isNavigating && gps.location && route) {
      const result = calculateRemainingDistance(gps.location, route);
      
      // Estimate remaining time based on original route ratio
      const progress = result.remaining / route.distance;
      const remainingTime = route.duration * progress;
      
      // ═══════════════════════════════════════════════════════════════
      // OFF-ROUTE DETECTION with confirmation timer
      // ═══════════════════════════════════════════════════════════════
      const isCurrentlyOffRoute = result.closestDistance > OFF_ROUTE_THRESHOLD;
      const now = Date.now();
      
      if (isCurrentlyOffRoute) {
        // Start or continue off-route timer
        if (!offRouteStartRef.current) {
          offRouteStartRef.current = now;
          console.log(`[Navigation] OFF-ROUTE: ${result.closestDistance.toFixed(0)}m from route. Waiting ${OFF_ROUTE_CONFIRM_TIME}ms to confirm...`);
        } else if (now - offRouteStartRef.current > OFF_ROUTE_CONFIRM_TIME) {
          // Confirmed off-route - check cooldown and reroute
          if (now - lastRerouteRef.current > REROUTE_COOLDOWN && onReroute) {
            console.log(`[Navigation] OFF-ROUTE CONFIRMED. Rerouting...`);
            lastRerouteRef.current = now;
            setState(prev => ({ ...prev, isRerouting: true }));
            onReroute();
            // Reset after reroute callback
            setTimeout(() => setState(prev => ({ ...prev, isRerouting: false })), 3000);
          }
        }
      } else {
        // Back on route - reset timer
        offRouteStartRef.current = null;
      }

      setState(prev => ({
        ...prev,
        remainingDistance: result.remaining,
        remainingDuration: remainingTime,
        eta: new Date(Date.now() + remainingTime * 60000),
        isOffRoute: isCurrentlyOffRoute,
      }));
    }
  }, [gps.location, state.isNavigating, route, onReroute]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (wakeLockRef.current) {
        wakeLockRef.current.release();
      }
    };
  }, []);

  // Re-acquire wake lock if it was released (e.g., tab visibility change)
  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (state.isNavigating && document.visibilityState === 'visible' && 'wakeLock' in navigator) {
        try {
          wakeLockRef.current = await navigator.wakeLock.request('screen');
          setState(prev => ({ ...prev, wakeLockActive: true }));
        } catch (e) {
          console.warn('[Navigation] Failed to re-acquire wake lock');
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [state.isNavigating]);

  return {
    ...state,
    startNavigation,
    stopNavigation,
    toggleFollowMode,
  };
}
