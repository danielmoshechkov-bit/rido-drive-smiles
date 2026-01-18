import { useState, useCallback, useEffect } from 'react';
import Map, { Marker, NavigationControl, ScaleControl, Source, Layer } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Layers, Car, Navigation, Route, Construction, AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { DEFAULT_VIEW_STATE } from './mapStyles';
import { RoutingState } from './useRouting';
import { GpsState } from './useUserLocation';
import { NavigationState } from './useNavigation';
import { Incident } from './incidentsService';
import { useMapsConfig } from '@/hooks/useMapsConfig';
import NavigationPanel from './NavigationPanel';
import { RidoMapTheme, getActiveStyleUrl, RIDO_THEME_COLORS, RIDO_MAP_PAINT } from './ridoMapTheme';

// ═══════════════════════════════════════════════════════════════
// RIDO Mascot - Enhanced Inline SVG with Speech Bubble
// ═══════════════════════════════════════════════════════════════
interface RidoMascotProps {
  size?: number;
  className?: string;
  showSpeech?: boolean;
  speechText?: string;
}

const RidoMascotMarker = ({ size = 32, className = "", showSpeech = false, speechText = '' }: RidoMascotProps) => (
  <div className="relative flex flex-col items-center">
    {/* Speech bubble - ludek mówi */}
    {showSpeech && speechText && (
      <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-white dark:bg-gray-800 px-3 py-1.5 rounded-xl shadow-lg text-[11px] whitespace-nowrap border border-primary/20 z-20 animate-in fade-in slide-in-from-bottom-2">
        <span>{speechText}</span>
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 w-2.5 h-2.5 bg-white dark:bg-gray-800 border-b border-r border-primary/20 rotate-45" />
      </div>
    )}
    {/* Mascot SVG - rozbudowany RIDO brand */}
    <svg viewBox="0 0 32 32" width={size} height={size} className={`drop-shadow-lg ${className}`}>
      {/* Glow ring */}
      <circle cx="16" cy="16" r="15" fill="url(#mascotGlow)" />
      {/* Main head - white fill with brand border */}
      <circle cx="16" cy="16" r="12" fill="white" stroke={RIDO_THEME_COLORS.violetPrimary} strokeWidth="2" />
      {/* Ears/horns - violet brand */}
      <path d="M4 5 L8 12 L5 10 Z" fill={RIDO_THEME_COLORS.violetPrimary} />
      <path d="M28 5 L24 12 L27 10 Z" fill={RIDO_THEME_COLORS.violetPrimary} />
      {/* Eyes - gold accent */}
      <circle cx="11" cy="14" r="2.5" fill={RIDO_THEME_COLORS.goldAccent} />
      <circle cx="21" cy="14" r="2.5" fill={RIDO_THEME_COLORS.goldAccent} />
      {/* Pupils */}
      <circle cx="11" cy="14" r="1" fill={RIDO_THEME_COLORS.violetDark} />
      <circle cx="21" cy="14" r="1" fill={RIDO_THEME_COLORS.violetDark} />
      {/* Smile - gold */}
      <path d="M10 20 Q16 25 22 20" stroke={RIDO_THEME_COLORS.goldAccent} strokeWidth="2" fill="none" strokeLinecap="round" />
      {/* Gradient defs */}
      <defs>
        <radialGradient id="mascotGlow">
          <stop offset="50%" stopColor="transparent" />
          <stop offset="100%" stopColor={RIDO_THEME_COLORS.violetSoft} stopOpacity="0.2" />
        </radialGradient>
      </defs>
    </svg>
  </div>
);

