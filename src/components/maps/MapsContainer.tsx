import { useState, useCallback, useEffect } from 'react';
import Map, { Marker, NavigationControl, ScaleControl, Source, Layer } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Layers, Car, Navigation, Route, Construction, AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { DEFAULT_VIEW_STATE, MAP_STYLE, RIDO_COLORS } from './mapStyles';
import { RoutingState } from './useRouting';
import { GpsState } from './useUserLocation';
import { NavigationState } from './useNavigation';
import { Incident } from './incidentsService';
import { useMapsConfig } from '@/hooks/useMapsConfig';
import NavigationPanel from './NavigationPanel';

// ═══════════════════════════════════════════════════════════════
// RIDO Mascot - Inline SVG Component (violet + gold)
// ═══════════════════════════════════════════════════════════════
const RidoMascotSVG = ({ size = 24, className = "" }: { size?: number; className?: string }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} className={className} fill="none">
    {/* Main head - white fill */}
    <circle cx="12" cy="12" r="9" fill="white" />
    {/* Eyes - gold */}
    <circle cx="8.5" cy="10" r="1.8" fill={RIDO_COLORS.markerGold} />
    <circle cx="15.5" cy="10" r="1.8" fill={RIDO_COLORS.markerGold} />
    {/* Pupils */}
    <circle cx="8.5" cy="10" r="0.6" fill={RIDO_COLORS.routeOutline} />
    <circle cx="15.5" cy="10" r="0.6" fill={RIDO_COLORS.routeOutline} />
    {/* Smile - gold */}
    <path d="M7 14 Q12 18 17 14" stroke={RIDO_COLORS.markerGold} strokeWidth="1.5" fill="none" strokeLinecap="round" />
    {/* Horns/ears - violet */}
    <path d="M4 4 L7.5 9.5 L5 8 Z" fill={RIDO_COLORS.routePrimary} />
    <path d="M20 4 L16.5 9.5 L19 8 Z" fill={RIDO_COLORS.routePrimary} />
  </svg>
);

interface MapsContainerProps {
  routing: RoutingState;
  gps: GpsState;
  navigation: NavigationState & {
    stopNavigation: () => void;
    toggleFollowMode: () => void;
  };
  incidents?: Incident[];
  showIncidentsLayer?: boolean;
}

