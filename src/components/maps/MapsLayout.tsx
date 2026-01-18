// GetRido Maps - Layout Component
// Build timestamp: 2026-01-18T14:00:00Z
import { useState, useEffect, useCallback } from 'react';
import { useRouting } from './useRouting';
import { useUserLocation } from './useUserLocation';
import { useNavigation } from './useNavigation';
import { useIsMobile } from '@/hooks/use-mobile';
import { incidentsService, Incident, BoundingBox } from './incidentsService';
import { assessRouteRisk, RiskAssessment } from './routeRiskService';
import { RidoMapTheme, getDefaultTheme, getMascotMessage } from './ridoMapTheme';
import MapsSidebar from './MapsSidebar';
import MapsContainer from './MapsContainer';
import MapsInfoPanel from './MapsInfoPanel';
import GpsConsentGate from './GpsConsentGate';
import MapsBottomSheet from './MapsBottomSheet';
import MapsFABs from './MapsFABs';
import MobileNavigationBar from './MobileNavigationBar';

const CONSENT_DISMISSED_KEY = 'getrido_consent_dismissed';

const MapsLayout = () => {
  const gps = useUserLocation();
  const routing = useRouting(gps.location ? { latitude: gps.location.latitude, longitude: gps.location.longitude } : null);
  const navigation = useNavigation(routing.route, gps);
  const isMobile = useIsMobile();
  
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

  // Fetch incidents for current route
  const fetchIncidents = useCallback(async () => {
    if (!routing.route) return;
    
    setIncidentsLoading(true);
    try {
      const bbox = getRouteBbox(routing.route.coordinates);
      const fetchedIncidents = await incidentsService.fetchIncidents(bbox);
      setIncidents(fetchedIncidents);
      
      // Calculate risk assessment with fetched incidents
      const routeOption = routing.routeOptions?.find(r => r.id === routing.activeRouteId) || null;
      const risk = assessRouteRisk(routing.route, routeOption, fetchedIncidents);
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
          />
          
          {/* Mobile Navigation Bar (top, during navigation) */}
          {navigation.isNavigating && (
            <MobileNavigationBar navigation={navigation} gps={gps} />
          )}
          
          {/* FAB buttons with theme toggle */}
          <MapsFABs gps={gps} navigation={navigation} onThemeChange={handleThemeChange} />
          
          {/* Bottom Sheet with real incidents & risk */}
          <MapsBottomSheet 
            routing={routing} 
            gps={gps} 
            navigation={navigation}
            incidents={incidents}
            incidentsLoading={incidentsLoading}
            riskAssessment={riskAssessment}
            onRefreshIncidents={handleRefreshIncidents}
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
