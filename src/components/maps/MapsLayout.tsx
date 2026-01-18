// GetRido Maps - Layout Component (Google Maps Premium UX)
// Build timestamp: 2026-01-18T16:00:00Z
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
import { CameraController } from './useMapCameraController';
import MapsSidebar from './MapsSidebar';
import MapsContainer from './MapsContainer';
import MapsInfoPanel from './MapsInfoPanel';
import GpsConsentGate from './GpsConsentGate';
import MapsBottomSheet from './MapsBottomSheet';
import MapsFABs from './MapsFABs';
import MobileNavigationBar from './MobileNavigationBar';
import TurnByTurnBanner from './TurnByTurnBanner';
import TurnBubbleOnMap from './TurnBubbleOnMap';
import SpeedLimitOverlay from './SpeedLimitOverlay';
import RoutePreviewBar from './RoutePreviewBar';
import RouteInputPanel from './RouteInputPanel';
import NavigationBottomBar from './NavigationBottomBar';
import LiveSearchOverlay from './LiveSearchOverlay';
import LocationDetailCard from './LocationDetailCard';
import { AddressSuggestion } from './autocompleteService';
import { addressHistoryService } from './addressHistoryService';

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
  
  // Reroute callback for when user goes off-route
  const handleReroute = useCallback(() => {
    if (gps.location && routing.endCoords) {
      console.log('[MapsLayout] Rerouting from current GPS position...');
      routing.calculateRoute(
        { latitude: gps.location.latitude, longitude: gps.location.longitude },
        routing.endCoords,
        routing.endInput
      );
    }
  }, [gps.location, routing]);
  
  const navigation = useNavigation(routing.route, gps, handleReroute);
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
  
  // === LIVE SEARCH STATE ===
  const [showLiveSearch, setShowLiveSearch] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState<AddressSuggestion | null>(null);
  const [previewMarkers, setPreviewMarkers] = useState<AddressSuggestion[]>([]);
  
  // === CAMERA CONTROLLER REF (from MapsContainer) ===
  const [cameraController, setCameraController] = useState<CameraController | null>(null);
  
  // === CURRENT STEP STATE (for turn-by-turn) ===
  const [distanceToCurrentStep, setDistanceToCurrentStep] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [showRouteInputPanel, setShowRouteInputPanel] = useState(false);

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
  // Find current step and next step based on user position
  const { currentStep, nextStep } = useMemo((): { currentStep: RouteStep | null; nextStep: RouteStep | null } => {
    if (!navigation.isNavigating || !routeSteps.length || !gps.location) {
      return { currentStep: null, nextStep: null };
    }
    
    // Find upcoming steps (skip 'depart' type)
    const upcomingSteps = routeSteps.filter(s => s.maneuver?.type !== 'depart');
    
    return { 
      currentStep: upcomingSteps[0] || null,
      nextStep: upcomingSteps[1] || null,
    };
  }, [navigation.isNavigating, routeSteps, gps.location]);
  
  // Update distance to current step
  useEffect(() => {
    if (currentStep && gps.location) {
      // Calculate distance to maneuver point
      const [lng, lat] = currentStep.maneuver.location;
      const R = 6371000; // Earth radius in meters
      const dLat = (lat - gps.location.latitude) * Math.PI / 180;
      const dLng = (lng - gps.location.longitude) * Math.PI / 180;
      const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                Math.cos(gps.location.latitude * Math.PI / 180) * Math.cos(lat * Math.PI / 180) *
                Math.sin(dLng/2) * Math.sin(dLng/2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
      setDistanceToCurrentStep(R * c);
    }
  }, [currentStep, gps.location]);
  
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
  
  // Handle camera controller ready from MapsContainer
  const handleCameraControllerReady = useCallback((controller: CameraController) => {
    setCameraController(controller);
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
  
  // === LIVE SEARCH HANDLERS ===
  const handleOpenSearch = useCallback(() => {
    setShowLiveSearch(true);
  }, []);
  
  const handleCloseSearch = useCallback(() => {
    setShowLiveSearch(false);
    setPreviewMarkers([]);
  }, []);
  
  const handleSelectLocation = useCallback((location: AddressSuggestion) => {
    setSelectedLocation(location);
    setShowLiveSearch(false);
    setPreviewMarkers([]);
    
    // Save to history
    addressHistoryService.addEndEntry({
      displayName: location.displayName,
      shortName: location.shortName,
      lat: location.lat,
      lng: location.lng,
      type: 'address',
    });
    
    // Set as destination and calculate route - pass coords directly
    const coords = { lat: location.lat, lng: location.lng };
    routing.setEndInput(location.shortName);
    routing.setEndCoords(coords);
    routing.calculateRoute(null, coords, location.shortName);
  }, [routing]);
  
  const handlePreviewLocations = useCallback((locations: AddressSuggestion[]) => {
    setPreviewMarkers(locations);
  }, []);
  
  const handleNavigateToLocation = useCallback(() => {
    if (!selectedLocation) return;
    const coords = { lat: selectedLocation.lat, lng: selectedLocation.lng };
    routing.setEndInput(selectedLocation.shortName);
    routing.setEndCoords(coords);
    routing.calculateRoute(null, coords, selectedLocation.shortName);
  }, [selectedLocation, routing]);
  
  const handleStartNavigation = useCallback(async () => {
    // 1. Trigger fly animation for 3D navigation view
    cameraController?.animateToNavigation();
    
    // 2. Wait for animation before starting navigation
    await new Promise(resolve => setTimeout(resolve, 500));
    await navigation.startNavigation();
    setSelectedLocation(null);
    setShowRouteInputPanel(false);
  }, [navigation, cameraController]);
  
  const handleCloseLocationCard = useCallback(() => {
    setSelectedLocation(null);
  }, []);
  
  const handleExpandRoute = useCallback(() => {
    setShowRouteInputPanel(true);
  }, []);
  
  const handleCloseRouteInputPanel = useCallback(() => {
    setShowRouteInputPanel(false);
  }, []);

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
            onCameraControllerReady={handleCameraControllerReady}
          />
          
          {/* Route Input Panel (Google Maps style - top) */}
          {showRouteInputPanel && !navigation.isNavigating && (
            <RouteInputPanel
              routing={routing}
              gps={gps}
              onClose={handleCloseRouteInputPanel}
            />
          )}
          
          {/* Speed + Limit Overlay (Yandex style - top right when GPS active) */}
          {gps.location && navSettings.show_speed_limit && (
            <SpeedLimitOverlay
              currentSpeed={gps.location?.speed ? Math.round(gps.location.speed * 3.6) : null}
              speedLimit={speedLimitData.limit}
              isEstimatedLimit={speedLimitData.isEstimated}
              yellowThreshold={navSettings.speed_warning_yellow_over}
              redThreshold={navSettings.speed_warning_red_over}
            />
          )}
          
          {/* Turn-by-Turn Navigation - Two styles */}
          {navigation.isNavigating && currentStep && (
            navSettings.navigation_style === 'bubble' ? (
              <TurnBubbleOnMap
                currentStep={currentStep}
                distanceToStep={distanceToCurrentStep}
              />
            ) : (
              <TurnByTurnBanner
                currentStep={currentStep}
                nextStep={nextStep}
                distanceToStep={distanceToCurrentStep}
                onRecenter={cameraController?.resetBearing}
                isMapRotated={cameraController?.isMapRotated}
              />
            )
          )}
          
          {/* Mobile Navigation Bar (bottom stats during navigation) */}
          {navigation.isNavigating && (
            <MobileNavigationBar 
              navigation={navigation} 
              gps={gps}
              currentStep={currentStep}
              speedLimit={speedLimitData.limit}
              isEstimatedLimit={speedLimitData.isEstimated}
              yellowThreshold={navSettings.speed_warning_yellow_over}
              redThreshold={navSettings.speed_warning_red_over}
              showSpeedLimit={false}
              showLaneGuidance={navSettings.show_lane_guidance}
            />
          )}
          
          {/* FAB buttons with theme toggle and follow mode */}
          {!navigation.isNavigating && (
            <MapsFABs 
              gps={gps} 
              navigation={navigation} 
              onThemeChange={handleThemeChange}
              followMode={cameraController?.followMode}
              onCycleFollowMode={cameraController?.cycleFollowMode}
            />
          )}
          
          {/* Route Preview Bar (shows after route calculated, before navigation) */}
          {routing.route && !navigation.isNavigating && !showRouteInputPanel && (
            <RoutePreviewBar
              route={routing.route}
              destination={routing.endInput}
              onStartNavigation={handleStartNavigation}
              onExpand={handleExpandRoute}
              isLoading={routing.isLoading}
            />
          )}
          
          {/* Bottom Sheet with search (only when no route) */}
          {!routing.route && !showRouteInputPanel && (
            <MapsBottomSheet 
              routing={routing} 
              gps={gps} 
              navigation={navigation}
              cameraController={cameraController ?? undefined}
              incidents={incidents}
              incidentsLoading={incidentsLoading}
              riskAssessment={riskAssessment}
              onRefreshIncidents={handleRefreshIncidents}
              isLandscape={isLandscape}
            />
          )}
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
