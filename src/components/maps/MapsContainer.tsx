import { useState, useCallback, useEffect } from 'react';
import Map, { Marker, NavigationControl, ScaleControl, Source, Layer } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { MapPin, Layers, Car, Navigation, Route, User, Construction, AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { DEFAULT_VIEW_STATE, MAP_STYLE } from './mapStyles';
import { RoutingState } from './useRouting';
import { GpsState } from './useUserLocation';
import { NavigationState } from './useNavigation';
import { Incident } from './incidentsService';
import { useMapsConfig } from '@/hooks/useMapsConfig';
import NavigationPanel from './NavigationPanel';

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
        
        {alternativeGeoJSON && (
          <Source id="alternative-route" type="geojson" data={alternativeGeoJSON}>
            <Layer id="alternative-route-outline" type="line" paint={{ 'line-color': '#92400e', 'line-width': 8, 'line-opacity': 0.2 }} />
            <Layer id="alternative-route-line" type="line" paint={{ 'line-color': '#f59e0b', 'line-width': 4, 'line-opacity': 0.8, 'line-dasharray': [2, 2] }} />
          </Source>
        )}
        
        {routeGeoJSON && (
          <Source id="route" type="geojson" data={routeGeoJSON}>
            <Layer id="route-outline" type="line" paint={{ 'line-color': '#1e40af', 'line-width': 8, 'line-opacity': 0.3 }} />
            <Layer id="route-line" type="line" paint={{ 'line-color': '#3b82f6', 'line-width': 5, 'line-opacity': 1 }} />
          </Source>
        )}
        
        {startCoords && (
          <Marker longitude={startCoords.lng} latitude={startCoords.lat} anchor="bottom">
            <div className="flex flex-col items-center animate-in fade-in zoom-in duration-300">
              <div className="bg-green-500 text-white px-2 py-1 rounded-lg text-xs font-medium shadow-lg mb-1">START</div>
              <MapPin className="h-8 w-8 text-green-500 drop-shadow-lg" fill="#22c55e" />
            </div>
          </Marker>
        )}
        
        {endCoords && (
          <Marker longitude={endCoords.lng} latitude={endCoords.lat} anchor="bottom">
            <div className="flex flex-col items-center animate-in fade-in zoom-in duration-300">
              <div className="bg-red-500 text-white px-2 py-1 rounded-lg text-xs font-medium shadow-lg mb-1">CEL</div>
              <MapPin className="h-8 w-8 text-red-500 drop-shadow-lg" fill="#ef4444" />
            </div>
          </Marker>
        )}

        {/* Incidents markers */}
        {showIncidentsLayer && incidents.map(incident => (
          <Marker 
            key={incident.id} 
            longitude={incident.lng} 
            latitude={incident.lat} 
            anchor="center"
          >
            <div className="h-7 w-7 bg-amber-500 rounded-full border-2 border-white shadow-lg flex items-center justify-center animate-in fade-in zoom-in">
              {incident.type === 'roadwork' || incident.type === 'construction' ? (
                <Construction className="h-4 w-4 text-white" />
              ) : (
                <AlertTriangle className="h-4 w-4 text-white" />
              )}
            </div>
          </Marker>
        ))}

        {hasConsent && location && status !== 'inactive' && (
          <Marker longitude={location.longitude} latitude={location.latitude} anchor="center">
            <div className="relative flex items-center justify-center">
              <div className="absolute bg-blue-500/10 rounded-full border border-blue-500/30 animate-pulse" style={{ width: Math.min(Math.max(location.accuracy * 0.5, 24), 100), height: Math.min(Math.max(location.accuracy * 0.5, 24), 100) }} />
              <div className="relative h-5 w-5 bg-blue-600 rounded-full border-2 border-white shadow-lg z-10 flex items-center justify-center">
                <User className="h-3 w-3 text-white" />
                {location.heading !== null && (
                  <div className="absolute -top-1 left-1/2 w-0 h-0 border-l-[4px] border-l-transparent border-r-[4px] border-r-transparent border-b-[6px] border-b-blue-600" style={{ transform: `translateX(-50%) rotate(${location.heading}deg)`, transformOrigin: 'bottom center' }} />
                )}
              </div>
            </div>
          </Marker>
        )}
      </Map>
      
      <div className="absolute bottom-4 left-4 flex gap-2 pointer-events-none">
        <Badge variant="secondary" className="gap-1.5 bg-background/90 backdrop-blur-sm shadow-sm border"><Layers className="h-3 w-3" />Warstwy</Badge>
        <Badge variant="secondary" className="gap-1.5 bg-background/90 backdrop-blur-sm shadow-sm border"><Car className="h-3 w-3" />Ruch</Badge>
        {incidents.length > 0 && (
          <Badge variant="secondary" className="gap-1.5 bg-amber-500/20 text-amber-700 backdrop-blur-sm shadow-sm border border-amber-500/30">
            <Construction className="h-3 w-3" />
            {incidents.length} zdarzeń
          </Badge>
        )}
      </div>
      
      <div className="absolute top-4 left-4 flex flex-col gap-2">
        {navigation.isNavigating ? (
          <Badge className="bg-green-500/90 backdrop-blur-sm shadow-sm gap-1.5"><Navigation className="h-3 w-3 animate-pulse" />Nawigacja</Badge>
        ) : route ? (
          <>
            <Badge className="bg-blue-500/90 backdrop-blur-sm shadow-sm gap-1.5"><Navigation className="h-3 w-3" />Trasa STANDARD</Badge>
            {showAlternative && alternativeRoute && <Badge className="bg-amber-500/90 backdrop-blur-sm shadow-sm gap-1.5"><Route className="h-3 w-3" />Alternatywa FREE</Badge>}
          </>
        ) : (
          <Badge variant="outline" className="bg-background/90 backdrop-blur-sm shadow-sm border-amber-500/50 text-amber-600">Tryb testowy</Badge>
        )}
      </div>
      
      <div className="absolute bottom-4 right-24 text-[10px] text-muted-foreground bg-background/80 backdrop-blur-sm px-2 py-0.5 rounded">© OpenStreetMap · OSRM</div>
    </div>
  );
};

export default MapsContainer;
