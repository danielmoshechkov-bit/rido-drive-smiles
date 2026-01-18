import { useState, useCallback, useEffect, useRef } from 'react';
import Map, { Marker, NavigationControl, ScaleControl, Source, Layer, MapRef } from 'react-map-gl/maplibre';
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
import FollowModeFAB from './FollowModeFAB';
import { useMapCameraController, FollowMode } from './useMapCameraController';
import { RidoMapTheme, getActiveStyleUrl, RIDO_THEME_COLORS, getSavedTheme } from './ridoMapTheme';
import { DRIVING_MODE_HIDDEN_LAYERS, RIDO_ROUTE_STYLE, MAP_ANIMATION } from './ridoCleanMapStyle';

// ═══════════════════════════════════════════════════════════════
// Google-Style Clean Markers - Simple, Readable, Professional
// ═══════════════════════════════════════════════════════════════

// Clean START marker - Blue dot like Google
const GoogleStartPin = ({ size = 28 }: { size?: number }) => (
  <svg viewBox="0 0 28 28" width={size} height={size} className="drop-shadow-lg">
    <defs>
      <filter id="startShadow" x="-50%" y="-50%" width="200%" height="200%">
        <feDropShadow dx="0" dy="2" stdDeviation="2" floodOpacity="0.3"/>
      </filter>
    </defs>
    {/* Outer blue ring */}
    <circle cx="14" cy="14" r="12" fill="#4285F4" filter="url(#startShadow)" />
    {/* White inner ring */}
    <circle cx="14" cy="14" r="8" fill="white" />
    {/* Blue center dot */}
    <circle cx="14" cy="14" r="5" fill="#4285F4" />
  </svg>
);

// Clean DESTINATION marker - Red pin like Google
const GoogleDestPin = ({ size = 40 }: { size?: number }) => (
  <svg viewBox="0 0 24 34" width={size * 0.7} height={size} className="drop-shadow-xl">
    <defs>
      <filter id="destShadow" x="-50%" y="-30%" width="200%" height="200%">
        <feDropShadow dx="0" dy="3" stdDeviation="2" floodOpacity="0.35"/>
      </filter>
    </defs>
    {/* Pin body - classic drop shape */}
    <path 
      d="M12 0C5.4 0 0 5.4 0 12c0 7.2 12 22 12 22s12-14.8 12-22C24 5.4 18.6 0 12 0z"
      fill="#ea4335"
      filter="url(#destShadow)"
    />
    {/* Inner white circle */}
    <circle cx="12" cy="11" r="5" fill="white" />
  </svg>
);

