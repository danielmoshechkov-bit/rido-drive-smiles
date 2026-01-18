// GetRido Maps - Navigation Hook (Turn-by-Turn)
import { useState, useCallback, useRef, useEffect } from 'react';
import { RouteResult } from './routingService';
import { GpsState, UserLocation } from './useUserLocation';

export interface NavigationState {
  isNavigating: boolean;
  remainingDistance: number;  // km
  remainingDuration: number;  // min
  eta: Date | null;
  followMode: boolean;
  wakeLockActive: boolean;
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
function calculateRemainingDistance(
  location: UserLocation,
  route: RouteResult
): number {
  if (!route.coordinates || route.coordinates.length < 2) {
    return route.distance;
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

  return remaining;
}

export function useNavigation(route: RouteResult | null, gps: GpsState) {
  const [state, setState] = useState<NavigationState>({
    isNavigating: false,
    remainingDistance: 0,
    remainingDuration: 0,
    eta: null,
    followMode: false,
    wakeLockActive: false,
  });

  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

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
    });
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
    });
  }, [gps]);

  // Toggle follow mode
  const toggleFollowMode = useCallback(() => {
    setState(prev => ({ ...prev, followMode: !prev.followMode }));
  }, []);

  // Update remaining distance/time based on GPS position
  useEffect(() => {
    if (state.isNavigating && gps.location && route) {
      const remaining = calculateRemainingDistance(gps.location, route);
      
      // Estimate remaining time based on original route ratio
      const progress = remaining / route.distance;
      const remainingTime = route.duration * progress;

      setState(prev => ({
        ...prev,
        remainingDistance: remaining,
        remainingDuration: remainingTime,
        eta: new Date(Date.now() + remainingTime * 60000),
      }));
    }
  }, [gps.location, state.isNavigating, route]);

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
