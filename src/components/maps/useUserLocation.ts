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

export interface GpsState {
  location: UserLocation | null;
  status: GpsStatus;
  error: string | null;
  hasConsent: boolean;
  mode: GpsMode;
  isUnstable: boolean;
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
  
  const watchIdRef = useRef<number | null>(null);
  const fallbackIntervalRef = useRef<number | null>(null);
  const prevLocationRef = useRef<UserLocation | null>(null);
  const lastUpdateRef = useRef<number>(0);

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
  }, []);

  const startWatching = useCallback(() => {
    if (!navigator.geolocation) {
      setStatus('error');
      setError('Geolokalizacja nie jest wspierana przez tę przeglądarkę');
      return;
    }

    setStatus('active');
    setError(null);

    // GPS options based on mode
    const options: PositionOptions = mode === 'navigation' 
      ? {
          enableHighAccuracy: true,
          timeout: 8000,
          maximumAge: 500, // Aggressive for navigation
        }
      : {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 3000, // Normal mode
        };

    const handlePosition = (position: GeolocationPosition) => {
      const newLocation: UserLocation = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
        speed: position.coords.speed,
        heading: position.coords.heading,
        timestamp: position.timestamp,
      };

      // Check for GPS jump in navigation mode
      if (mode === 'navigation' && isJump(prevLocationRef.current, newLocation)) {
        console.warn('[GPS] Detected suspicious jump, marking as unstable');
        setIsUnstable(true);
        // Still update location but mark as unstable
      } else {
        setIsUnstable(false);
      }

      prevLocationRef.current = newLocation;
      lastUpdateRef.current = Date.now();
      setLocation(newLocation);
      
      // Weak signal if accuracy > 100 meters
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

    // Fallback interval for navigation mode - if watchPosition doesn't update for 4 seconds
    if (mode === 'navigation') {
      fallbackIntervalRef.current = window.setInterval(() => {
        const timeSinceUpdate = Date.now() - lastUpdateRef.current;
        if (timeSinceUpdate > 4000) {
          console.log('[GPS] Fallback: requesting current position');
          navigator.geolocation.getCurrentPosition(handlePosition, handleError, options);
        }
      }, 4000);
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
    requestConsent,
    revokeConsent,
    centerOnUser,
    centerRequested,
    clearCenterRequest,
    setMode: handleSetMode,
  };
}
