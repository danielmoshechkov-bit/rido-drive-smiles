// GetRido Maps - Camera Controller Hook (Premium Google-like animations)
// Manages follow mode, camera animations, bearing calculation with SMOOTH motion

import { useState, useCallback, useRef, useEffect } from 'react';
import { MapRef } from 'react-map-gl/maplibre';
import { UserLocation, GpsState } from './useUserLocation';
import { NavigationState } from './useNavigation';

const FOLLOW_MODE_STORAGE_KEY = 'getrido_follow_mode';
const MIN_SPEED_FOR_HEADING = 2; // km/h - below this, don't rotate map
const BEARING_BUFFER_SIZE = 3; // Number of positions to calculate bearing from

// ═══════════════════════════════════════════════════════════════
// PREMIUM SMOOTHNESS CONSTANTS - Google/Yandex quality (FAST & FLUID)
// ═══════════════════════════════════════════════════════════════
const CAMERA_UPDATE_INTERVAL = 250; // ms - 4 FPS smooth camera updates
const GPS_SMOOTH_FACTOR = 0.4; // 40% new, 60% old position - faster response
const BEARING_SMOOTH_FACTOR = 0.2; // Faster bearing changes for responsiveness
const BEARING_CHANGE_THRESHOLD = 5; // degrees - more responsive rotation
const GPS_ACCURACY_THRESHOLD = 50; // meters - slightly more tolerant
const CAMERA_EASE_DURATION = 280; // ms - quick but smooth animation

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

// Normalize angle difference to [-180, 180]
function angleDiff(a: number, b: number): number {
  let diff = ((b - a + 180) % 360) - 180;
  return diff < -180 ? diff + 360 : diff;
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
  
  // ═══════════════════════════════════════════════════════════════
  // SMOOTHING REFS - For premium camera motion
  // ═══════════════════════════════════════════════════════════════
  const lastCameraUpdateRef = useRef<number>(0);
  const smoothedPositionRef = useRef<{ lat: number; lng: number } | null>(null);
  const smoothedBearingRef = useRef<number>(0);

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
      duration: 400,
      easing: (t) => t * (2 - t), // easeOut
    });
    
    smoothedBearingRef.current = 0;
    setIsMapRotated(false);
  }, [mapRef, followMode, setFollowMode]);

  // ═══════════════════════════════════════════════════════════════
  // SMOOTHING FUNCTIONS - Premium quality
  // ═══════════════════════════════════════════════════════════════
  
  // Smooth GPS position using moving average
  const smoothPosition = useCallback((newLat: number, newLng: number) => {
    if (!smoothedPositionRef.current) {
      smoothedPositionRef.current = { lat: newLat, lng: newLng };
      return smoothedPositionRef.current;
    }
    
    // Interpolate: 25% new position, 75% old position
    smoothedPositionRef.current = {
      lat: smoothedPositionRef.current.lat * (1 - GPS_SMOOTH_FACTOR) + newLat * GPS_SMOOTH_FACTOR,
      lng: smoothedPositionRef.current.lng * (1 - GPS_SMOOTH_FACTOR) + newLng * GPS_SMOOTH_FACTOR,
    };
    
    return smoothedPositionRef.current;
  }, []);
  
  // Smooth bearing changes - prevent jerky rotation
  const smoothBearingValue = useCallback((newBearing: number): number => {
    const diff = Math.abs(angleDiff(smoothedBearingRef.current, newBearing));
    
    // Ignore small changes (< threshold)
    if (diff < BEARING_CHANGE_THRESHOLD) {
      return smoothedBearingRef.current;
    }
    
    // Interpolate large changes slowly (15% toward new bearing)
    const delta = angleDiff(smoothedBearingRef.current, newBearing);
    smoothedBearingRef.current = (smoothedBearingRef.current + delta * BEARING_SMOOTH_FACTOR + 360) % 360;
    
    return smoothedBearingRef.current;
  }, []);

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
    
    // Initialize smoothing refs
    smoothedPositionRef.current = { lat: location.latitude, lng: location.longitude };
    smoothedBearingRef.current = initialBearing;

    // Premium fly animation - Google Maps 3D style
    map.flyTo({
      center: [location.longitude, location.latitude],
      zoom: 18,
      bearing: initialBearing,
      pitch: 60,
      duration: 1500,
      easing: (t) => 1 - Math.pow(1 - t, 4), // Ease-out quart
    });

    // After animation, enable heading follow mode
    setTimeout(() => {
      isAnimatingRef.current = false;
      
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
      if (calculatedBearing === null || Math.abs(angleDiff(bearing, calculatedBearing)) > 5) {
        setCalculatedBearing(bearing);
      }
    }
  }, [gps.location, calculatedBearing]);

  // ═══════════════════════════════════════════════════════════════
  // PREMIUM CAMERA UPDATE - Smooth, throttled, professional
  // ═══════════════════════════════════════════════════════════════
  useEffect(() => {
    const map = mapRef.current?.getMap();
    const location = gps.location;
    
    if (!map || !location || followMode === 'off' || isAnimatingRef.current) return;
    
    // THROTTLE: Max update every 900ms
    const now = Date.now();
    if (now - lastCameraUpdateRef.current < CAMERA_UPDATE_INTERVAL) return;
    lastCameraUpdateRef.current = now;
    
    // IGNORE weak GPS (accuracy > 40m)
    if (location.accuracy && location.accuracy > GPS_ACCURACY_THRESHOLD) {
      console.log('[Camera] Ignoring weak GPS:', location.accuracy);
      return;
    }
    
    // SMOOTH position
    const smooth = smoothPosition(location.latitude, location.longitude);
    
    const speed = speedKmh(location);

    // Ease-out quad easing function for natural deceleration
    const easeOutQuad = (t: number) => 1 - (1 - t) * (1 - t);
    
    if (followMode === 'center') {
      // Center on user, north-up - use easeTo for smoothness
      map.easeTo({
        center: [smooth.lng, smooth.lat],
        duration: CAMERA_EASE_DURATION,
        easing: easeOutQuad,
      });
    } else if (followMode === 'heading') {
      // If too slow, don't rotate (keeps stable on stationary)
      if (speed < MIN_SPEED_FOR_HEADING) {
        map.easeTo({
          center: [smooth.lng, smooth.lat],
          duration: CAMERA_EASE_DURATION,
          easing: easeOutQuad,
        });
      } else {
        // Use GPS heading if available, otherwise calculated bearing
        const rawBearing = location.heading ?? calculatedBearing ?? 0;
        const bearing = smoothBearingValue(rawBearing);
        
        map.easeTo({
          center: [smooth.lng, smooth.lat],
          bearing: bearing,
          pitch: config.navigationPitch,
          duration: CAMERA_EASE_DURATION,
          easing: easeOutQuad,
        });
        
        setIsMapRotated(bearing !== 0);
      }
    }
  }, [gps.location, followMode, calculatedBearing, config.navigationPitch, mapRef, smoothPosition, smoothBearingValue]);

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
