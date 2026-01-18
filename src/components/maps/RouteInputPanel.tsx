// GetRido Maps - Route Input Panel (Google Maps style - top of screen)
// Shows Skąd/Dokąd while keeping map visible

import { useState } from 'react';
import { MapPin, Navigation, X, MoreVertical, ArrowUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AddressAutocompleteInput } from './AddressAutocompleteInput';
import { AddressSuggestion } from './autocompleteService';
import { RoutingState } from './useRouting';
import { GpsState } from './useUserLocation';

interface RouteInputPanelProps {
  routing: RoutingState & {
    setStartInput: (value: string) => void;
    setEndInput: (value: string) => void;
    setStartCoords: (coords: { lat: number; lng: number } | null) => void;
    setEndCoords: (coords: { lat: number; lng: number } | null) => void;
    calculateRoute: () => void;
    clearRoute: () => void;
  };
  gps: GpsState;
  onClose: () => void;
}

const RouteInputPanel = ({ routing, gps, onClose }: RouteInputPanelProps) => {
  const [startInputValue, setStartInputValue] = useState('');
  const [endInputValue, setEndInputValue] = useState(routing.endInput || '');
  const [useCurrentLocation, setUseCurrentLocation] = useState(true);

  const handleStartSelect = (location: AddressSuggestion) => {
    setStartInputValue(location.shortName);
    routing.setStartInput(location.shortName);
    routing.setStartCoords({ lat: location.lat, lng: location.lng });
    setUseCurrentLocation(false);
    
    // Recalculate if we have destination
    if (routing.endCoords) {
      routing.calculateRoute();
    }
  };

  const handleEndSelect = (location: AddressSuggestion) => {
    setEndInputValue(location.shortName);
    routing.setEndInput(location.shortName);
    routing.setEndCoords({ lat: location.lat, lng: location.lng });
    
    // Calculate route (use GPS if start not set)
    routing.calculateRoute();
  };

  const handleSwapLocations = () => {
    const tempStart = startInputValue;
    const tempStartCoords = routing.startCoords;
    
    setStartInputValue(endInputValue);
    setEndInputValue(tempStart);
    
    routing.setStartInput(endInputValue);
    routing.setEndInput(tempStart);
    routing.setStartCoords(routing.endCoords);
    routing.setEndCoords(tempStartCoords);
    
    setUseCurrentLocation(false);
    
    if (routing.startCoords && routing.endCoords) {
      routing.calculateRoute();
    }
  };

  const handleClearDestination = () => {
    setEndInputValue('');
    routing.setEndInput('');
    routing.setEndCoords(null);
    routing.clearRoute();
  };

  return (
    <div 
      className="absolute top-0 left-0 right-0 z-40"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      <div className="mx-2 mt-2 rounded-xl overflow-hidden shadow-xl bg-card/98 backdrop-blur-xl border border-border/50">
        {/* Header with close */}
        <div className="flex items-center gap-1.5 px-2 pt-2 pb-0.5">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-full shrink-0"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </Button>
          <span className="text-xs font-medium text-muted-foreground flex-1">Zaplanuj trasę</span>
          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full">
            <MoreVertical className="h-4 w-4" />
          </Button>
        </div>

        {/* Input fields */}
        <div className="flex items-stretch gap-1.5 px-2 pb-2">
          {/* Route dots */}
          <div className="flex flex-col items-center justify-center py-2 w-6 shrink-0">
            <div className="h-2.5 w-2.5 rounded-full border-2 border-primary bg-background" />
            <div className="flex-1 w-0.5 bg-border my-0.5 min-h-[16px]" />
            <div className="h-2.5 w-2.5 rounded-full bg-primary" />
          </div>

          <div className="flex-1 flex flex-col gap-1.5">
            {/* Start input */}
            <div className="relative">
              {useCurrentLocation ? (
                <button 
                  type="button"
                  className="w-full h-10 px-3 rounded-lg bg-muted/50 flex items-center gap-2 cursor-pointer hover:bg-blue-500/5 hover:border-blue-500/30 border border-transparent transition-colors text-left group"
                  onClick={() => setUseCurrentLocation(false)}
                >
                  {/* Blue pulsing GPS point */}
                  <div className="h-2.5 w-2.5 rounded-full bg-blue-500 ring-3 ring-blue-500/20 animate-pulse" />
                  <span className="text-xs text-blue-600 font-medium group-hover:underline">Twoja lokalizacja</span>
                </button>
              ) : (
                <AddressAutocompleteInput
                  value={startInputValue}
                  onChange={setStartInputValue}
                  onLocationSelect={handleStartSelect}
                  placeholder="Wybierz punkt startowy"
                  markerColor="green"
                  fieldType="start"
                  className="h-10 px-3 rounded-lg bg-muted/50 border-0 text-xs"
                />
              )}
            </div>

            {/* End input */}
            <div className="relative">
              <AddressAutocompleteInput
                value={endInputValue}
                onChange={setEndInputValue}
                onLocationSelect={handleEndSelect}
                placeholder="Dokąd chcesz jechać?"
                markerColor="red"
                fieldType="end"
                className="h-10 px-3 rounded-lg bg-muted/50 border-0 text-xs pr-8"
              />
              {endInputValue && (
                <button
                  onClick={handleClearDestination}
                  className="absolute right-2 top-1/2 -translate-y-1/2 h-5 w-5 rounded-full bg-muted-foreground/20 flex items-center justify-center hover:bg-muted-foreground/30 transition-colors"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          </div>

          {/* Swap button */}
          <div className="flex items-center justify-center w-8 shrink-0">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-full"
              onClick={handleSwapLocations}
            >
              <ArrowUpDown className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RouteInputPanel;