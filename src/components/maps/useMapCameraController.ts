// GetRido Maps - Camera Controller Hook (Google-like animations)
// Manages follow mode, camera animations, bearing calculation

import { useState, useCallback, useRef, useEffect } from 'react';
import { MapRef } from 'react-map-gl/maplibre';
import { UserLocation, GpsState } from './useUserLocation';
import { NavigationState } from './useNavigation';

const FOLLOW_MODE_STORAGE_KEY = 'getrido_follow_mode';
const MIN_SPEED_FOR_HEADING = 2; // km/h - below this, don't rotate map
const BEARING_BUFFER_SIZE = 3; // Number of positions to calculate bearing from

export type FollowMode = 'off' | 'center' | 'heading';

export interface CameraControllerState {
  followMode: FollowMode;
  calculatedBearing: number | null;
  showFollowDisabledPill: boolean;
  isMapRotated: boolean;
}

export interface CameraControllerActions {
  cycleFollowMode: () => void;
  setFollowMode: (mode: FollowMode) => void;
  handleUserInteraction: () => void;
  setIsDragging: (dragging: boolean) => void;
  restoreFollowMode: () => void;
  dismissPill: () => void;
  resetBearing: () => void;
  animateToNavigation: () => void;
}

export interface CameraController extends CameraControllerState, CameraControllerActions {}

// Calculate bearing between two points
function calculateBearing(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const lat1Rad = lat1 * Math.PI / 180;
  const lat2Rad = lat2 * Math.PI / 180;

  const y = Math.sin(dLng) * Math.cos(lat2Rad);
  const x = Math.cos(lat1Rad) * Math.sin(lat2Rad) - 
            Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLng);
  
  let bearing = Math.atan2(y, x) * 180 / Math.PI;
  bearing = (bearing + 360) % 360;
  
  return bearing;
}

// Calculate speed in km/h
function speedKmh(location: UserLocation | null): number {
  if (!location || location.speed === null) return 0;
  return location.speed * 3.6; // m/s to km/h
}

