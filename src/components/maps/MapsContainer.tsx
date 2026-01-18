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
import SpeedHUD from './SpeedHUD';
import { RidoMapTheme, getActiveStyleUrl, RIDO_THEME_COLORS, RIDO_MAP_PAINT } from './ridoMapTheme';

// ═══════════════════════════════════════════════════════════════
// RIDO Premium Markers - Minimalist, Geometric, Brand-Aligned
// ═══════════════════════════════════════════════════════════════

// Premium START Pin - Elegant geometric violet diamond with gold accent
const RidoStartPin = ({ size = 48 }: { size?: number }) => (
  <svg viewBox="0 0 48 58" width={size} height={size * 1.2} className="drop-shadow-xl">
    <defs>
      <linearGradient id="startPinGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor={RIDO_THEME_COLORS.violetSoft} />
        <stop offset="100%" stopColor={RIDO_THEME_COLORS.violetPrimary} />
      </linearGradient>
      <filter id="startGlow" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="2" result="blur" />
        <feMerge>
          <feMergeNode in="blur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>
    {/* Pin body */}
    <path 
      d="M24 4 C12 4 4 14 4 24 C4 36 24 54 24 54 C24 54 44 36 44 24 C44 14 36 4 24 4 Z"
      fill="url(#startPinGrad)"
      stroke={RIDO_THEME_COLORS.goldAccent}
      strokeWidth="3"
      filter="url(#startGlow)"
    />
    {/* Inner circle */}
    <circle cx="24" cy="22" r="12" fill="white" opacity="0.95" />
    {/* Navigation arrow inside */}
    <path 
      d="M24 14 L30 26 L24 23 L18 26 Z"
      fill={RIDO_THEME_COLORS.violetPrimary}
    />
    {/* Central dot */}
    <circle cx="24" cy="22" r="3" fill={RIDO_THEME_COLORS.goldAccent} />
  </svg>
);

// Premium CEL Pin - Gold gradient with navigation icon
const RidoCelPin = ({ size = 44 }: { size?: number }) => (
  <svg viewBox="0 0 44 54" width={size} height={size * 1.23} className="drop-shadow-xl">
    <defs>
      <linearGradient id="celPinGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor={RIDO_THEME_COLORS.goldSoft} />
        <stop offset="100%" stopColor={RIDO_THEME_COLORS.goldDark} />
      </linearGradient>
      <filter id="celGlow" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="2" result="blur" />
        <feMerge>
          <feMergeNode in="blur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>
    {/* Pin body */}
    <path 
      d="M22 4 C11 4 4 13 4 22 C4 33 22 50 22 50 C22 50 40 33 40 22 C40 13 33 4 22 4 Z"
      fill="url(#celPinGrad)"
      stroke="white"
      strokeWidth="2.5"
      filter="url(#celGlow)"
    />
    {/* Target icon inside */}
    <circle cx="22" cy="20" r="9" fill="none" stroke="white" strokeWidth="2" opacity="0.9" />
    <circle cx="22" cy="20" r="4" fill="none" stroke="white" strokeWidth="2" opacity="0.9" />
    <circle cx="22" cy="20" r="1.5" fill="white" />
  </svg>
);

