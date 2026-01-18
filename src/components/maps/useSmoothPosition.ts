// GetRido Maps - Smooth Position Hook (60 FPS marker interpolation)
// Provides buttery smooth marker movement like Google Maps / Yandex Navigator
// Uses refs instead of state to avoid triggering re-renders on every frame

import { useEffect, useRef, useState, useCallback } from 'react';
import { UserLocation } from './useUserLocation';

// Interpolation factor - higher = faster catch-up (0.12 = 12% per frame)
const LERP_FACTOR = 0.15;
// Minimum distance (meters) to start interpolating - prevents jitter at rest
const MIN_DISTANCE_THRESHOLD = 0.3;
// Update React state every N frames (60 / 10 = 6 state updates per second max)
const STATE_UPDATE_FRAME_INTERVAL = 10;

export interface SmoothPosition {
  lat: number;
  lng: number;
  heading: number | null;
}

// Calculate distance between two points in meters (fast approximation)
function quickDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000; // Earth radius in meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = dLat * dLat + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * dLng * dLng;
  return R * Math.sqrt(a);
}

// Smooth angle interpolation (handles 0/360 wrap-around)
function lerpAngle(from: number, to: number, t: number): number {
  let diff = ((to - from + 180) % 360) - 180;
  if (diff < -180) diff += 360;
  return (from + diff * t + 360) % 360;
}

export function useSmoothPosition(gpsLocation: UserLocation | null): SmoothPosition {
  // Use ref for animation state to avoid re-render loops
  const animationStateRef = useRef({
    targetLat: 0,
    targetLng: 0,
    targetHeading: 0 as number | null,
    currentLat: 0,
    currentLng: 0,
    currentHeading: 0,
    isInitialized: false,
    frameCount: 0,
  });
  
  // Only state that triggers re-render - updated at reduced frequency
  const [smoothPosition, setSmoothPosition] = useState<SmoothPosition>({
    lat: 0,
    lng: 0,
    heading: null,
  });
  
  // Animation frame handle
  const animationRef = useRef<number | null>(null);
  
  // Update target when GPS changes
  useEffect(() => {
    if (gpsLocation) {
      const state = animationStateRef.current;
      state.targetLat = gpsLocation.latitude;
      state.targetLng = gpsLocation.longitude;
      state.targetHeading = gpsLocation.heading;
      
      // Initialize position on first GPS fix
      if (!state.isInitialized) {
        state.currentLat = gpsLocation.latitude;
        state.currentLng = gpsLocation.longitude;
        state.currentHeading = gpsLocation.heading || 0;
        state.isInitialized = true;
        setSmoothPosition({
          lat: gpsLocation.latitude,
          lng: gpsLocation.longitude,
          heading: gpsLocation.heading,
        });
      }
    }
  }, [gpsLocation]);
  
  // 60 FPS animation loop - updates refs internally, state less frequently
  useEffect(() => {
    let lastTime = performance.now();
    
    const animate = (time: number) => {
      const state = animationStateRef.current;
      
      if (!state.isInitialized) {
        animationRef.current = requestAnimationFrame(animate);
        return;
      }
      
      const deltaTime = time - lastTime;
      lastTime = time;
      
      // Adjust lerp factor based on actual frame time (target 60 FPS)
      const adjustedLerp = Math.min(LERP_FACTOR * (deltaTime / 16.67), 0.5);
      
      // Calculate distance to target
      const distance = quickDistance(state.currentLat, state.currentLng, state.targetLat, state.targetLng);
      
      // Only interpolate if we're far enough from target (prevents jitter)
      if (distance > MIN_DISTANCE_THRESHOLD) {
        // Lerp position
        state.currentLat = state.currentLat + (state.targetLat - state.currentLat) * adjustedLerp;
        state.currentLng = state.currentLng + (state.targetLng - state.currentLng) * adjustedLerp;
      } else {
        // Snap to target when very close
        state.currentLat = state.targetLat;
        state.currentLng = state.targetLng;
      }
      
      // Lerp heading (if available)
      if (state.targetHeading !== null) {
        state.currentHeading = lerpAngle(state.currentHeading, state.targetHeading, adjustedLerp * 0.8);
      }
      
      // Only update React state every N frames to limit re-renders
      state.frameCount++;
      if (state.frameCount >= STATE_UPDATE_FRAME_INTERVAL) {
        state.frameCount = 0;
        setSmoothPosition({
          lat: state.currentLat,
          lng: state.currentLng,
          heading: state.targetHeading !== null ? state.currentHeading : null,
        });
      }
      
      animationRef.current = requestAnimationFrame(animate);
    };
    
    animationRef.current = requestAnimationFrame(animate);
    
    return () => {
      if (animationRef.current !== null) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);
  
  return smoothPosition;
}
