import { useState, useCallback } from 'react';
import Map, { Marker, NavigationControl, ScaleControl } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { MapPin, Layers, Car } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { DEFAULT_VIEW_STATE, MAP_STYLE, TEST_MARKER } from './mapStyles';

const MapsContainer = () => {
  const [viewState, setViewState] = useState(DEFAULT_VIEW_STATE);

  const handleMove = useCallback((evt: { viewState: typeof DEFAULT_VIEW_STATE }) => {
    setViewState(evt.viewState);
  }, []);

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
        
        <Marker
          longitude={TEST_MARKER.longitude}
          latitude={TEST_MARKER.latitude}
          anchor="bottom"
        >
          <div className="flex flex-col items-center">
            <div className="bg-primary text-primary-foreground px-3 py-1.5 rounded-lg text-xs font-medium shadow-lg mb-1 whitespace-nowrap">
              {TEST_MARKER.title}
            </div>
            <MapPin className="h-10 w-10 text-primary drop-shadow-lg" />
          </div>
        </Marker>
      </Map>
      
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
      
      <div className="absolute top-4 left-4">
        <Badge variant="outline" className="bg-background/90 backdrop-blur-sm shadow-sm border-amber-500/50 text-amber-600">
          Tryb testowy
        </Badge>
      </div>
      
      <div className="absolute bottom-4 right-24 text-[10px] text-muted-foreground bg-background/80 backdrop-blur-sm px-2 py-0.5 rounded">
        © OpenStreetMap
      </div>
    </div>
  );
};

export default MapsContainer;