const MapsContainer = ({ routing, gps, navigation, incidents = [], showIncidentsLayer = true }: MapsContainerProps) => {
  const { config, isLoading: configLoading } = useMapsConfig();
  const [viewState, setViewState] = useState(DEFAULT_VIEW_STATE);
  const { route, alternativeRoute, showAlternative, startCoords, endCoords } = routing;
  const { location, status, centerRequested, clearCenterRequest, hasConsent } = gps;

  const handleMove = useCallback((evt: { viewState: typeof DEFAULT_VIEW_STATE }) => {
    // Don't update viewState during follow mode
    if (!navigation.isNavigating || !navigation.followMode) {
      setViewState(evt.viewState);
    }
  }, [navigation.isNavigating, navigation.followMode]);

  // Apply config center/zoom when loaded
  useEffect(() => {
    if (!configLoading && !route && !navigation.isNavigating) {
      setViewState({
        longitude: config.defaultCenterLng,
        latitude: config.defaultCenterLat,
        zoom: config.defaultZoom,
      });
    }
  }, [config, configLoading, route, navigation.isNavigating]);

  // Fit map to route bounds
  useEffect(() => {
    if (route && route.coordinates.length > 0 && !navigation.isNavigating) {
      let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
      route.coordinates.forEach(([lng, lat]) => {
        minLng = Math.min(minLng, lng); maxLng = Math.max(maxLng, lng);
        minLat = Math.min(minLat, lat); maxLat = Math.max(maxLat, lat);
      });
      if (showAlternative && alternativeRoute) {
        alternativeRoute.coordinates.forEach(([lng, lat]) => {
          minLng = Math.min(minLng, lng); maxLng = Math.max(maxLng, lng);
          minLat = Math.min(minLat, lat); maxLat = Math.max(maxLat, lat);
        });
      }
      const centerLng = (minLng + maxLng) / 2;
      const centerLat = (minLat + maxLat) / 2;
      const maxDiff = Math.max(maxLng - minLng, maxLat - minLat);
      let zoom = maxDiff > 0.5 ? 9 : maxDiff > 0.2 ? 10 : maxDiff > 0.1 ? 11 : maxDiff > 0.05 ? 12 : 13;
      setViewState({ longitude: centerLng, latitude: centerLat, zoom });
    }
  }, [route, alternativeRoute, showAlternative, navigation.isNavigating]);

  // Center on user when requested
  useEffect(() => {
    if (centerRequested && location) {
      setViewState({ longitude: location.longitude, latitude: location.latitude, zoom: 15 });
      clearCenterRequest();
    }
  }, [centerRequested, location, clearCenterRequest]);

  // Follow mode during navigation
  useEffect(() => {
    if (navigation.isNavigating && navigation.followMode && location) {
      setViewState({
        longitude: location.longitude,
        latitude: location.latitude,
        zoom: config.followModeZoom,
        pitch: config.navigationPitch,
        bearing: location.heading || 0,
      } as any);
    }
  }, [navigation.isNavigating, navigation.followMode, location, config.followModeZoom, config.navigationPitch]);

  const routeGeoJSON = route ? { type: 'Feature' as const, properties: {}, geometry: { type: 'LineString' as const, coordinates: route.coordinates } } : null;
  const alternativeGeoJSON = showAlternative && alternativeRoute ? { type: 'Feature' as const, properties: {}, geometry: { type: 'LineString' as const, coordinates: alternativeRoute.coordinates } } : null;
  const mapStyle = config.styleUrl || MAP_STYLE;

  return (
    <div className="relative flex-1 h-full overflow-hidden">
      {/* Navigation Panel */}
      {navigation.isNavigating && <NavigationPanel navigation={navigation} gps={gps} />}

      <Map
        {...viewState}
        onMove={handleMove}
        style={{ width: '100%', height: '100%' }}
        mapStyle={mapStyle}
        attributionControl={false}
        pitch={navigation.isNavigating && navigation.followMode ? config.navigationPitch : 0}
      >
        <NavigationControl position="top-right" showCompass={navigation.isNavigating} />
        <ScaleControl position="bottom-right" />
        
        {/* Alternative Route - Lighter violet, dashed */}
        {alternativeGeoJSON && (
          <Source id="alternative-route" type="geojson" data={alternativeGeoJSON}>
            <Layer id="alternative-route-outline" type="line" paint={{ 'line-color': RIDO_COLORS.routeOutline, 'line-width': 7, 'line-opacity': 0.15 }} />
            <Layer id="alternative-route-line" type="line" paint={{ 'line-color': RIDO_COLORS.routeAlternative, 'line-width': 4, 'line-opacity': 0.85, 'line-dasharray': [3, 2] }} />
          </Source>
        )}
        
        {/* Main Route - RIDO Premium Violet with glow */}
        {routeGeoJSON && (
          <Source id="route" type="geojson" data={routeGeoJSON}>
            {/* Outer glow */}
            <Layer id="route-glow" type="line" paint={{ 'line-color': RIDO_COLORS.routeGlow, 'line-width': 14, 'line-opacity': 0.12, 'line-blur': 3 }} />
            {/* Outline */}
            <Layer id="route-outline" type="line" paint={{ 'line-color': RIDO_COLORS.routeOutline, 'line-width': 8, 'line-opacity': 0.35 }} />
            {/* Main line */}
            <Layer id="route-line" type="line" paint={{ 'line-color': RIDO_COLORS.routePrimary, 'line-width': 5, 'line-opacity': 1 }} />
          </Source>
        )}
        
        {/* ═══════════════════════════════════════════════════════════════
            RIDO Premium Markers - Violet + Gold Brand Identity
            ═══════════════════════════════════════════════════════════════ */}
        
        {/* START Marker - Violet with Mascot + Gold accent */}
        {startCoords && (
          <Marker longitude={startCoords.lng} latitude={startCoords.lat} anchor="bottom">
            <div className="flex flex-col items-center animate-in fade-in zoom-in duration-300">
              <div className="relative">
                {/* Gold pulse ring */}
                <div className="absolute -inset-1.5 rounded-full border-2 border-amber-400/40 animate-ping" />
                {/* Main marker - violet gradient + gold border */}
                <div 
                  className="h-11 w-11 rounded-full border-[3px] shadow-lg flex items-center justify-center"
                  style={{ 
                    background: `linear-gradient(135deg, ${RIDO_COLORS.routeGlow}, ${RIDO_COLORS.routePrimary})`,
                    borderColor: RIDO_COLORS.markerGold,
                    boxShadow: `0 4px 12px -2px ${RIDO_COLORS.routePrimary}40`
                  }}
                >
                  <RidoMascotSVG size={26} />
                </div>
              </div>
              <div 
                className="text-white px-2.5 py-0.5 rounded-full text-[10px] font-bold shadow-lg mt-1.5"
                style={{ 
                  background: `linear-gradient(135deg, ${RIDO_COLORS.routeGlow}, ${RIDO_COLORS.routePrimary})`,
                  boxShadow: `0 2px 8px -2px ${RIDO_COLORS.routePrimary}50`
                }}
              >
                START
              </div>
            </div>
          </Marker>
        )}
        
        {/* CEL (Destination) Marker - Gold gradient */}
        {endCoords && (
          <Marker longitude={endCoords.lng} latitude={endCoords.lat} anchor="bottom">
            <div className="flex flex-col items-center animate-in fade-in zoom-in duration-300">
              <div 
                className="h-11 w-11 rounded-full border-[3px] border-white shadow-lg flex items-center justify-center"
                style={{ 
                  background: `linear-gradient(135deg, ${RIDO_COLORS.markerGoldLight}, ${RIDO_COLORS.markerGoldDark})`,
                  boxShadow: `0 4px 12px -2px ${RIDO_COLORS.markerGold}50`
                }}
              >
                <Navigation className="h-5 w-5 text-white drop-shadow-sm" />
              </div>
              <div 
                className="text-white px-2.5 py-0.5 rounded-full text-[10px] font-bold shadow-lg mt-1.5"
                style={{ 
                  background: `linear-gradient(135deg, ${RIDO_COLORS.markerGold}, ${RIDO_COLORS.markerGoldDark})`,
                  boxShadow: `0 2px 8px -2px ${RIDO_COLORS.markerGold}50`
                }}
              >
                CEL
              </div>
            </div>
          </Marker>
        )}

        {/* Incidents Markers - Gold/Amber gradient */}
        {showIncidentsLayer && incidents.map(incident => (
          <Marker 
            key={incident.id} 
            longitude={incident.lng} 
            latitude={incident.lat} 
            anchor="center"
          >
            <div 
              className="h-8 w-8 rounded-full border-2 border-white shadow-lg flex items-center justify-center animate-in fade-in zoom-in"
              style={{ 
                background: `linear-gradient(135deg, ${RIDO_COLORS.markerGold}, ${RIDO_COLORS.incidentAmber})`,
                boxShadow: `0 3px 10px -2px ${RIDO_COLORS.incidentAmber}40`
              }}
            >
              {incident.type === 'roadwork' || incident.type === 'construction' ? (
                <Construction className="h-4 w-4 text-white drop-shadow-sm" />
              ) : (
                <AlertTriangle className="h-4 w-4 text-white drop-shadow-sm" />
              )}
            </div>
          </Marker>
        ))}

        {/* User Location Marker - Violet with Gold pulse + Mascot eyes */}
        {hasConsent && location && status !== 'inactive' && (
          <Marker longitude={location.longitude} latitude={location.latitude} anchor="center">
            <div className="relative flex items-center justify-center">
              {/* Accuracy circle - gold tint */}
              <div 
                className="absolute rounded-full border animate-pulse"
                style={{ 
                  width: Math.min(Math.max(location.accuracy * 0.5, 24), 100), 
                  height: Math.min(Math.max(location.accuracy * 0.5, 24), 100),
                  background: `${RIDO_COLORS.markerGold}10`,
                  borderColor: `${RIDO_COLORS.markerGold}30`
                }} 
              />
              {/* Gold pulse ring */}
              <div 
                className="absolute h-9 w-9 rounded-full border-2 animate-ping"
                style={{ borderColor: `${RIDO_COLORS.markerGold}40` }}
              />
              {/* Main dot - violet with mascot face */}
              <div 
                className="relative h-7 w-7 rounded-full border-2 shadow-lg z-10 flex items-center justify-center"
                style={{ 
                  background: `linear-gradient(135deg, ${RIDO_COLORS.routeGlow}, ${RIDO_COLORS.routePrimary})`,
                  borderColor: RIDO_COLORS.markerGold,
                  boxShadow: `0 2px 8px -2px ${RIDO_COLORS.routePrimary}50`
                }}
              >
                {/* Mini mascot eyes inside */}
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none">
                  <circle cx="7" cy="11" r="2" fill={RIDO_COLORS.markerGold} />
                  <circle cx="17" cy="11" r="2" fill={RIDO_COLORS.markerGold} />
                  <path d="M7 15 Q12 18 17 15" stroke={RIDO_COLORS.markerGold} strokeWidth="1.5" fill="none" strokeLinecap="round" />
                </svg>
              </div>
              {/* Heading indicator - violet */}
              {location.heading !== null && (
                <div 
                  className="absolute -top-1.5 left-1/2 w-0 h-0"
                  style={{ 
                    borderLeft: '6px solid transparent',
                    borderRight: '6px solid transparent', 
                    borderBottom: `9px solid ${RIDO_COLORS.routePrimary}`,
                    transform: `translateX(-50%) rotate(${location.heading}deg)`, 
                    transformOrigin: 'bottom center' 
                  }} 
                />
              )}
            </div>
          </Marker>
        )}
      </Map>
      
      {/* Bottom badges - RIDO Premium styling */}
      <div className="absolute bottom-4 left-4 flex gap-2 pointer-events-none">
        <Badge variant="secondary" className="gap-1.5 rido-badge-glass"><Layers className="h-3 w-3" />Warstwy</Badge>
        <Badge variant="secondary" className="gap-1.5 rido-badge-glass"><Car className="h-3 w-3" />Ruch</Badge>
        {incidents.length > 0 && (
          <Badge className="gap-1.5 rido-badge-gold">
            <Construction className="h-3 w-3" />
            {incidents.length} zdarzeń
          </Badge>
        )}
      </div>
      
      {/* Top badges - RIDO violet branding */}
      <div className="absolute top-4 left-4 flex flex-col gap-2">
        {navigation.isNavigating ? (
          <Badge className="rido-badge-nav gap-1.5"><Navigation className="h-3 w-3 animate-pulse" />Nawigacja</Badge>
        ) : route ? (
          <>
            <Badge className="rido-badge-violet gap-1.5"><Navigation className="h-3 w-3" />Trasa RIDO</Badge>
            {showAlternative && alternativeRoute && <Badge className="rido-badge-gold gap-1.5"><Route className="h-3 w-3" />Alternatywa</Badge>}
          </>
        ) : (
          <Badge variant="outline" className="rido-badge-glass border-amber-500/50 text-amber-600">Tryb testowy</Badge>
        )}
      </div>
      
      <div className="absolute bottom-4 right-24 text-[10px] text-muted-foreground bg-background/80 backdrop-blur-sm px-2 py-0.5 rounded">© OpenStreetMap · OSRM</div>
    </div>
  );
};

export default MapsContainer;