// Premium 3D USER location marker - RIDO Gold Arrow
const RidoUserMarker3D = ({ heading, accuracy, isMoving }: { heading: number | null; accuracy: number; isMoving?: boolean }) => (
  <div className="relative flex items-center justify-center">
    {/* Accuracy circle - violet glow */}
    <div 
      className={`absolute rounded-full ${isMoving ? 'animate-pulse' : ''}`}
      style={{ 
        width: Math.min(Math.max(accuracy * 0.7, 50), 120), 
        height: Math.min(Math.max(accuracy * 0.7, 50), 120),
        background: 'radial-gradient(circle, rgba(139, 92, 246, 0.2) 0%, rgba(139, 92, 246, 0.05) 50%, transparent 70%)',
      }} 
    />
    {/* Main 3D arrow */}
    <div 
      className="relative z-10 transition-transform duration-300 ease-out"
      style={{ transform: heading !== null ? `rotate(${heading}deg)` : undefined }}
    >
      <svg viewBox="0 0 60 80" width={50} height={66} className="drop-shadow-2xl">
        <defs>
          {/* Premium gold gradient */}
          <linearGradient id="ridoGold3D" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FFD700" />
            <stop offset="25%" stopColor="#FFC107" />
            <stop offset="50%" stopColor="#FFB300" />
            <stop offset="75%" stopColor="#FF9800" />
            <stop offset="100%" stopColor="#F57C00" />
          </linearGradient>
          
          {/* Violet accent gradient */}
          <linearGradient id="ridoVioletStroke" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#A78BFA" />
            <stop offset="100%" stopColor="#7C3AED" />
          </linearGradient>
          
          {/* 3D shadow */}
          <filter id="rido3DShadow" x="-50%" y="-30%" width="200%" height="200%">
            <feDropShadow dx="2" dy="5" stdDeviation="5" floodColor="#000" floodOpacity="0.4"/>
          </filter>
          
          {/* Glow effect */}
          <filter id="ridoGlow">
            <feGaussianBlur stdDeviation="2" result="blur"/>
            <feMerge>
              <feMergeNode in="blur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>
        
        {/* Outer glow ellipse */}
        <ellipse cx="30" cy="58" rx="16" ry="7" fill="rgba(139, 92, 246, 0.25)" filter="url(#ridoGlow)"/>
        
        {/* Arrow body - 3D gold with violet stroke */}
        <path 
          d="M30 5 L50 58 L30 46 L10 58 Z"
          fill="url(#ridoGold3D)"
          stroke="url(#ridoVioletStroke)"
          strokeWidth="2.5"
          strokeLinejoin="round"
          filter="url(#rido3DShadow)"
        />
        
        {/* Left highlight - 3D effect */}
        <path 
          d="M30 10 L25 38 L16 52"
          fill="none"
          stroke="rgba(255,255,255,0.75)"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        
        {/* Right shadow - 3D depth */}
        <path 
          d="M30 10 L35 38 L44 52"
          fill="none"
          stroke="rgba(0,0,0,0.2)"
          strokeWidth="2"
          strokeLinecap="round"
        />
        
        {/* Center jewel highlight */}
        <ellipse cx="30" cy="32" rx="4" ry="3" fill="rgba(255,255,255,0.9)"/>
        <ellipse cx="29" cy="31" rx="2" ry="1.5" fill="white"/>
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
  // Camera controller callback (for external access)
  onCameraControllerReady?: (controller: ReturnType<typeof useMapCameraController>) => void;
  onMapInteraction?: () => void;
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
  onCameraControllerReady,
  onMapInteraction,
}: MapsContainerProps) => {
  const mapRef = useRef<MapRef>(null);
  const { config, isLoading: configLoading } = useMapsConfig();
  const [viewState, setViewState] = useState(DEFAULT_VIEW_STATE);
  const { route, alternativeRoute, showAlternative, startCoords, endCoords } = routing;
  const { location, status, centerRequested, clearCenterRequest, hasConsent } = gps;
  const [currentTheme] = useState<RidoMapTheme>(() => getSavedTheme());
  const isUserInteractingRef = useRef(false);
  
  // Camera controller for follow mode and animations
  const cameraController = useMapCameraController(
    mapRef,
    gps,
    navigation,
    { followModeZoom: config.followModeZoom, navigationPitch: config.navigationPitch }
  );

  // Expose camera controller to parent
  useEffect(() => {
    onCameraControllerReady?.(cameraController);
  }, [cameraController, onCameraControllerReady]);

  // Apply clean driving style - hide pedestrian paths, clean colors
  const applyCleanDrivingStyle = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;
    
    try {
      const isDark = currentTheme === 'dark';
      const style = map.getStyle();
      if (!style?.layers) return;
      
      // === HIDE PEDESTRIAN LAYERS (chodniki, ścieżki) ===
      style.layers.forEach(layer => {
        const layerId = layer.id.toLowerCase();
        
        // Hide footways, paths, pedestrian areas
        if (DRIVING_MODE_HIDDEN_LAYERS.some(hidden => layerId.includes(hidden))) {
          if (map.getLayer(layer.id)) {
            try {
              map.setLayoutProperty(layer.id, 'visibility', 'none');
            } catch {}
          }
        }
      });
      
      // === CLEAN BACKGROUND ===
      if (map.getLayer('background')) {
        map.setPaintProperty('background', 'background-color', 
          isDark ? '#1a1a2e' : '#f8f9fa');
      }
      
      // === WATER - calm blue ===
      ['water', 'waterway', 'water-outline'].forEach(layerId => {
        if (map.getLayer(layerId)) {
          try {
            map.setPaintProperty(layerId, 'fill-color', isDark ? '#193c4a' : '#aad3df');
          } catch {}
        }
      });
      
      // === BUILDINGS - subtle, not distracting ===
      ['building', 'building-top', 'building-outline'].forEach(layerId => {
        if (map.getLayer(layerId)) {
          try {
            map.setPaintProperty(layerId, 'fill-color', isDark ? '#252535' : '#e8e4e0');
            map.setPaintProperty(layerId, 'fill-opacity', 0.6);
          } catch {}
        }
      });
      
      // === PARKS - subtle green ===
      ['landuse_park', 'park', 'landuse-park', 'landcover_grass', 'landcover-grass', 'landuse_grass'].forEach(layerId => {
        if (map.getLayer(layerId)) {
          try {
            map.setPaintProperty(layerId, 'fill-color', isDark ? '#1e3d26' : '#c8e6c9');
            map.setPaintProperty(layerId, 'fill-opacity', 0.5);
          } catch {}
        }
      });
      
      // === ROADS - clean hierarchy ===
      // Motorways/highways - yellow like Google
      ['highway', 'motorway', 'motorway-casing', 'highway-casing'].forEach(layerId => {
        style.layers.filter(l => l.id.toLowerCase().includes(layerId) && l.type === 'line').forEach(layer => {
          if (map.getLayer(layer.id)) {
            try {
              const isCasing = layer.id.toLowerCase().includes('casing');
              map.setPaintProperty(layer.id, 'line-color', 
                isCasing 
                  ? (isDark ? '#8a6a3a' : '#dda547')
                  : (isDark ? '#b5884c' : '#fee090')
              );
            } catch {}
          }
        });
      });
      
      // Primary roads - cream/beige
      ['primary', 'trunk'].forEach(roadType => {
        style.layers.filter(l => l.id.toLowerCase().includes(roadType) && l.type === 'line').forEach(layer => {
          if (map.getLayer(layer.id)) {
            try {
              const isCasing = layer.id.toLowerCase().includes('casing');
              map.setPaintProperty(layer.id, 'line-color', 
                isCasing 
                  ? (isDark ? '#5a4d30' : '#e0c97a')
                  : (isDark ? '#7d6b42' : '#fef3cd')
              );
            } catch {}
          }
        });
      });
      
      // Secondary/tertiary - white/gray
      ['secondary', 'tertiary', 'residential', 'street', 'minor'].forEach(roadType => {
        style.layers.filter(l => l.id.toLowerCase().includes(roadType) && l.type === 'line').forEach(layer => {
          if (map.getLayer(layer.id)) {
            try {
              const isCasing = layer.id.toLowerCase().includes('casing');
              map.setPaintProperty(layer.id, 'line-color', 
                isCasing 
                  ? (isDark ? '#2d2d3d' : '#e0e0e0')
                  : (isDark ? '#404052' : '#ffffff')
              );
            } catch {}
          }
        });
      });
      
      // === REDUCE POI NOISE ===
      ['poi-label', 'place-other', 'landuse-label'].forEach(layerId => {
        style.layers.filter(l => l.id.toLowerCase().includes(layerId) && l.type === 'symbol').forEach(layer => {
          if (map.getLayer(layer.id)) {
            try {
              map.setPaintProperty(layer.id, 'text-opacity', 0.4);
              map.setPaintProperty(layer.id, 'icon-opacity', 0.4);
            } catch {}
          }
        });
      });
      
      console.log('[Maps] Applied clean driving style');
    } catch (e) {
      console.warn('[Maps] Cannot apply driving style:', e);
    }
  }, [currentTheme]);

  const handleMove = useCallback((evt: { viewState: typeof DEFAULT_VIEW_STATE }) => {
    setViewState(evt.viewState);
  }, []);

  // Handle user interaction - DON'T trigger on moveStart/End (causes false positives)
  const handleMoveStart = useCallback(() => {
    // Don't set interacting here - only on actual drag
  }, []);

  const handleMoveEnd = useCallback(() => {
    // Don't trigger pill here - only on drag
  }, []);

  // ONLY drag events should trigger follow mode disable
  const handleDragStart = useCallback(() => {
    isUserInteractingRef.current = true;
    cameraController.setIsDragging(true);
  }, [cameraController]);

  const handleDragEnd = useCallback(() => {
    // User finished dragging - now trigger the interaction
    if (cameraController.followMode !== 'off') {
      cameraController.handleUserInteraction();
      onMapInteraction?.();
    }
    isUserInteractingRef.current = false;
    cameraController.setIsDragging(false);
  }, [cameraController, onMapInteraction]);

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

  const routeGeoJSON = route ? { type: 'Feature' as const, properties: {}, geometry: { type: 'LineString' as const, coordinates: route.coordinates } } : null;
  const alternativeGeoJSON = showAlternative && alternativeRoute ? { type: 'Feature' as const, properties: {}, geometry: { type: 'LineString' as const, coordinates: alternativeRoute.coordinates } } : null;
  const mapStyle = config.styleUrl || getActiveStyleUrl(mapTheme);
  
  // Calculate pitch based on follow mode
  const mapPitch = cameraController.followMode === 'heading' && navigation.isNavigating 
    ? config.navigationPitch 
    : 0;

  return (
    <div className="relative flex-1 h-full overflow-hidden">
      {/* Navigation Panel - ONLY on desktop (mobile uses MobileNavigationBar) */}
      {navigation.isNavigating && !isMobile && <NavigationPanel navigation={navigation} gps={gps} />}
      <Map
        ref={mapRef}
        {...viewState}
        onMove={handleMove}
        onMoveStart={handleMoveStart}
        onMoveEnd={handleMoveEnd}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onLoad={applyCleanDrivingStyle}
        style={{ width: '100%', height: '100%' }}
        mapStyle={mapStyle}
        attributionControl={false}
        pitch={mapPitch}
        touchZoomRotate={true}
        dragRotate={true}
      >
        {/* Hide zoom controls on mobile - use gestures instead */}
        {!isMobile && <NavigationControl position="top-right" showCompass={navigation.isNavigating} />}
        <ScaleControl position="bottom-right" />
        
        {/* Alternative Route - Gray, dashed */}
        {alternativeGeoJSON && (
          <Source id="alternative-route" type="geojson" data={alternativeGeoJSON}>
            <Layer 
              id="alternative-route-outline" 
              type="line" 
              paint={{ 'line-color': '#5f6368', 'line-width': 7, 'line-opacity': 0.2 }} 
              layout={{ 'line-cap': 'round', 'line-join': 'round' }}
            />
            <Layer 
              id="alternative-route-line" 
              type="line" 
              paint={{ 'line-color': '#9aa0a6', 'line-width': 5, 'line-opacity': 0.7, 'line-dasharray': [2, 1] }} 
              layout={{ 'line-cap': 'round', 'line-join': 'round' }}
            />
          </Source>
        )}
        
        {/* Main Route - Google-style BLUE (lepiej widoczna niż violet) */}
        {routeGeoJSON && (
          <Source id="route" type="geojson" data={routeGeoJSON}>
            {/* Outer glow - subtle blue */}
            <Layer 
              id="route-glow" 
              type="line" 
              paint={{ 
                'line-color': 'rgba(66, 133, 244, 0.25)', 
                'line-width': 18, 
                'line-opacity': 1,
                'line-blur': 3 
              }} 
              layout={{ 'line-cap': 'round', 'line-join': 'round' }} 
            />
            {/* Dark outline for depth */}
            <Layer 
              id="route-outline" 
              type="line" 
              paint={{ 
                'line-color': '#1a73e8', 
                'line-width': 10, 
                'line-opacity': 1 
              }} 
              layout={{ 'line-cap': 'round', 'line-join': 'round' }} 
            />
            {/* Main route - bright Google blue */}
            <Layer 
              id="route-line" 
              type="line" 
              paint={{ 
                'line-color': '#4285F4', 
                'line-width': 7, 
                'line-opacity': 1 
              }} 
              layout={{ 'line-cap': 'round', 'line-join': 'round' }} 
            />
          </Source>
        )}
        
        {/* ═══════════════════════════════════════════════════════════════
            Google-Style Clean Markers
            ═══════════════════════════════════════════════════════════════ */}
        
        {/* START Marker - Clean blue dot */}
        {startCoords && (
          <Marker longitude={startCoords.lng} latitude={startCoords.lat} anchor="center">
            <div className="animate-in fade-in zoom-in duration-300">
              <GoogleStartPin size={28} />
            </div>
          </Marker>
        )}
        
        {/* DESTINATION Marker - Red pin like Google with drop animation */}
        {endCoords && (
          <Marker longitude={endCoords.lng} latitude={endCoords.lat} anchor="bottom">
            <div className="animate-marker-drop">
              <GoogleDestPin size={44} />
            </div>
          </Marker>
        )}

        {/* Incidents Markers - Yellow warning */}
        {showIncidentsLayer && incidents.map(incident => (
          <Marker 
            key={incident.id} 
            longitude={incident.lng} 
            latitude={incident.lat} 
            anchor="center"
          >
            <div 
              className="h-7 w-7 rounded-full border-2 border-white shadow-lg flex items-center justify-center animate-in fade-in zoom-in"
              style={{ 
                background: '#fbbc04',
                boxShadow: '0 2px 6px rgba(251,188,4,0.4)'
              }}
            >
              {incident.type === 'roadwork' || incident.type === 'construction' ? (
                <Construction className="h-3.5 w-3.5 text-white drop-shadow-sm" />
              ) : (
                <AlertTriangle className="h-3.5 w-3.5 text-white drop-shadow-sm" />
              )}
            </div>
          </Marker>
        ))}

        {/* User Location - Clean blue dot with direction */}
        {hasConsent && location && status !== 'inactive' && (
          <Marker longitude={location.longitude} latitude={location.latitude} anchor="center">
            <GoogleUserMarker heading={location.heading} accuracy={location.accuracy} />
          </Marker>
        )}
      </Map>
      
      {/* Follow Mode FAB - DESKTOP ONLY (mobile uses MapsFABs integrated button) */}
      {!isMobile && hasConsent && location && (
        <div 
          className="absolute right-4 z-30"
          style={{ 
            bottom: navigation.isNavigating 
              ? 'calc(2rem + env(safe-area-inset-bottom))' 
              : 'calc(12rem + env(safe-area-inset-bottom))',
          }}
        >
          <FollowModeFAB
            followMode={cameraController.followMode}
            isMapRotated={cameraController.isMapRotated}
            showPill={cameraController.showFollowDisabledPill}
            onCycleFollowMode={cameraController.cycleFollowMode}
            onResetBearing={cameraController.resetBearing}
            onRestoreFollowMode={cameraController.restoreFollowMode}
            onDismissPill={cameraController.dismissPill}
            isNavigating={navigation.isNavigating}
          />
        </div>
      )}
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
