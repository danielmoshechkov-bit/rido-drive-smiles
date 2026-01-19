// GetRido Maps - Smooth Position Hook (60 FPS marker interpolation)
// Provides buttery smooth marker movement like Google Maps / Yandex Navigator
// Uses refs instead of state to avoid triggering re-renders on every frame
// v2: Added outlier filtering, EMA, accuracy-based smoothing

import { useEffect, useRef, useState } from 'react';
import { UserLocation } from './useUserLocation';

// ═══════════════════════════════════════════════════════════════
// SMOOTHING CONSTANTS - Tuned for professional navigation feel
// ═══════════════════════════════════════════════════════════════
const BASE_LERP_FACTOR = 0.18;        // Base interpolation (18% per frame)
const MIN_DISTANCE_THRESHOLD = 0.3;   // Meters - below this, snap to target
const STATE_UPDATE_FRAME_INTERVAL = 8; // Update React state every N frames (60/8 = 7.5 FPS)

// Outlier detection
const MAX_JUMP_DISTANCE = 50;         // Meters - reject jumps larger than this
const MIN_ACCURACY_FOR_UPDATE = 100;  // Meters - ignore very weak GPS
const TELEPORT_THRESHOLD = 200;       // Meters - force snap if teleported (new route etc.)

// Heading smoothing
const HEADING_LERP_FACTOR = 0.12;     // Slower heading changes for stability
const MIN_SPEED_FOR_HEADING = 1.5;    // m/s - below this, don't trust GPS heading

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
  // Approximation for short distances
  const a = dLat * dLat + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * dLng * dLng;
  return R * Math.sqrt(a);
}

// Smooth angle interpolation (handles 0/360 wrap-around)
function lerpAngle(from: number, to: number, t: number): number {
  let diff = ((to - from + 180) % 360) - 180;
  if (diff < -180) diff += 360;
  return (from + diff * t + 360) % 360;
}

// Calculate bearing from position history
function calculateBearingFromHistory(positions: { lat: number; lng: number }[]): number | null {
  if (positions.length < 2) return null;
  
  const oldest = positions[0];
  const newest = positions[positions.length - 1];
  
  const dLng = (newest.lng - oldest.lng) * Math.PI / 180;
  const lat1Rad = oldest.lat * Math.PI / 180;
  const lat2Rad = newest.lat * Math.PI / 180;
  
  const y = Math.sin(dLng) * Math.cos(lat2Rad);
  const x = Math.cos(lat1Rad) * Math.sin(lat2Rad) - 
            Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLng);
  
  let bearing = Math.atan2(y, x) * 180 / Math.PI;
  return (bearing + 360) % 360;
}

