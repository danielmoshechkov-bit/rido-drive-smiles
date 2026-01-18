// GetRido Maps - Layout Component
// Build timestamp: 2026-01-18T15:00:00Z
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouting } from './useRouting';
import { useUserLocation } from './useUserLocation';
import { useNavigation } from './useNavigation';
import { useNavigationSettings } from './useNavigationSettings';
import { useVoiceNavigation } from './useVoiceNavigation';
import { useIsMobile } from '@/hooks/use-mobile';
import { useOrientation } from '@/hooks/useOrientation';
import { incidentsService, Incident, BoundingBox, filterIncidentsNearRoute } from './incidentsService';
import { assessRouteRisk, RiskAssessment } from './routeRiskService';
import { RidoMapTheme, getDefaultTheme, getMascotMessage } from './ridoMapTheme';
import type { RouteStep } from './routingService';
import MapsSidebar from './MapsSidebar';
import MapsContainer from './MapsContainer';
import MapsInfoPanel from './MapsInfoPanel';
import GpsConsentGate from './GpsConsentGate';
import MapsBottomSheet from './MapsBottomSheet';
import MapsFABs from './MapsFABs';
import MobileNavigationBar from './MobileNavigationBar';

// Speed limit fallback by road class (when OSRM doesn't provide maxspeed)
const SPEED_LIMIT_FALLBACK: Record<string, number> = {
  motorway: 140,
  trunk: 100,
  primary: 90,
  secondary: 70,
  tertiary: 50,
  residential: 50,
  service: 30,
};

const CONSENT_DISMISSED_KEY = 'getrido_consent_dismissed';