// ═══════════════════════════════════════════════════════════════
// RIDO Premium User Arrow - Minimalist Navigation Style
// ═══════════════════════════════════════════════════════════════
const RidoUserArrow = ({ heading, accuracy }: { heading: number | null; accuracy: number }) => (
  <div className="relative flex items-center justify-center">
    {/* Accuracy ring - subtle gold tint */}
    <div 
      className="absolute rounded-full"
      style={{ 
        width: Math.min(Math.max(accuracy * 0.4, 32), 80), 
        height: Math.min(Math.max(accuracy * 0.4, 32), 80),
        background: `radial-gradient(circle, ${RIDO_THEME_COLORS.violetSoft}12, transparent 70%)`,
        border: `1px solid ${RIDO_THEME_COLORS.violetPrimary}15`,
      }} 
    />
    {/* Outer pulse ring */}
    <div 
      className="absolute h-12 w-12 rounded-full border-2 animate-pulse"
      style={{ borderColor: `${RIDO_THEME_COLORS.goldAccent}35` }}
    />
    {/* Main arrow */}
    <div 
      className="relative z-10 transition-transform duration-200"
      style={{ transform: heading !== null ? `rotate(${heading}deg)` : undefined }}
    >
      <svg viewBox="0 0 40 40" width={40} height={40} className="drop-shadow-lg">
        <defs>
          <linearGradient id="userArrowGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={RIDO_THEME_COLORS.violetSoft} />
            <stop offset="100%" stopColor={RIDO_THEME_COLORS.violetPrimary} />
          </linearGradient>
        </defs>
        {/* Arrow shape - premium gradient */}
        <path 
          d="M20 6 L32 34 L20 27 L8 34 Z" 
          fill="url(#userArrowGrad)"
          stroke={RIDO_THEME_COLORS.goldAccent}
          strokeWidth="2"
          strokeLinejoin="round"
        />
        {/* Inner highlight */}
        <path 
          d="M20 12 L26 28 L20 24 L14 28 Z" 
          fill="white"
          opacity="0.25"
        />
        {/* Center dot */}
        <circle cx="20" cy="22" r="3.5" fill={RIDO_THEME_COLORS.goldAccent} />
        <circle cx="20" cy="22" r="1.5" fill="white" />
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
  isMobile?: boolean;
  // Speed HUD props (desktop only)
  speedLimit?: number | null;
  isEstimatedLimit?: boolean;
  showSpeedLimit?: boolean;
}

const MapsContainer = ({ 
  routing, 
  gps, 
  navigation, 
  incidents = [], 
  showIncidentsLayer = true,
  mapTheme = 'light',
  mascotMessage = '',
  isMobile = false,
  speedLimit,
  isEstimatedLimit = false,
  showSpeedLimit = true,
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
      {/* Navigation Panel - ONLY on desktop (mobile uses MobileNavigationBar) */}
      {navigation.isNavigating && !isMobile && <NavigationPanel navigation={navigation} gps={gps} />}
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
        
        {/* START Marker - Premium geometric pin */}
        {startCoords && (
          <Marker longitude={startCoords.lng} latitude={startCoords.lat} anchor="bottom">
            <div className="flex flex-col items-center animate-in fade-in zoom-in duration-300">
              <RidoStartPin size={44} />
              <div 
                className="text-white px-3 py-1 rounded-full text-[10px] font-bold shadow-lg -mt-1"
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
        
        {/* CEL (Destination) Marker - Premium gold pin */}
        {endCoords && (
          <Marker longitude={endCoords.lng} latitude={endCoords.lat} anchor="bottom">
            <div className="flex flex-col items-center animate-in fade-in zoom-in duration-300">
              <RidoCelPin size={40} />
              <div 
                className="text-white px-3 py-1 rounded-full text-[10px] font-bold shadow-lg -mt-1"
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
      
      {/* Bottom badges - RIDO Premium styling (hidden on mobile - shown in bottom sheet) */}
      {!isMobile && (
        <div className="absolute bottom-4 left-4 flex gap-2 pointer-events-none">
          <Badge variant="secondary" className="gap-1.5 rido-badge-glass"><Layers className="h-3 w-3" />Warstwy</Badge>
          <Badge variant="secondary" className="gap-1.5 rido-badge-glass"><Car className="h-3 w-3" />Ruch</Badge>
          {incidents.length > 0 && (
            <Badge className="gap-1.5 rido-badge-gold">
              <Construction className="h-3 w-3" />
              {incidents.length} na trasie
            </Badge>
          )}
        </div>
      )}
      
      {/* Speed HUD - Desktop, bottom right (only during navigation) */}
      {!isMobile && navigation.isNavigating && showSpeedLimit && (
        <div className="absolute bottom-4 right-4">
          <SpeedHUD
            currentSpeed={gps.location?.speed ? Math.round(gps.location.speed * 3.6) : null}
            speedLimit={speedLimit ?? null}
            isEstimatedLimit={isEstimatedLimit}
          />
        </div>
      )}
      
      {/* Top badges - RIDO violet branding (hidden on mobile during navigation) */}
      {!isMobile && (
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
      )}
    </div>
  );
};

export default MapsContainer;