export function useSmoothPosition(gpsLocation: UserLocation | null): SmoothPosition {
  // Animation state in refs (no re-renders during animation)
  const animationStateRef = useRef({
    targetLat: 0,
    targetLng: 0,
    targetHeading: 0 as number | null,
    currentLat: 0,
    currentLng: 0,
    currentHeading: 0,
    isInitialized: false,
    frameCount: 0,
    lastValidLat: 0,
    lastValidLng: 0,
    lastUpdateTime: 0,
    positionHistory: [] as { lat: number; lng: number; time: number }[],
  });
  
  // React state - updated at reduced frequency for UI
  const [smoothPosition, setSmoothPosition] = useState<SmoothPosition>({
    lat: 0,
    lng: 0,
    heading: null,
  });
  
  const animationRef = useRef<number | null>(null);
  
  // Update target when GPS changes (with outlier filtering)
  useEffect(() => {
    if (!gpsLocation) return;
    
    const state = animationStateRef.current;
    const now = Date.now();
    
    // ═══════════════════════════════════════════════════════════════
    // OUTLIER DETECTION - Reject bad GPS readings
    // ═══════════════════════════════════════════════════════════════
    
    // Reject if accuracy is too poor
    if (gpsLocation.accuracy && gpsLocation.accuracy > MIN_ACCURACY_FOR_UPDATE) {
      console.log('[SmoothPos] Rejected: poor accuracy', gpsLocation.accuracy);
      return;
    }
    
    // Check for unrealistic jumps (unless first fix or teleport)
    if (state.isInitialized) {
      const jumpDistance = quickDistance(
        state.lastValidLat, state.lastValidLng,
        gpsLocation.latitude, gpsLocation.longitude
      );
      
      const timeDelta = now - state.lastUpdateTime;
      const maxReasonableDistance = Math.max(
        MAX_JUMP_DISTANCE,
        (gpsLocation.speed || 5) * (timeDelta / 1000) * 1.5 // Allow 1.5x expected distance
      );
      
      // If jump is unrealistic but not a teleport (new route), reject
      if (jumpDistance > maxReasonableDistance && jumpDistance < TELEPORT_THRESHOLD) {
        console.log('[SmoothPos] Rejected: outlier jump', jumpDistance.toFixed(0), 'm');
        return;
      }
      
      // If teleport detected (very large jump), snap immediately
      if (jumpDistance > TELEPORT_THRESHOLD) {
        console.log('[SmoothPos] Teleport detected, snapping', jumpDistance.toFixed(0), 'm');
        state.currentLat = gpsLocation.latitude;
        state.currentLng = gpsLocation.longitude;
      }
    }
    
    // ═══════════════════════════════════════════════════════════════
    // UPDATE TARGETS
    // ═══════════════════════════════════════════════════════════════
    
    state.targetLat = gpsLocation.latitude;
    state.targetLng = gpsLocation.longitude;
    state.lastValidLat = gpsLocation.latitude;
    state.lastValidLng = gpsLocation.longitude;
    state.lastUpdateTime = now;
    
    // ═══════════════════════════════════════════════════════════════
    // HEADING LOGIC - Use GPS heading only at speed, otherwise calculate
    // ═══════════════════════════════════════════════════════════════
    const speed = gpsLocation.speed || 0;
    
    if (speed >= MIN_SPEED_FOR_HEADING && gpsLocation.heading !== null) {
      // Trust GPS heading at speed
      state.targetHeading = gpsLocation.heading;
    } else {
      // Calculate heading from position history
      state.positionHistory.push({ lat: gpsLocation.latitude, lng: gpsLocation.longitude, time: now });
      
      // Keep last 5 positions from last 3 seconds
      state.positionHistory = state.positionHistory.filter(p => now - p.time < 3000).slice(-5);
      
      if (state.positionHistory.length >= 2) {
        const calculatedHeading = calculateBearingFromHistory(state.positionHistory);
        if (calculatedHeading !== null) {
          state.targetHeading = calculatedHeading;
        }
      }
    }
    
    // Initialize on first valid fix
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
  }, [gpsLocation]);
  
  // ═══════════════════════════════════════════════════════════════
  // 60 FPS ANIMATION LOOP - Interpolates position smoothly
  // ═══════════════════════════════════════════════════════════════
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
      
      // ═══════════════════════════════════════════════════════════════
      // ADAPTIVE LERP - Faster when far, slower when close
      // ═══════════════════════════════════════════════════════════════
      const distance = quickDistance(state.currentLat, state.currentLng, state.targetLat, state.targetLng);
      
      // Adjust lerp based on frame time (target 60 FPS = 16.67ms)
      const frameRatio = Math.min(deltaTime / 16.67, 2);
      
      // Adaptive lerp: faster catch-up when far from target
      let adaptiveLerp = BASE_LERP_FACTOR * frameRatio;
      if (distance > 10) {
        adaptiveLerp = Math.min(0.4, adaptiveLerp * 1.5); // Speed up for large gaps
      } else if (distance < 1) {
        adaptiveLerp = Math.min(0.5, adaptiveLerp * 2); // Quick snap when very close
      }
      
      // Only interpolate if we're far enough from target
      if (distance > MIN_DISTANCE_THRESHOLD) {
        state.currentLat = state.currentLat + (state.targetLat - state.currentLat) * adaptiveLerp;
        state.currentLng = state.currentLng + (state.targetLng - state.currentLng) * adaptiveLerp;
      } else {
        // Snap to target when very close
        state.currentLat = state.targetLat;
        state.currentLng = state.targetLng;
      }
      
      // ═══════════════════════════════════════════════════════════════
      // HEADING INTERPOLATION - Slower for stability
      // ═══════════════════════════════════════════════════════════════
      if (state.targetHeading !== null) {
        const headingLerp = HEADING_LERP_FACTOR * frameRatio;
        state.currentHeading = lerpAngle(state.currentHeading, state.targetHeading, headingLerp);
      }
      
      // Update React state at reduced frequency (to limit re-renders)
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
