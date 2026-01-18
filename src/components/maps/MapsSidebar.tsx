import { Map, Sparkles, AlertTriangle, Loader2, Navigation, X, Route, Clock, TrendingUp, Zap, GitBranch, Construction } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { RoutingState, RouteMode } from './useRouting';
import { AddressAutocompleteInput } from './AddressAutocompleteInput';
import { Coordinates } from './routingService';
import { GpsState } from './useUserLocation';
import { NavigationState } from './useNavigation';
import { RiskAssessment } from './routeRiskService';

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
  riskAssessment?: RiskAssessment | null;
  incidentsCount?: number;
}

const MapsSidebar = ({ routing, gps, navigation, riskAssessment, incidentsCount = 0 }: MapsSidebarProps) => {
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

  // Use riskAssessment if provided, fallback to aiAnalysis
  const displayRiskLevel = riskAssessment?.riskLevel || aiAnalysis?.riskLevel || null;

  return (
    <div className="w-80 flex-shrink-0 bg-card border-r flex flex-col h-full overflow-y-auto">
      {/* Header - RIDO Premium Violet Gradient */}
      <div className="p-4 border-b bg-gradient-to-r from-primary/5 via-primary/3 to-transparent">
        <div className="flex items-center gap-2.5">
          <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center shadow-lg" style={{ boxShadow: '0 4px 12px -2px hsl(259 65% 58% / 0.3)' }}>
            <Map className="h-5 w-5 text-white" />
          </div>
          <span className="font-bold text-lg bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">GetRido Maps</span>
        </div>
        <div className="flex items-center gap-2 mt-3">
          <Badge className={navigation.isNavigating ? 'rido-badge-nav' : 'rido-badge-violet'}>
            {navigation.isNavigating ? 'NAWIGACJA' : 'Tryb RIDO'}
          </Badge>
          {incidentsCount > 0 && (
            <Badge className="rido-badge-gold gap-1">
              <Construction className="h-3 w-3" />
              {incidentsCount}
            </Badge>
          )}
        </div>
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

      {/* Route Mode Selection */}
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

      {/* Navigate Button - Premium CTA */}
      {canNavigate && (
        <div className="px-4 pb-4">
          <Button 
            className="w-full h-14 text-lg font-bold bg-green-600 hover:bg-green-700 text-white shadow-lg gap-3"
            onClick={navigation.startNavigation}
          >
            <Navigation className="h-6 w-6" />
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

      {/* Route Info - Premium Large Numbers */}
      <div className="p-4 border-t bg-muted/30">
        <Label className="text-xs text-muted-foreground uppercase tracking-wide">Informacje o trasie</Label>
        <div className="grid grid-cols-3 gap-2 mt-3">
          <div className="p-3 bg-background rounded-xl border text-center">
            <p className="text-2xl font-bold text-foreground">{route ? route.distance.toFixed(1) : '—'}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">km</p>
          </div>
          <div className="p-3 bg-background rounded-xl border text-center">
            <p className="text-2xl font-bold text-foreground">{route ? Math.round(route.duration) : '—'}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">min</p>
          </div>
          <div className="p-3 bg-primary/10 rounded-xl border border-primary/20 text-center">
            <p className="text-2xl font-bold text-primary">
              {route ? (() => {
                const eta = new Date(Date.now() + route.duration * 60000);
                return `${eta.getHours().toString().padStart(2, '0')}:${eta.getMinutes().toString().padStart(2, '0')}`;
              })() : '--:--'}
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">przyjazd</p>
          </div>
        </div>
        
        {/* Risk Summary - compact */}
        {displayRiskLevel && (
          <div className={`mt-3 p-2 rounded-lg border flex items-center justify-between ${
            displayRiskLevel === 'low' ? 'bg-green-500/5 border-green-500/20' :
            displayRiskLevel === 'medium' ? 'bg-amber-500/5 border-amber-500/20' :
            'bg-red-500/5 border-red-500/20'
          }`}>
            <div className="flex items-center gap-2">
              <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Ryzyko:</span>
            </div>
            <Badge variant="outline" className={`text-xs ${
              displayRiskLevel === 'low' ? 'bg-green-500/10 text-green-600 border-green-500/30' :
              displayRiskLevel === 'medium' ? 'bg-amber-500/10 text-amber-600 border-amber-500/30' :
              'bg-red-500/10 text-red-600 border-red-500/30'
            }`}>
              {displayRiskLevel === 'low' ? 'Niskie' : displayRiskLevel === 'medium' ? 'Średnie' : 'Wysokie'}
            </Badge>
          </div>
        )}
        
        {/* First risk message */}
        {riskAssessment && riskAssessment.messages.length > 0 && riskAssessment.messages[0] !== 'Brak wykrytych utrudnień na trasie' && (
          <p className="text-xs text-muted-foreground mt-2 flex items-start gap-1.5">
            <AlertTriangle className="h-3 w-3 mt-0.5 flex-shrink-0 text-amber-500" />
            {riskAssessment.messages[0]}
          </p>
        )}
      </div>

      {/* AI FREE Analysis Section - Simplified Premium */}
      {route && !navigation.isNavigating && (
        <div className="p-4 border-t space-y-3">
          {isAnalyzing ? (
            <div className="p-4 bg-gradient-to-br from-primary/5 to-primary/10 rounded-xl border border-primary/20 animate-pulse">
              <div className="flex items-center gap-2">
                <Loader2 className="h-5 w-5 text-primary animate-spin" />
                <span className="text-sm text-primary font-medium">RidoAI analizuje trasę...</span>
              </div>
            </div>
          ) : aiAnalysis ? (
            <div className="space-y-3">
              {/* Main AI Card - Friendly Message */}
              <div className="p-4 bg-gradient-to-br from-primary/5 to-primary/10 rounded-xl border border-primary/20">
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles className="h-5 w-5 text-primary" />
                  <span className="font-semibold text-sm">RidoAI przeanalizowało trasę</span>
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">FREE</Badge>
                </div>
                <p className="text-sm text-foreground/80">
                  {displayRiskLevel === 'low' ? 'Trasa wygląda dobrze. Jedź spokojnie! 🚗' : 
                   displayRiskLevel === 'medium' ? 'Możliwe lekkie utrudnienia. Zachowaj czujność.' : 
                   'Wykryto utrudnienia. Rozważ alternatywną trasę.'}
                </p>
                
                {aiAnalysis.estimatedDelay && aiAnalysis.estimatedDelay > 0 && (
                  <div className="mt-3 pt-2 border-t border-primary/10 flex items-center gap-2">
                    <Clock className="h-3 w-3 text-amber-500" />
                    <span className="text-xs text-amber-600">Możliwe opóźnienie: +{aiAnalysis.estimatedDelay} min</span>
                  </div>
                )}
              </div>
              
              {/* Alternative Route Button */}
              {(aiAnalysis.suggestAlternative || (riskAssessment && riskAssessment.suggestAlternative)) && !alternativeRoute && (
                <Button variant="outline" className="w-full gap-2 border-primary/30 text-primary hover:bg-primary/5" onClick={calculateAlternative} disabled={isLoading}>
                  <Route className="h-4 w-4" />
                  <span>Sprawdź alternatywę (FREE)</span>
                </Button>
              )}
              
              {/* Alternative Route Info */}
              {alternativeRoute && (
                <div className="p-3 bg-amber-500/10 rounded-xl border border-amber-500/20">
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
                    <p className="text-xs text-muted-foreground mt-2">Różnica: {timeDifference > 0 ? '+' : ''}{timeDifference} min</p>
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
