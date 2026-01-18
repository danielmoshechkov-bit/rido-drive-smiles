// GetRido Maps - Mobile Route Form
import { Navigation, X, Loader2, Zap, GitBranch, Brain, ChevronRight, Clock, TrendingUp, Route } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { AddressAutocompleteInput } from './AddressAutocompleteInput';
import { RoutingState, RouteMode } from './useRouting';
import { Coordinates } from './routingService';
import { GpsState } from './useUserLocation';
import { NavigationState } from './useNavigation';

interface MobileRouteFormProps {
  routing: RoutingState & {
    setStartInput: (value: string) => void;
    setEndInput: (value: string) => void;
    setStartCoords: (coords: Coordinates | null) => void;
    setEndCoords: (coords: Coordinates | null) => void;
    setRouteMode: (mode: RouteMode) => void;
    calculateRoute: () => void;
    calculateAlternative: () => void;
    toggleAlternative: () => void;
    clearRoute: () => void;
  };
  gps: GpsState;
  navigation: NavigationState & {
    startNavigation: () => Promise<void>;
    stopNavigation: () => void;
  };
  onClose?: () => void;
}

const MobileRouteForm = ({ routing, gps, navigation, onClose }: MobileRouteFormProps) => {
  const {
    startInput, endInput, route, alternativeRoute, showAlternative, isLoading, error,
    aiAnalysis, isAnalyzing, routeOptions, selectedRouteMode,
    setStartInput, setEndInput, setStartCoords, setEndCoords, setRouteMode,
    calculateRoute, calculateAlternative, toggleAlternative, clearRoute,
  } = routing;

  const handleCalculateRoute = () => {
    if (!isLoading) calculateRoute();
  };

  const handleUseMyLocation = () => {
    if (gps.hasConsent && gps.location) {
      setStartInput('Twoja lokalizacja');
      setStartCoords({ lat: gps.location.latitude, lng: gps.location.longitude });
    }
  };

  const handleStartNavigation = async () => {
    await navigation.startNavigation();
    onClose?.();
  };

  const gpsAvailable = gps.hasConsent && gps.location && gps.status !== 'inactive';
  const canNavigate = route && gps.hasConsent && gps.location && !navigation.isNavigating;
  const timeDifference = alternativeRoute && route ? Math.round(alternativeRoute.duration - route.duration) : 0;
  const simplestRoute = routeOptions.length > 0 
    ? routeOptions.reduce((a, b) => a.turnsCount < b.turnsCount ? a : b)
    : null;

  return (
    <div className="space-y-4">
      {/* Route Search */}
      <div className="space-y-3">
        <AddressAutocompleteInput
          value={startInput}
          onChange={setStartInput}
          onLocationSelect={(loc) => setStartCoords({ lat: loc.lat, lng: loc.lng })}
          placeholder="Skąd? (adres lub współrzędne)"
          markerColor="green"
          disabled={isLoading || navigation.isNavigating}
          gpsLocation={gpsAvailable ? gps.location : null}
          onUseMyLocation={gpsAvailable ? handleUseMyLocation : undefined}
        />
        
        <div className="ml-[18px] h-3 border-l-2 border-dashed border-muted-foreground/30" />
        
        <AddressAutocompleteInput
          value={endInput}
          onChange={setEndInput}
          onLocationSelect={(loc) => setEndCoords({ lat: loc.lat, lng: loc.lng })}
          placeholder="Dokąd? (adres lub współrzędne)"
          markerColor="red"
          disabled={isLoading || navigation.isNavigating}
        />

        {error && <p className="text-xs text-destructive">{error}</p>}
        
        <div className="flex gap-2">
          <Button 
            className="flex-1 gap-2" 
            onClick={handleCalculateRoute} 
            disabled={isLoading || !endInput.trim() || navigation.isNavigating}
          >
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Navigation className="h-4 w-4" />}
            {isLoading ? 'Wyznaczanie...' : 'Wyznacz trasę'}
          </Button>
          {route && !navigation.isNavigating && (
            <Button variant="outline" size="icon" onClick={clearRoute}>
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
        
        {gpsAvailable && !startInput.trim() && !navigation.isNavigating && (
          <p className="text-xs text-muted-foreground">💡 Bez punktu startowego użyję Twojej lokalizacji GPS</p>
        )}
      </div>

      {/* Route Mode Selection */}
      {routeOptions.length > 1 && !navigation.isNavigating && (
        <div className="space-y-2 pt-2 border-t">
          <Label className="text-xs text-muted-foreground uppercase tracking-wide">Tryb trasy</Label>
          
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setRouteMode('fastest')}
              className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${
                selectedRouteMode === 'fastest' ? 'bg-primary/5 border-primary/30' : 'bg-muted/30'
              }`}
            >
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-primary" />
                <span className="font-medium text-sm">Najszybsza</span>
              </div>
            </button>
            
            <button
              onClick={() => setRouteMode('simplest')}
              className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${
                selectedRouteMode === 'simplest' ? 'bg-primary/5 border-primary/30' : 'bg-muted/30'
              }`}
            >
              <div className="flex items-center gap-2">
                <GitBranch className="h-4 w-4 text-green-600" />
                <span className="font-medium text-sm">Najprostsza</span>
              </div>
            </button>
          </div>
        </div>
      )}

      {/* Route Info */}
      {route && (
        <div className="grid grid-cols-2 gap-3 pt-2 border-t">
          <div className="p-3 bg-muted/50 rounded-lg text-center">
            <span className="text-xs text-muted-foreground">Odległość</span>
            <p className="font-semibold text-lg">{route.distance.toFixed(1)} km</p>
          </div>
          <div className="p-3 bg-muted/50 rounded-lg text-center">
            <span className="text-xs text-muted-foreground">Czas</span>
            <p className="font-semibold text-lg">{Math.round(route.duration)} min</p>
          </div>
        </div>
      )}

      {/* Navigate Button */}
      {canNavigate && (
        <Button 
          className="w-full gap-2 bg-green-600 hover:bg-green-700 text-white h-12"
          onClick={handleStartNavigation}
        >
          <Navigation className="h-5 w-5" />
          Prowadź do celu
        </Button>
      )}

      {/* AI Analysis (condensed for mobile) */}
      {route && !navigation.isNavigating && aiAnalysis && (
        <div className="pt-2 border-t space-y-3">
          <div className="flex items-center gap-2">
            <Brain className="h-4 w-4 text-primary" />
            <Label className="text-xs text-muted-foreground uppercase tracking-wide">AI FREE analiza</Label>
          </div>
          
          {isAnalyzing ? (
            <div className="p-3 bg-primary/5 rounded-lg animate-pulse flex items-center gap-2">
              <Loader2 className="h-4 w-4 text-primary animate-spin" />
              <span className="text-xs text-primary">Analizuję...</span>
            </div>
          ) : (
            <div className="p-3 bg-gradient-to-br from-primary/5 to-primary/10 rounded-lg border border-primary/20 space-y-2">
              {aiAnalysis.messages.slice(0, 2).map((message, idx) => (
                <div key={idx} className="flex items-start gap-2">
                  <ChevronRight className="h-3 w-3 text-primary mt-0.5 flex-shrink-0" />
                  <p className="text-xs text-foreground/80">{message}</p>
                </div>
              ))}
              
              <div className="flex items-center justify-between pt-2 border-t border-primary/10">
                <span className="text-xs text-muted-foreground">Ryzyko:</span>
                <Badge 
                  variant="outline" 
                  className={`text-xs ${
                    aiAnalysis.riskLevel === 'low' 
                      ? 'bg-green-500/10 text-green-600 border-green-500/30' 
                      : aiAnalysis.riskLevel === 'medium' 
                        ? 'bg-amber-500/10 text-amber-600 border-amber-500/30' 
                        : 'bg-red-500/10 text-red-600 border-red-500/30'
                  }`}
                >
                  {aiAnalysis.riskLevel === 'low' ? 'Niski' : aiAnalysis.riskLevel === 'medium' ? 'Średni' : 'Wysoki'}
                </Badge>
              </div>
            </div>
          )}
          
          {aiAnalysis.suggestAlternative && !alternativeRoute && (
            <Button 
              variant="outline" 
              size="sm"
              className="w-full gap-2 border-primary/30 text-primary" 
              onClick={calculateAlternative} 
              disabled={isLoading}
            >
              <Route className="h-4 w-4" />
              Sprawdź alternatywę
            </Button>
          )}
          
          {alternativeRoute && (
            <div className="p-3 bg-amber-500/10 rounded-lg border border-amber-500/20">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Route className="h-4 w-4 text-amber-600" />
                  <span className="text-xs font-medium text-amber-600">Alternatywa FREE</span>
                </div>
                <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={toggleAlternative}>
                  {showAlternative ? 'Ukryj' : 'Pokaż'}
                </Button>
              </div>
              <div className="flex gap-4 text-xs">
                <span><span className="text-muted-foreground">Dystans:</span> {alternativeRoute.distance.toFixed(1)} km</span>
                <span><span className="text-muted-foreground">Czas:</span> {Math.round(alternativeRoute.duration)} min</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default MobileRouteForm;
