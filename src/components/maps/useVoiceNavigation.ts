// GetRido Maps - Voice Navigation Hook
import { useEffect, useRef, useCallback } from 'react';
import type { RouteStep } from './routingService';
import type { UserLocation } from './useUserLocation';
import type { NavigationState } from './useNavigation';
import type { NavigationSettings } from './useNavigationSettings';
import * as VoiceService from './voiceGuidanceService';
import { getManeuverPhraseKey, buildPhrase, VoiceLanguage } from './voicePhrases';

interface UseVoiceNavigationProps {
  steps: RouteStep[];
  currentLocation: UserLocation | null;
  navigation: NavigationState;
  settings: NavigationSettings;
}

interface ManeuverAnnouncement {
  stepIndex: number;
  distance: number; // Distance threshold that was announced
}

// Calculate distance between two points (Haversine)
function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000; // Earth radius in meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Distance in meters
}

// Get announcement thresholds based on current speed
function getAnnouncementThresholds(speedKmh: number): number[] {
  // Higher speed = earlier announcements
  if (speedKmh > 80) {
    return [700, 400, 200, 80];
  } else if (speedKmh > 50) {
    return [400, 200, 80];
  } else {
    return [200, 80, 30];
  }
}

export function useVoiceNavigation({
  steps,
  currentLocation,
  navigation,
  settings,
}: UseVoiceNavigationProps) {
  const announcedRef = useRef<ManeuverAnnouncement[]>([]);
  const initializedRef = useRef(false);

  // Initialize voice service
  useEffect(() => {
    if (!initializedRef.current) {
      VoiceService.initVoices();
      initializedRef.current = true;
    }
  }, []);

  // Update voice settings
  useEffect(() => {
    VoiceService.updateSettings({
      enabled: settings.voice_enabled,
      language: settings.voice_language,
      volume: settings.voice_volume,
      rate: settings.voice_rate,
    });
  }, [settings.voice_enabled, settings.voice_language, settings.voice_volume, settings.voice_rate]);

  // Cancel voice on navigation stop
  useEffect(() => {
    if (!navigation.isNavigating) {
      VoiceService.cancel();
      announcedRef.current = [];
    }
  }, [navigation.isNavigating]);

  // Process announcements
  useEffect(() => {
    if (!navigation.isNavigating || !currentLocation || !settings.voice_enabled || steps.length === 0) {
      return;
    }

    const speedKmh = currentLocation.speed ? currentLocation.speed * 3.6 : 30;
    const thresholds = getAnnouncementThresholds(speedKmh);

    // Find next maneuver (skip first step which is usually 'depart')
    for (let i = 1; i < steps.length; i++) {
      const step = steps[i];
      if (!step.maneuver) continue;

      const [maneuverLng, maneuverLat] = step.maneuver.location;
      const distanceToManeuver = haversineDistance(
        currentLocation.latitude,
        currentLocation.longitude,
        maneuverLat,
        maneuverLng
      );

      // Check each threshold
      for (const threshold of thresholds) {
        // Already announced this step at this threshold?
        const alreadyAnnounced = announcedRef.current.some(
          a => a.stepIndex === i && a.distance === threshold
        );

        if (alreadyAnnounced) continue;

        // Within range for this threshold?
        // Use a window: threshold - 20% to threshold + 20%
        const minDist = threshold * 0.8;
        const maxDist = threshold * 1.2;

        if (distanceToManeuver >= minDist && distanceToManeuver <= maxDist) {
          // Build announcement
          const phraseKey = getManeuverPhraseKey(step.maneuver.type, step.maneuver.modifier);
          
          if (phraseKey) {
            const lang = settings.voice_language as VoiceLanguage;
            let announcement = '';

            // Distance prefix
            if (threshold >= 300) {
              announcement = buildPhrase(lang, 'inMeters', { distance: Math.round(threshold) }) + ', ';
            } else if (threshold >= 100) {
              announcement = buildPhrase(lang, 'inMeters', { distance: Math.round(threshold) }) + ', ';
            }

            // Maneuver phrase
            if (phraseKey === 'roundaboutExit' && step.maneuver.exit) {
              announcement += buildPhrase(lang, 'roundaboutExit', { exit: step.maneuver.exit });
            } else {
              announcement += buildPhrase(lang, phraseKey);
            }

            // Speak it
            VoiceService.speak(announcement);

            // Mark as announced
            announcedRef.current.push({ stepIndex: i, distance: threshold });
          }

          // Only announce one maneuver at a time
          return;
        }
      }
    }
  }, [currentLocation, navigation.isNavigating, settings.voice_enabled, settings.voice_language, steps]);

  // Manual announcement trigger (for testing)
  const announceManeuver = useCallback((text: string) => {
    if (settings.voice_enabled) {
      VoiceService.speak(text);
    }
  }, [settings.voice_enabled]);

  return {
    announceManeuver,
    isVoiceAvailable: VoiceService.isVoiceAvailable(),
  };
}