export function useMapCameraController(
  mapRef: React.RefObject<MapRef>,
  gps: GpsState,
  navigation: NavigationState,
  config: { followModeZoom: number; navigationPitch: number }
): CameraController {
  // Load saved follow mode preference
  const [followMode, setFollowModeState] = useState<FollowMode>(() => {
    const saved = localStorage.getItem(FOLLOW_MODE_STORAGE_KEY);
    return (saved as FollowMode) || 'off';
  });
  
  const [calculatedBearing, setCalculatedBearing] = useState<number | null>(null);
  const [showFollowDisabledPill, setShowFollowDisabledPill] = useState(false);
  const [isMapRotated, setIsMapRotated] = useState(false);
  
  // Position buffer for bearing calculation
  const positionBufferRef = useRef<UserLocation[]>([]);
  const previousFollowModeRef = useRef<FollowMode>(followMode);
  const pillTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isAnimatingRef = useRef(false);

  // Save follow mode to localStorage
  const setFollowMode = useCallback((mode: FollowMode) => {
    setFollowModeState(mode);
    localStorage.setItem(FOLLOW_MODE_STORAGE_KEY, mode);
    
    // Update previous mode for restore functionality
    if (mode !== 'off') {
      previousFollowModeRef.current = mode;
    }
  }, []);

  // Cycle through follow modes: off -> center -> heading -> off
  const cycleFollowMode = useCallback(() => {
    setFollowModeState(current => {
      let next: FollowMode;
      if (current === 'off') next = 'center';
      else if (current === 'center') next = 'heading';
      else next = 'off';
      
      localStorage.setItem(FOLLOW_MODE_STORAGE_KEY, next);
      if (next !== 'off') {
        previousFollowModeRef.current = next;
      }
      
      return next;
    });
    
    // Hide pill if showing
    setShowFollowDisabledPill(false);
    if (pillTimeoutRef.current) {
      clearTimeout(pillTimeoutRef.current);
    }
  }, []);

  // Track if user is actively dragging (not programmatic moves)
  const isDraggingRef = useRef(false);

  // Set dragging state - called from MapsContainer
  const setIsDragging = useCallback((dragging: boolean) => {
    isDraggingRef.current = dragging;
  }, []);

  // Called when user manually drags the map (NOT on any move)
  const handleUserInteraction = useCallback(() => {
    // Only show pill if user is actively dragging AND follow mode is on
    if (followMode !== 'off' && !isAnimatingRef.current && isDraggingRef.current) {
      setFollowMode('off');
      setShowFollowDisabledPill(true);
      
      // Auto-hide pill after 6 seconds
      if (pillTimeoutRef.current) {
        clearTimeout(pillTimeoutRef.current);
      }
      pillTimeoutRef.current = setTimeout(() => {
        setShowFollowDisabledPill(false);
      }, 6000);
    }
  }, [followMode, setFollowMode]);

  // Restore previous follow mode
  const restoreFollowMode = useCallback(() => {
    const modeToRestore = previousFollowModeRef.current || 'center';
    setFollowMode(modeToRestore);
    setShowFollowDisabledPill(false);
    
    if (pillTimeoutRef.current) {
      clearTimeout(pillTimeoutRef.current);
    }
  }, [setFollowMode]);

  // Dismiss the pill manually
  const dismissPill = useCallback(() => {
    setShowFollowDisabledPill(false);
    if (pillTimeoutRef.current) {
      clearTimeout(pillTimeoutRef.current);
    }
  }, []);

  // Reset bearing to north-up
  const resetBearing = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;

    // If in heading mode, switch to center mode first
    if (followMode === 'heading') {
      setFollowMode('center');
    }

    // Animate to north-up
    map.easeTo({
      bearing: 0,
      duration: 300,
      easing: (t) => t * (2 - t), // easeOut
    });
    
    setIsMapRotated(false);
  }, [mapRef, followMode, setFollowMode]);

  // Google-like animation when starting navigation (3D perspective)
  const animateToNavigation = useCallback(() => {
    const map = mapRef.current?.getMap();
    const location = gps.location;
    
    if (!map || !location) return;

    isAnimatingRef.current = true;

    // Calculate initial bearing from GPS or position buffer
    let initialBearing = 0;
    if (location.heading !== null && speedKmh(location) >= MIN_SPEED_FOR_HEADING) {
      initialBearing = location.heading;
    } else if (calculatedBearing !== null) {
      initialBearing = calculatedBearing;
    }

    // Premium fly animation - Google Maps 3D style
    // Zoom closer (18) and tilt more (60°) for immersive navigation
    map.flyTo({
      center: [location.longitude, location.latitude],
      zoom: 18, // Very close zoom for navigation
      bearing: initialBearing,
      pitch: 60, // Strong 3D tilt like Google Maps
      duration: 1500, // Slower, smoother animation
      easing: (t) => {
        // Ease-out quart for premium feel
        return 1 - Math.pow(1 - t, 4);
      },
    });

    // After animation, enable heading follow mode
    setTimeout(() => {
      isAnimatingRef.current = false;
      
      // Only enable heading mode if moving fast enough
      if (speedKmh(gps.location) >= MIN_SPEED_FOR_HEADING) {
        setFollowMode('heading');
      } else {
        setFollowMode('center');
      }
    }, 1600);
  }, [mapRef, gps.location, calculatedBearing, setFollowMode]);

  // Calculate bearing from position buffer
  useEffect(() => {
    const location = gps.location;
    if (!location) return;

    const buffer = positionBufferRef.current;
    
    // Add new position to buffer
    buffer.push(location);
    
    // Keep only last N positions
    if (buffer.length > BEARING_BUFFER_SIZE) {
      buffer.shift();
    }

    // Calculate bearing if we have enough positions
    if (buffer.length >= 2) {
      const oldest = buffer[0];
      const newest = buffer[buffer.length - 1];
      
      const bearing = calculateBearing(
        oldest.latitude, oldest.longitude,
        newest.latitude, newest.longitude
      );
      
      // Only update if significantly different (avoid jitter)
      if (calculatedBearing === null || Math.abs(bearing - calculatedBearing) > 5) {
        setCalculatedBearing(bearing);
      }
    }
  }, [gps.location, calculatedBearing]);

  // Update camera based on follow mode
  useEffect(() => {
    const map = mapRef.current?.getMap();
    const location = gps.location;
    
    if (!map || !location || followMode === 'off' || isAnimatingRef.current) return;

    const speed = speedKmh(location);

    if (followMode === 'center') {
      // Center on user, north-up
      map.easeTo({
        center: [location.longitude, location.latitude],
        duration: 300,
        easing: (t) => t * (2 - t),
      });
    } else if (followMode === 'heading') {
      // If too slow, don't rotate (keeps stable on stationary)
      if (speed < MIN_SPEED_FOR_HEADING) {
        map.easeTo({
          center: [location.longitude, location.latitude],
          duration: 300,
          easing: (t) => t * (2 - t),
        });
      } else {
        // Use GPS heading if available, otherwise calculated bearing
        const bearing = location.heading ?? calculatedBearing ?? 0;
        
        map.easeTo({
          center: [location.longitude, location.latitude],
          bearing: bearing,
          pitch: config.navigationPitch,
          duration: 200,
          easing: (t) => t * (2 - t),
        });
        
        setIsMapRotated(bearing !== 0);
      }
    }
  }, [gps.location, followMode, calculatedBearing, config.navigationPitch, mapRef]);

  // Track if map is rotated (for compass button visibility)
  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;

    const checkRotation = () => {
      const bearing = map.getBearing();
      setIsMapRotated(Math.abs(bearing) > 1);
    };

    map.on('rotate', checkRotation);
    map.on('rotateend', checkRotation);
    
    return () => {
      map.off('rotate', checkRotation);
      map.off('rotateend', checkRotation);
    };
  }, [mapRef]);

  // Auto-enable follow mode when navigation starts
  useEffect(() => {
    if (navigation.isNavigating && followMode === 'off') {
      // Navigation just started, animate and enable follow
      animateToNavigation();
    }
  }, [navigation.isNavigating]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (pillTimeoutRef.current) {
        clearTimeout(pillTimeoutRef.current);
      }
    };
  }, []);

  return {
    followMode,
    calculatedBearing,
    showFollowDisabledPill,
    isMapRotated,
    cycleFollowMode,
    setFollowMode,
    handleUserInteraction,
    setIsDragging,
    restoreFollowMode,
    dismissPill,
    resetBearing,
    animateToNavigation,
  };
}