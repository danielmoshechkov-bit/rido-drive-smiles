import { useState, useCallback, useEffect } from 'react';
import Map, { Marker, NavigationControl, ScaleControl, Source, Layer } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { MapPin, Layers, Car, Navigation } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { DEFAULT_VIEW_STATE, MAP_STYLE } from './mapStyles';
import { RoutingState } from './useRouting';

interface MapsContainerProps {
  routing: RoutingState;
}

const MapsContainer = ({ routing }: MapsContainerProps) => {
  const [viewState, setViewState] = useState(DEFAULT_VIEW_STATE);
  const { route, startCoords, endCoords } = routing;

  const handleMove = useCallback((evt: { viewState: typeof DEFAULT_VIEW_STATE }) => {
    setViewState(evt.viewState);
  }, []);

  // Fit map to route bounds when route changes
  useEffect(() => {
    if (route && route.coordinates.length > 0) {
      // Calculate bounds from route coordinates
      let minLng = Infinity, maxLng = -Infinity;
      let minLat = Infinity, maxLat = -Infinity;
      
      route.coordinates.forEach(([lng, lat]) => {
        minLng = Math.min(minLng, lng);
        maxLng = Math.max(maxLng, lng);
        minLat = Math.min(minLat, lat);
        maxLat = Math.max(maxLat, lat);
      });
      
      // Center on route with appropriate zoom
      const centerLng = (minLng + maxLng) / 2;
      const centerLat = (minLat + maxLat) / 2;
      
      // Calculate zoom based on bounds
      const lngDiff = maxLng - minLng;
      const latDiff = maxLat - minLat;
      const maxDiff = Math.max(lngDiff, latDiff);
      
      let zoom = 12;
      if (maxDiff > 0.5) zoom = 9;
      else if (maxDiff > 0.2) zoom = 10;
      else if (maxDiff > 0.1) zoom = 11;
      else if (maxDiff > 0.05) zoom = 12;
      else zoom = 13;
      
      setViewState({
        longitude: centerLng,
        latitude: centerLat,
        zoom,
      });
    }
  }, [route]);

  // Create GeoJSON for route line
  const routeGeoJSON = route ? {
    type: 'Feature' as const,
    properties: {},
    geometry: {
      type: 'LineString' as const,
      coordinates: route.coordinates,
    },
  } : null;

  return (
    <div className="relative flex-1 h-full overflow-hidden">
      <Map
        {...viewState}
        onMove={handleMove}
        style={{ width: '100%', height: '100%' }}
        mapStyle={MAP_STYLE}
        attributionControl={false}
      >
        <NavigationControl position="top-right" showCompass={false} />
        <ScaleControl position="bottom-right" />
        
        {/* Route Line */}
        {routeGeoJSON && (
          <Source id="route" type="geojson" data={routeGeoJSON}>
            {/* Route shadow/outline */}
            <Layer
              id="route-outline"
              type="line"
              paint={{
                'line-color': '#1e40af',
                'line-width': 8,
                'line-opacity': 0.3,
              }}
            />
            {/* Main route line */}
            <Layer
              id="route-line"
              type="line"
              paint={{
                'line-color': '#3b82f6',
                'line-width': 5,
                'line-opacity': 1,
              }}
            />
          </Source>
        )}
        
        {/* Start Marker */}
        {startCoords && (
          <Marker
            longitude={startCoords.lng}
            latitude={startCoords.lat}
            anchor="bottom"
          >
            <div className="flex flex-col items-center animate-in fade-in zoom-in duration-300">
              <div className="bg-green-500 text-white px-2 py-1 rounded-lg text-xs font-medium shadow-lg mb-1">
                START
              </div>
              <div className="relative">
                <MapPin className="h-8 w-8 text-green-500 drop-shadow-lg" fill="#22c55e" />
              </div>
            </div>
          </Marker>
        )}
        
        {/* End Marker */}
        {endCoords && (
          <Marker
            longitude={endCoords.lng}
            latitude={endCoords.lat}
            anchor="bottom"
          >
            <div className="flex flex-col items-center animate-in fade-in zoom-in duration-300">
              <div className="bg-red-500 text-white px-2 py-1 rounded-lg text-xs font-medium shadow-lg mb-1">
                CEL
              </div>
              <div className="relative">
                <MapPin className="h-8 w-8 text-red-500 drop-shadow-lg" fill="#ef4444" />
              </div>
            </div>
          </Marker>
        )}
      </Map>
      
      {/* Layer badges */}
      <div className="absolute bottom-4 left-4 flex gap-2 pointer-events-none">
        <Badge variant="secondary" className="gap-1.5 bg-background/90 backdrop-blur-sm shadow-sm border">
          <Layers className="h-3 w-3" />
          Warstwy
        </Badge>
        <Badge variant="secondary" className="gap-1.5 bg-background/90 backdrop-blur-sm shadow-sm border">
          <Car className="h-3 w-3" />
          Ruch
        </Badge>
      </div>
      
      {/* Mode badge */}
      <div className="absolute top-4 left-4">
        {route ? (
          <Badge className="bg-blue-500/90 backdrop-blur-sm shadow-sm gap-1.5">
            <Navigation className="h-3 w-3" />
            Trasa STANDARD
          </Badge>
        ) : (
          <Badge variant="outline" className="bg-background/90 backdrop-blur-sm shadow-sm border-amber-500/50 text-amber-600">
            Tryb testowy
          </Badge>
        )}
      </div>
      
      {/* OSM Attribution */}
      <div className="absolute bottom-4 right-24 text-[10px] text-muted-foreground bg-background/80 backdrop-blur-sm px-2 py-0.5 rounded">
        © OpenStreetMap · OSRM
      </div>
    </div>
  );
};

export default MapsContainer;
