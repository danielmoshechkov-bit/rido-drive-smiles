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

export interface GpsState {
  location: UserLocation | null;
  status: GpsStatus;
  error: string | null;
  hasConsent: boolean;
  requestConsent: () => Promise<void>;
  revokeConsent: () => void;
  centerOnUser: () => void;
  centerRequested: boolean;
  clearCenterRequest: () => void;
}

export function useUserLocation(): GpsState {
  const [location, setLocation] = useState<UserLocation | null>(null);
  const [status, setStatus] = useState<GpsStatus>('inactive');
  const [error, setError] = useState<string | null>(null);
  const [hasConsent, setHasConsent] = useState<boolean>(() => {
    return localStorage.getItem(GPS_CONSENT_KEY) === 'true';
  });
  const [centerRequested, setCenterRequested] = useState(false);
  
  const watchIdRef = useRef<number | null>(null);

  const stopWatching = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setStatus('inactive');
    setLocation(null);
  }, []);

  const startWatching = useCallback(() => {
    if (!navigator.geolocation) {
      setStatus('error');
      setError('Geolokalizacja nie jest wspierana przez tę przeglądarkę');
      return;
    }

    setStatus('active');
    setError(null);

    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const newLocation: UserLocation = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          speed: position.coords.speed,
          heading: position.coords.heading,
          timestamp: position.timestamp,
        };

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
      },
      (err) => {
        setStatus('error');
        switch (err.code) {
          case err.PERMISSION_DENIED:
            setError('Brak zgody na lokalizację');
            // Revoke consent if permission was denied
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
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 3000, // Cache for 3 seconds
      }
    );
  }, []);

  const requestConsent = useCallback(async () => {
    try {
      // First check if geolocation is available
      if (!navigator.geolocation) {
        setError('Geolokalizacja nie jest wspierana');
        return;
      }

      // Try to get permission
      if ('permissions' in navigator) {
        try {
          const permission = await navigator.permissions.query({ name: 'geolocation' });
          
          if (permission.state === 'denied') {
            setError('Lokalizacja została zablokowana w ustawieniach przeglądarki');
            return;
          }
        } catch {
          // Some browsers don't support permissions API, continue anyway
        }
      }

      // Store consent
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

  // Auto-start watching if consent exists
  useEffect(() => {
    if (hasConsent) {
      startWatching();
    }

    return () => {
      stopWatching();
    };
  }, [hasConsent, startWatching, stopWatching]);

  return {
    location,
    status,
    error,
    hasConsent,
    requestConsent,
    revokeConsent,
    centerOnUser,
    centerRequested,
    clearCenterRequest,
  };
}
