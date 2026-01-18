import { useState, useEffect, useRef, useCallback } from 'react';
import { locationService } from './locationService';

const GPS_CONSENT_KEY = 'getrido_gps_consent';

export interface UserLocation {
  latitude: number;
  longitude: number;
  accuracy: number;
  speed: number | null;
  heading: number | null;
  timestamp: number;
}

export type GpsStatus = 'inactive' | 'active' | 'weak' | 'error';
export type GpsMode = 'normal' | 'navigation';
export type PermissionStateType = 'granted' | 'prompt' | 'denied' | 'unknown';

export interface GpsState {
  location: UserLocation | null;
  status: GpsStatus;
  error: string | null;
  hasConsent: boolean;
  mode: GpsMode;
  isUnstable: boolean;
  permissionState: PermissionStateType;
  isGpsBlocked: boolean; // true jeśli denied lub brak hasConsent
  requestConsent: () => Promise<void>;
  revokeConsent: () => void;
  centerOnUser: () => void;
  centerRequested: boolean;
  clearCenterRequest: () => void;
  setMode: (mode: GpsMode) => void;
}

// Jump filter - detect unrealistic GPS jumps
function isJump(prevLocation: UserLocation | null, newLocation: UserLocation): boolean {
  if (!prevLocation) return false;
  
  const timeDiff = (newLocation.timestamp - prevLocation.timestamp) / 1000; // seconds
  if (timeDiff <= 0) return false;
  
  // Calculate distance using Haversine
  const R = 6371000; // Earth's radius in meters
  const dLat = (newLocation.latitude - prevLocation.latitude) * Math.PI / 180;
  const dLng = (newLocation.longitude - prevLocation.longitude) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(prevLocation.latitude * Math.PI / 180) * 
    Math.cos(newLocation.latitude * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c; // meters
  
  const speedMps = distance / timeDiff;
  
  // > 100 m/s (360 km/h) with low accuracy = suspicious jump
  return speedMps > 100 && newLocation.accuracy > 50;
}

export function useUserLocation(): GpsState {
  const [location, setLocation] = useState<UserLocation | null>(null);
  const [status, setStatus] = useState<GpsStatus>('inactive');
  const [error, setError] = useState<string | null>(null);
  const [hasConsent, setHasConsent] = useState<boolean>(() => {
    return localStorage.getItem(GPS_CONSENT_KEY) === 'true';
  });
  const [centerRequested, setCenterRequested] = useState(false);
  const [mode, setMode] = useState<GpsMode>('normal');
  const [isUnstable, setIsUnstable] = useState(false);
  const [permissionState, setPermissionState] = useState<PermissionStateType>('unknown');

  // Check browser permission state
  useEffect(() => {
    const checkPermission = async () => {
      if ('permissions' in navigator) {
        try {
          const result = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
          setPermissionState(result.state as PermissionStateType);
          
          result.onchange = () => {
            setPermissionState(result.state as PermissionStateType);
          };
        } catch {
          setPermissionState('unknown');
        }
      }
    };
    
    checkPermission();
  }, []);

  // Computed: is GPS blocked?
  const isGpsBlocked = !hasConsent || permissionState === 'denied';
  
  const watchIdRef = useRef<number | null>(null);
  const fallbackIntervalRef = useRef<number | null>(null);
  const prevLocationRef = useRef<UserLocation | null>(null);
  const lastUpdateRef = useRef<number>(0);
  // Moving average buffer for position smoothing
  const positionBufferRef = useRef<UserLocation[]>([]);
  const MAX_BUFFER_SIZE = 3;

  // Smooth position using moving average when accuracy is poor
  const smoothPosition = useCallback((newLocation: UserLocation): UserLocation => {
    positionBufferRef.current.push(newLocation);
    if (positionBufferRef.current.length > MAX_BUFFER_SIZE) {
      positionBufferRef.current.shift();
    }
    
    // If accuracy > 30m, use moving average for smoother movement
    if (newLocation.accuracy > 30 && positionBufferRef.current.length >= 2) {
      const buffer = positionBufferRef.current;
      const avgLat = buffer.reduce((s, p) => s + p.latitude, 0) / buffer.length;
      const avgLng = buffer.reduce((s, p) => s + p.longitude, 0) / buffer.length;
      
      return {
        ...newLocation,
        latitude: avgLat,
        longitude: avgLng,
      };
    }
    
    return newLocation;
  }, []);

  const stopWatching = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (fallbackIntervalRef.current !== null) {
      clearInterval(fallbackIntervalRef.current);
      fallbackIntervalRef.current = null;
    }
    setStatus('inactive');
    setLocation(null);
    setIsUnstable(false);
    prevLocationRef.current = null;
    positionBufferRef.current = [];
  }, []);

  const startWatching = useCallback(() => {
    if (!navigator.geolocation) {
      setStatus('error');
      setError('Geolokalizacja nie jest wspierana przez tę przeglądarkę');
      return;
    }

    setStatus('active');
    setError(null);

    // GPS options based on mode - more aggressive for navigation
    // 'aggressive' = ~500ms updates, 'normal' = ~2-3s updates
    const options: PositionOptions = mode === 'navigation' 
      ? {
          enableHighAccuracy: true,
          timeout: 4000,
          maximumAge: 0, // Always fresh position for navigation
        }
      : {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 3000, // Normal mode - saves battery
        };

    // Fallback interval based on mode
    const FALLBACK_INTERVAL = mode === 'navigation' ? 1000 : 2500;

    const handlePosition = (position: GeolocationPosition) => {
      let newLocation: UserLocation = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
        speed: position.coords.speed,
        heading: position.coords.heading,
        timestamp: position.timestamp,
      };

      // Apply smoothing in navigation mode for low accuracy readings
      if (mode === 'navigation') {
        newLocation = smoothPosition(newLocation);
      }

      // Check for GPS jump in navigation mode
      if (mode === 'navigation' && isJump(prevLocationRef.current, newLocation)) {
        console.warn('[GPS] Detected suspicious jump, marking as unstable');
        setIsUnstable(true);
      } else {
        setIsUnstable(false);
      }

      prevLocationRef.current = newLocation;
      lastUpdateRef.current = Date.now();
      setLocation(newLocation);
      
      // Weak signal if accuracy > 100 meters, or > 50m is considered poor
      setStatus(position.coords.accuracy > 100 ? 'weak' : 'active');
      setError(null);

      // Log to service for future traffic analysis
      locationService.logPosition({
        timestamp: position.timestamp,
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        speed: position.coords.speed,
        heading: position.coords.heading,
        accuracy: position.coords.accuracy,
      });
    };

    const handleError = (err: GeolocationPositionError) => {
      setStatus('error');
      switch (err.code) {
        case err.PERMISSION_DENIED:
          setError('Brak zgody na lokalizację');
          localStorage.removeItem(GPS_CONSENT_KEY);
          setHasConsent(false);
          break;
        case err.POSITION_UNAVAILABLE:
          setError('Lokalizacja niedostępna');
          break;
        case err.TIMEOUT:
          setError('Przekroczono czas oczekiwania');
          break;
        default:
          setError('Nieznany błąd lokalizacji');
      }
    };

    watchIdRef.current = navigator.geolocation.watchPosition(
      handlePosition,
      handleError,
      options
    );

    // Fallback interval for navigation mode - uses FALLBACK_INTERVAL constant
    if (mode === 'navigation') {
      fallbackIntervalRef.current = window.setInterval(() => {
        const timeSinceUpdate = Date.now() - lastUpdateRef.current;
        if (timeSinceUpdate > FALLBACK_INTERVAL) {
          console.log('[GPS] Fallback: requesting current position');
          navigator.geolocation.getCurrentPosition(handlePosition, handleError, options);
        }
      }, FALLBACK_INTERVAL);
    }
  }, [mode]);

  const requestConsent = useCallback(async () => {
    try {
      if (!navigator.geolocation) {
        setError('Geolokalizacja nie jest wspierana');
        return;
      }

      if ('permissions' in navigator) {
        try {
          const permission = await navigator.permissions.query({ name: 'geolocation' });
          
          if (permission.state === 'denied') {
            setError('Lokalizacja została zablokowana w ustawieniach przeglądarki');
            return;
          }
        } catch {
          // Some browsers don't support permissions API
        }
      }

      localStorage.setItem(GPS_CONSENT_KEY, 'true');
      setHasConsent(true);
      startWatching();
    } catch (err) {
      console.error('GPS consent error:', err);
      setError('Błąd podczas włączania GPS');
    }
  }, [startWatching]);

  const revokeConsent = useCallback(() => {
    localStorage.removeItem(GPS_CONSENT_KEY);
    setHasConsent(false);
    stopWatching();
  }, [stopWatching]);

  const centerOnUser = useCallback(() => {
    setCenterRequested(true);
  }, []);

  const clearCenterRequest = useCallback(() => {
    setCenterRequested(false);
  }, []);

  const handleSetMode = useCallback((newMode: GpsMode) => {
    setMode(newMode);
    // Restart watching with new options
    if (hasConsent) {
      stopWatching();
      // Small delay to ensure cleanup
      setTimeout(() => startWatching(), 100);
    }
  }, [hasConsent, stopWatching, startWatching]);

  // Auto-start watching if consent exists
  useEffect(() => {
    if (hasConsent) {
      startWatching();
    }

    return () => {
      stopWatching();
    };
  }, [hasConsent, startWatching, stopWatching]);

  // Restart watching when mode changes
  useEffect(() => {
    if (hasConsent && watchIdRef.current !== null) {
      stopWatching();
      startWatching();
    }
  }, [mode]);

  return {
    location,
    status,
    error,
    hasConsent,
    mode,
    isUnstable,
    permissionState,
    isGpsBlocked,
    requestConsent,
    revokeConsent,
    centerOnUser,
    centerRequested,
    clearCenterRequest,
    setMode: handleSetMode,
  };
}
