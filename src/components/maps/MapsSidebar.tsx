import { Map, Sparkles, AlertTriangle, Loader2, Navigation, X, Route, Brain, ChevronRight, Clock, TrendingUp, Zap, GitBranch } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { RoutingState, RouteMode } from './useRouting';
import { AddressAutocompleteInput } from './AddressAutocompleteInput';
import { Coordinates } from './routingService';
import { GpsState } from './useUserLocation';
import { NavigationState } from './useNavigation';

interface MapsSidebarProps {
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
}

const MapsSidebar = ({ routing, gps, navigation }: MapsSidebarProps) => {
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

  const gpsAvailable = gps.hasConsent && gps.location && gps.status !== 'inactive';
  const canNavigate = route && gps.hasConsent && gps.location && !navigation.isNavigating;
  const timeDifference = alternativeRoute && route ? Math.round(alternativeRoute.duration - route.duration) : 0;

  // Get simplest route stats for display
  const simplestRoute = routeOptions.length > 0 
    ? routeOptions.reduce((a, b) => a.turnsCount < b.turnsCount ? a : b)
    : null;

  return (
    <div className="w-80 flex-shrink-0 bg-card border-r flex flex-col h-full overflow-y-auto">
      {/* Header */}
      <div className="p-4 border-b">
        <div className="flex items-center gap-2">
          <Map className="h-6 w-6 text-primary" />
          <span className="font-bold text-lg">GetRido Maps</span>
        </div>
        <Badge variant="secondary" className="mt-2">
          {navigation.isNavigating ? 'NAWIGACJA' : 'Tryb STANDARD'}
        </Badge>
      </div>

      {/* Route Search */}
      <div className="p-4 space-y-3">
        <Label className="text-xs text-muted-foreground uppercase tracking-wide">Planowanie trasy</Label>
        
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
          <Button className="flex-1 gap-2" onClick={handleCalculateRoute} disabled={isLoading || !endInput.trim() || navigation.isNavigating}>
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Navigation className="h-4 w-4" />}
            {isLoading ? 'Wyznaczanie...' : 'Wyznacz trasę'}
          </Button>
          {route && !navigation.isNavigating && (
            <Button variant="outline" size="icon" onClick={clearRoute}><X className="h-4 w-4" /></Button>
          )}
        </div>
        
        {gpsAvailable && !startInput.trim() && !navigation.isNavigating && (
          <p className="text-xs text-muted-foreground">💡 Jeśli nie wpiszesz punktu startowego, użyję Twojej lokalizacji GPS</p>
        )}
      </div>

      {/* Route Mode Selection - NEW */}
      {routeOptions.length > 1 && !navigation.isNavigating && (
        <div className="p-4 border-t space-y-3">
          <Label className="text-xs text-muted-foreground uppercase tracking-wide">Tryb trasy</Label>
          
          <div className="space-y-2">
            <button
              onClick={() => setRouteMode('fastest')}
              className={`w-full flex items-center justify-between p-3 rounded-lg border transition-colors ${
                selectedRouteMode === 'fastest' ? 'bg-primary/5 border-primary/30' : 'bg-muted/30 hover:bg-muted/50'
              }`}
            >
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-primary" />
                <span className="font-medium">Najszybsza</span>
              </div>
              <span className="text-sm text-muted-foreground">{Math.round(routeOptions[0]?.duration || 0)} min</span>
            </button>
            
            <button
              onClick={() => setRouteMode('simplest')}
              className={`w-full flex items-center justify-between p-3 rounded-lg border transition-colors ${
                selectedRouteMode === 'simplest' ? 'bg-primary/5 border-primary/30' : 'bg-muted/30 hover:bg-muted/50'
              }`}
            >
              <div className="flex items-center gap-2">
                <GitBranch className="h-4 w-4 text-green-600" />
                <span className="font-medium">Najprostsza</span>
              </div>
              <span className="text-sm text-muted-foreground">{simplestRoute?.turnsCount || 0} skrętów</span>
            </button>
          </div>
        </div>
      )}

      {/* Navigate Button - NEW */}
      {canNavigate && (
        <div className="px-4 pb-4">
          <Button 
            className="w-full gap-2 bg-green-600 hover:bg-green-700 text-white"
            onClick={navigation.startNavigation}
          >
            <Navigation className="h-4 w-4" />
            Prowadź do celu
          </Button>
        </div>
      )}

      {/* Navigation Active Status */}
      {navigation.isNavigating && (
        <div className="px-4 pb-4">
          <div className="p-3 bg-green-500/10 border border-green-500/30 rounded-lg">
            <div className="flex items-center gap-2 text-green-600 mb-2">
              <Navigation className="h-4 w-4 animate-pulse" />
              <span className="text-sm font-medium">Nawigacja aktywna</span>
            </div>
            <Button variant="outline" size="sm" className="w-full" onClick={navigation.stopNavigation}>
              Zakończ nawigację
            </Button>
          </div>
        </div>
      )}

      {/* Route Info */}
      <div className="p-4 border-t bg-muted/30">
        <Label className="text-xs text-muted-foreground uppercase tracking-wide">Informacje o trasie</Label>
        <div className="grid grid-cols-2 gap-3 mt-3">
          <div className="p-3 bg-background rounded-lg border">
            <span className="text-xs text-muted-foreground">Odległość</span>
            <p className="font-semibold text-lg">{route ? `${route.distance.toFixed(1)} km` : '— km'}</p>
          </div>
          <div className="p-3 bg-background rounded-lg border">
            <span className="text-xs text-muted-foreground">Czas</span>
            <p className="font-semibold text-lg">{route ? `${Math.round(route.duration)} min` : '— min'}</p>
          </div>
        </div>
      </div>

      {/* AI FREE Analysis Section */}
      {route && !navigation.isNavigating && (
        <div className="p-4 border-t space-y-3">
          <div className="flex items-center gap-2">
            <Brain className="h-4 w-4 text-primary" />
            <Label className="text-xs text-muted-foreground uppercase tracking-wide">GetRido AI – analiza FREE</Label>
          </div>
          
          {isAnalyzing ? (
            <div className="p-3 bg-primary/5 rounded-lg border border-primary/10 animate-pulse">
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 text-primary animate-spin" />
                <span className="text-xs text-primary">Analizuję trasę...</span>
              </div>
            </div>
          ) : aiAnalysis ? (
            <div className="space-y-3">
              <div className="p-3 bg-gradient-to-br from-primary/5 to-primary/10 rounded-lg border border-primary/20">
                <div className="space-y-2">
                  {aiAnalysis.messages.map((message, idx) => (
                    <div key={idx} className="flex items-start gap-2">
                      <ChevronRight className="h-3 w-3 text-primary mt-0.5 flex-shrink-0" />
                      <p className="text-xs text-foreground/80">{message}</p>
                    </div>
                  ))}
                </div>
                {aiAnalysis.estimatedDelay && aiAnalysis.estimatedDelay > 0 && (
                  <div className="mt-3 pt-2 border-t border-primary/10 flex items-center gap-2">
                    <Clock className="h-3 w-3 text-amber-500" />
                    <span className="text-xs text-amber-600">Szacowane opóźnienie: +{aiAnalysis.estimatedDelay} min</span>
                  </div>
                )}
              </div>
              
              <div className="flex items-center justify-between p-2 bg-background rounded-lg border">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-3 w-3 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Poziom ryzyka:</span>
                </div>
                <Badge variant="outline" className={`text-xs ${aiAnalysis.riskLevel === 'low' ? 'bg-green-500/10 text-green-600 border-green-500/30' : aiAnalysis.riskLevel === 'medium' ? 'bg-amber-500/10 text-amber-600 border-amber-500/30' : 'bg-red-500/10 text-red-600 border-red-500/30'}`}>
                  {aiAnalysis.riskLevel === 'low' ? 'Niski' : aiAnalysis.riskLevel === 'medium' ? 'Średni' : 'Wysoki'}
                </Badge>
              </div>
              
              {aiAnalysis.suggestAlternative && !alternativeRoute && (
                <Button variant="outline" className="w-full gap-2 border-primary/30 text-primary hover:bg-primary/5" onClick={calculateAlternative} disabled={isLoading}>
                  <Route className="h-4 w-4" />
                  <span>Sprawdź alternatywę (FREE)</span>
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
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div><span className="text-muted-foreground">Dystans:</span><span className="ml-1 font-medium">{alternativeRoute.distance.toFixed(1)} km</span></div>
                    <div><span className="text-muted-foreground">Czas:</span><span className="ml-1 font-medium">{Math.round(alternativeRoute.duration)} min</span></div>
                  </div>
                  {timeDifference !== 0 && (
                    <p className="text-xs text-muted-foreground mt-2">Różnica: {timeDifference > 0 ? '+' : ''}{timeDifference} min względem trasy głównej</p>
                  )}
                </div>
              )}
            </div>
          ) : null}
        </div>
      )}

      {/* Action Buttons */}
      <div className="p-4 border-t mt-auto space-y-2">
        <Button variant="outline" className="w-full gap-2 justify-start" disabled>
          <Sparkles className="h-4 w-4" /><span className="flex-1 text-left">Zapytaj AI</span><Badge variant="secondary" className="text-xs">Wkrótce</Badge>
        </Button>
        <Button variant="outline" className="w-full gap-2 justify-start" disabled>
          <AlertTriangle className="h-4 w-4" /><span className="flex-1 text-left">Zgłoś zdarzenie</span><Badge variant="secondary" className="text-xs">Wkrótce</Badge>
        </Button>
      </div>
    </div>
  );
};

export default MapsSidebar;