const MapsLayout = () => {
  const gps = useUserLocation();
  const routing = useRouting(gps.location ? { latitude: gps.location.latitude, longitude: gps.location.longitude } : null);
  const navigation = useNavigation(routing.route, gps);
  const { settings: navSettings } = useNavigationSettings();
  const isMobile = useIsMobile();
  const orientation = useOrientation();
  const isLandscape = isMobile && orientation === 'landscape';
  
  const [showConsentGate, setShowConsentGate] = useState(!gps.hasConsent);
  const [consentDismissed, setConsentDismissed] = useState(() => 
    localStorage.getItem(CONSENT_DISMISSED_KEY) === 'true'
  );

  // === MAP THEME STATE ===
  const [mapTheme, setMapTheme] = useState<RidoMapTheme>(() => getDefaultTheme());
  
  // === MASCOT MESSAGE STATE ===
  const [mascotMessage, setMascotMessage] = useState<string>('');

  // === INCIDENTS STATE ===
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [incidentsLoading, setIncidentsLoading] = useState(false);
  const [riskAssessment, setRiskAssessment] = useState<RiskAssessment | null>(null);

  // Calculate bbox from route coordinates + buffer
  const getRouteBbox = useCallback((coords: [number, number][], buffer = 0.02): BoundingBox => {
    let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
    coords.forEach(([lng, lat]) => {
      minLat = Math.min(minLat, lat);
      maxLat = Math.max(maxLat, lat);
      minLng = Math.min(minLng, lng);
      maxLng = Math.max(maxLng, lng);
    });
    return {
      minLat: minLat - buffer,
      maxLat: maxLat + buffer,
      minLng: minLng - buffer,
      maxLng: maxLng + buffer,
    };
  }, []);

  // Fetch incidents for current route and filter to only those near route
  const fetchIncidents = useCallback(async () => {
    if (!routing.route) return;
    
    setIncidentsLoading(true);
    try {
      const bbox = getRouteBbox(routing.route.coordinates);
      const fetchedIncidents = await incidentsService.fetchIncidents(bbox);
      
      // Filter to only incidents within 200m of the route
      const nearRouteIncidents = filterIncidentsNearRoute(
        fetchedIncidents, 
        routing.route.coordinates, 
        200 // 200 meters from route
      );
      
      console.log(`[MapsLayout] Filtered ${fetchedIncidents.length} incidents to ${nearRouteIncidents.length} on route`);
      setIncidents(nearRouteIncidents);
      
      // Calculate risk assessment with filtered incidents
      const routeOption = routing.routeOptions?.find(r => r.id === routing.activeRouteId) || null;
      const risk = assessRouteRisk(routing.route, routeOption, nearRouteIncidents);
      setRiskAssessment(risk);
    } catch (error) {
      console.error('[MapsLayout] Failed to fetch incidents:', error);
    } finally {
      setIncidentsLoading(false);
    }
  }, [routing.route, routing.routeOptions, routing.activeRouteId, getRouteBbox]);

  // Auto-fetch incidents when route changes (stable ref via route id)
  const routeId = routing.route ? `${routing.route.coordinates.length}-${routing.route.distance}` : null;
  
  useEffect(() => {
    if (routeId && routing.route) {
      incidentsService.clearCache();
      fetchIncidents();
    } else {
      setIncidents([]);
      setRiskAssessment(null);
    }
  }, [routeId]);

  // === VOICE NAVIGATION ===
  // Get route steps for voice guidance
  const routeSteps = routing.route?.steps || [];
  
  // Initialize voice navigation
  useVoiceNavigation({
    steps: routeSteps,
    currentLocation: gps.location,
    navigation,
    settings: navSettings,
  });
  
  // === CURRENT STEP & SPEED LIMIT ===
  // Find current step based on user position (simplified - use first upcoming step)
  const currentStep = useMemo((): RouteStep | null => {
    if (!navigation.isNavigating || !routeSteps.length || !gps.location) {
      return null;
    }
    // For MVP: return first step that's not 'depart'
    return routeSteps.find(s => s.maneuver?.type !== 'depart') || null;
  }, [navigation.isNavigating, routeSteps, gps.location]);
  
  // Get speed limit from current step or fallback
  const speedLimitData = useMemo(() => {
    if (!currentStep) {
      return { limit: null, isEstimated: false };
    }
    
    if (currentStep.maxspeed) {
      return { limit: currentStep.maxspeed, isEstimated: false };
    }
    
    // Fallback based on road name (simplified heuristic)
    const name = currentStep.name?.toLowerCase() || '';
    if (name.includes('autostrada') || name.includes('a1') || name.includes('a2') || name.includes('a4')) {
      return { limit: SPEED_LIMIT_FALLBACK.motorway, isEstimated: true };
    }
    if (name.includes('ekspresowa') || name.includes('s')) {
      return { limit: SPEED_LIMIT_FALLBACK.trunk, isEstimated: true };
    }
    
    // Default residential
    return { limit: SPEED_LIMIT_FALLBACK.residential, isEstimated: true };
  }, [currentStep]);

  // Update mascot message based on current state
  useEffect(() => {
    const message = getMascotMessage({
      hasRoute: !!routing.route,
      isNavigating: navigation.isNavigating,
      incidentsCount: incidents.length,
      hasGps: gps.hasConsent && !!gps.location,
      gpsAccuracy: gps.location?.accuracy,
    });
    setMascotMessage(message);
  }, [routing.route, navigation.isNavigating, incidents.length, gps.hasConsent, gps.location]);

  // Handle theme change from FABs
  const handleThemeChange = useCallback((theme: RidoMapTheme) => {
    setMapTheme(theme);
  }, []);

  // Handle manual refresh with cooldown check
  const handleRefreshIncidents = useCallback(() => {
    if (incidentsService.canRefresh()) {
      fetchIncidents();
    }
  }, [fetchIncidents]);

  // Update consent gate visibility when hasConsent changes
  useEffect(() => {
    if (gps.hasConsent) {
      setShowConsentGate(false);
    }
  }, [gps.hasConsent]);

  const handleAcceptConsent = async () => {
    await gps.requestConsent();
    setShowConsentGate(false);
    localStorage.removeItem(CONSENT_DISMISSED_KEY);
    setConsentDismissed(false);
  };

  const handleDismissConsent = () => {
    setShowConsentGate(false);
    setConsentDismissed(true);
    localStorage.setItem(CONSENT_DISMISSED_KEY, 'true');
  };

  // Show fullscreen consent gate if needed
  const shouldShowConsentGate = showConsentGate && !gps.hasConsent && !consentDismissed;

  // MOBILE LAYOUT (< 768px)
  if (isMobile) {
    return (
      <>
        {shouldShowConsentGate && (
          <GpsConsentGate 
            gps={gps}
            onAccept={handleAcceptConsent}
            onDismiss={handleDismissConsent}
          />
        )}

        <div className={`relative h-full w-full overflow-hidden maps-fullscreen ${mapTheme === 'dark' ? 'rido-map-vignette-dark' : ''}`}>
          {/* Fullscreen Map */}
          <MapsContainer 
            routing={routing} 
            gps={gps} 
            navigation={navigation}
            incidents={incidents}
            mapTheme={mapTheme}
            mascotMessage={mascotMessage}
            isMobile={true}
          />
          
          {/* Mobile Navigation Bar (top, during navigation) */}
          {navigation.isNavigating && (
            <MobileNavigationBar 
              navigation={navigation} 
              gps={gps}
              currentStep={currentStep}
              speedLimit={speedLimitData.limit}
              isEstimatedLimit={speedLimitData.isEstimated}
              yellowThreshold={navSettings.speed_warning_yellow_over}
              redThreshold={navSettings.speed_warning_red_over}
              showSpeedLimit={navSettings.show_speed_limit}
              showLaneGuidance={navSettings.show_lane_guidance}
            />
          )}
          
          {/* FAB buttons with theme toggle */}
          <MapsFABs gps={gps} navigation={navigation} onThemeChange={handleThemeChange} />
          
          {/* Bottom Sheet with real incidents & risk (minimized in landscape) */}
          <MapsBottomSheet 
            routing={routing} 
            gps={gps} 
            navigation={navigation}
            incidents={incidents}
            incidentsLoading={incidentsLoading}
            riskAssessment={riskAssessment}
            onRefreshIncidents={handleRefreshIncidents}
            isLandscape={isLandscape}
          />
        </div>
      </>
    );
  }

  // DESKTOP LAYOUT (>= 768px)
  return (
    <>
      {shouldShowConsentGate && (
        <GpsConsentGate 
          gps={gps}
          onAccept={handleAcceptConsent}
          onDismiss={handleDismissConsent}
        />
      )}

      <div className={`flex flex-1 h-full overflow-hidden ${mapTheme === 'dark' ? 'rido-map-vignette-dark' : ''}`}>
        <MapsSidebar 
          routing={routing} 
          gps={gps} 
          navigation={navigation}
          riskAssessment={riskAssessment}
          incidentsCount={incidents.length}
        />
        <MapsContainer 
          routing={routing} 
          gps={gps} 
          navigation={navigation}
          incidents={incidents}
          mapTheme={mapTheme}
          mascotMessage={mascotMessage}
          speedLimit={speedLimitData.limit}
          isEstimatedLimit={speedLimitData.isEstimated}
          showSpeedLimit={navSettings.show_speed_limit}
        />
        <MapsInfoPanel 
          gps={gps} 
          routing={{
            route: routing.route,
            aiAnalysis: routing.aiAnalysis,
            incidents,
            incidentsLoading,
            onRefreshIncidents: handleRefreshIncidents,
          }}
          riskAssessment={riskAssessment}
        />
      </div>
    </>
  );
};

export default MapsLayout;