// Compact mascot for small markers
const RidoMascotSVG = ({ size = 24 }: { size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none">
    <circle cx="12" cy="12" r="9" fill="white" />
    <circle cx="8.5" cy="10" r="1.8" fill={RIDO_THEME_COLORS.goldAccent} />
    <circle cx="15.5" cy="10" r="1.8" fill={RIDO_THEME_COLORS.goldAccent} />
    <circle cx="8.5" cy="10" r="0.6" fill={RIDO_THEME_COLORS.violetDark} />
    <circle cx="15.5" cy="10" r="0.6" fill={RIDO_THEME_COLORS.violetDark} />
    <path d="M7 14 Q12 18 17 14" stroke={RIDO_THEME_COLORS.goldAccent} strokeWidth="1.5" fill="none" strokeLinecap="round" />
    <path d="M4 4 L7.5 9.5 L5 8 Z" fill={RIDO_THEME_COLORS.violetPrimary} />
    <path d="M20 4 L16.5 9.5 L19 8 Z" fill={RIDO_THEME_COLORS.violetPrimary} />
  </svg>
);

// ═══════════════════════════════════════════════════════════════
// Custom RIDO User Arrow (replaces default)
// ═══════════════════════════════════════════════════════════════
const RidoUserArrow = ({ heading, accuracy }: { heading: number | null; accuracy: number }) => (
  <div className="relative flex items-center justify-center">
    {/* Accuracy ring - gold tinted */}
    <div 
      className="absolute rounded-full animate-pulse"
      style={{ 
        width: Math.min(Math.max(accuracy * 0.5, 28), 100), 
        height: Math.min(Math.max(accuracy * 0.5, 28), 100),
        background: `radial-gradient(circle, ${RIDO_THEME_COLORS.goldSoft}15, transparent 70%)`,
        border: `1px solid ${RIDO_THEME_COLORS.goldAccent}20`,
      }} 
    />
    {/* Outer pulse ring */}
    <div 
      className="absolute h-10 w-10 rounded-full border-2 animate-pulse"
      style={{ borderColor: `${RIDO_THEME_COLORS.goldAccent}40` }}
    />
    {/* Main arrow body */}
    <div 
      className="relative z-10"
      style={{ transform: heading !== null ? `rotate(${heading}deg)` : undefined }}
    >
      <svg viewBox="0 0 40 40" width="36" height="36" className="drop-shadow-lg">
        {/* Arrow shape - violet with gold stroke */}
        <path 
          d="M20 4 L30 32 L20 26 L10 32 Z" 
          fill={RIDO_THEME_COLORS.violetPrimary}
          stroke={RIDO_THEME_COLORS.goldAccent}
          strokeWidth="2"
          strokeLinejoin="round"
        />
        {/* Center dot - gold accent */}
        <circle cx="20" cy="20" r="4" fill={RIDO_THEME_COLORS.goldAccent} />
      </svg>
    </div>
  </div>
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
  mapTheme?: RidoMapTheme;
  mascotMessage?: string;
}

const MapsContainer = ({ 
  routing, 
  gps, 
  navigation, 
  incidents = [], 
  showIncidentsLayer = true,
  mapTheme = 'light',
  mascotMessage = '',
}: MapsContainerProps) => {
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
  const mapStyle = config.styleUrl || getActiveStyleUrl(mapTheme);

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
            <Layer id="alternative-route-outline" type="line" paint={{ 'line-color': RIDO_THEME_COLORS.violetDark, 'line-width': 7, 'line-opacity': 0.15 }} />
            <Layer id="alternative-route-line" type="line" paint={{ 'line-color': RIDO_THEME_COLORS.violetMuted, 'line-width': 4, 'line-opacity': 0.85, 'line-dasharray': [3, 2] }} />
          </Source>
        )}
        
        {/* Main Route - RIDO Premium Violet with glow */}
        {routeGeoJSON && (
          <Source id="route" type="geojson" data={routeGeoJSON}>
            {/* Outer glow - subtle */}
            <Layer id="route-glow" type="line" paint={{ 'line-color': RIDO_THEME_COLORS.violetSoft, 'line-width': 12, 'line-opacity': 0.08, 'line-blur': 2 }} layout={{ 'line-cap': 'round', 'line-join': 'round' }} />
            {/* Outline */}
            <Layer id="route-outline" type="line" paint={{ 'line-color': RIDO_THEME_COLORS.violetDark, 'line-width': 8, 'line-opacity': 0.3 }} layout={{ 'line-cap': 'round', 'line-join': 'round' }} />
            {/* Main line */}
            <Layer id="route-line" type="line" paint={{ 'line-color': RIDO_THEME_COLORS.violetPrimary, 'line-width': 5, 'line-opacity': 1 }} layout={{ 'line-cap': 'round', 'line-join': 'round' }} />
          </Source>
        )}
        
        {/* ═══════════════════════════════════════════════════════════════
            RIDO Premium Markers - Violet + Gold Brand Identity
            ═══════════════════════════════════════════════════════════════ */}
        
        {/* START Marker - Mascot with speech bubble */}
        {startCoords && (
          <Marker longitude={startCoords.lng} latitude={startCoords.lat} anchor="bottom">
            <div className="flex flex-col items-center animate-in fade-in zoom-in duration-300">
              <div className="relative">
                {/* Gold accent ring - subtle pulse */}
                <div className="absolute -inset-2 rounded-full border-2 animate-pulse" style={{ borderColor: `${RIDO_THEME_COLORS.goldAccent}30` }} />
                {/* Main marker - violet gradient + gold border */}
                <div 
                  className="h-12 w-12 rounded-full border-[3px] shadow-lg flex items-center justify-center"
                  style={{ 
                    background: `linear-gradient(135deg, ${RIDO_THEME_COLORS.violetSoft}, ${RIDO_THEME_COLORS.violetPrimary})`,
                    borderColor: RIDO_THEME_COLORS.goldAccent,
                    boxShadow: `0 4px 12px -2px ${RIDO_THEME_COLORS.violetPrimary}40`
                  }}
                >
                  <RidoMascotMarker size={38} showSpeech={!!mascotMessage && !navigation.isNavigating} speechText={mascotMessage} />
                </div>
              </div>
              <div 
                className="text-white px-2.5 py-0.5 rounded-full text-[10px] font-bold shadow-lg mt-1.5"
                style={{ 
                  background: `linear-gradient(135deg, ${RIDO_THEME_COLORS.violetSoft}, ${RIDO_THEME_COLORS.violetPrimary})`,
                  boxShadow: `0 2px 8px -2px ${RIDO_THEME_COLORS.violetPrimary}50`
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
                  background: `linear-gradient(135deg, ${RIDO_THEME_COLORS.goldSoft}, ${RIDO_THEME_COLORS.goldDark})`,
                  boxShadow: `0 4px 12px -2px ${RIDO_THEME_COLORS.goldAccent}50`
                }}
              >
                <Navigation className="h-5 w-5 text-white drop-shadow-sm" />
              </div>
              <div 
                className="text-white px-2.5 py-0.5 rounded-full text-[10px] font-bold shadow-lg mt-1.5"
                style={{ 
                  background: `linear-gradient(135deg, ${RIDO_THEME_COLORS.goldAccent}, ${RIDO_THEME_COLORS.goldDark})`,
                  boxShadow: `0 2px 8px -2px ${RIDO_THEME_COLORS.goldAccent}50`
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
                background: `linear-gradient(135deg, ${RIDO_THEME_COLORS.goldAccent}, ${RIDO_THEME_COLORS.goldMuted})`,
                boxShadow: `0 3px 10px -2px ${RIDO_THEME_COLORS.goldMuted}40`
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

        {/* User Location - Custom RIDO Arrow */}
        {hasConsent && location && status !== 'inactive' && (
          <Marker longitude={location.longitude} latitude={location.latitude} anchor="center">
            <RidoUserArrow heading={location.heading} accuracy={location.accuracy} />
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
