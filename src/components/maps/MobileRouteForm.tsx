// GetRido Maps - Mobile Route Form (Premium UX)
import { useState } from 'react';
import { Navigation, X, Loader2, Zap, GitBranch, Brain, ChevronRight, Route, AlertTriangle, Locate } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { AddressAutocompleteInput } from './AddressAutocompleteInput';
import { RoutingState, RouteMode } from './useRouting';
import { Coordinates } from './routingService';
import { GpsState } from './useUserLocation';
import { NavigationState } from './useNavigation';
import { RiskAssessment } from './routeRiskService';
import TripModeSelector, { TripMode } from './TripModeSelector';

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
  onStartNavigation?: () => Promise<void>;
  // Risk assessment
  riskAssessment?: RiskAssessment | null;
  ridoAiAlternative?: any;
  onUseRidoAiAlternative?: () => void;
}

const MobileRouteForm = ({ 
  routing, 
  gps, 
  navigation, 
  onClose,
  onStartNavigation,
  riskAssessment,
  ridoAiAlternative,
  onUseRidoAiAlternative,
}: MobileRouteFormProps) => {
  const [tripMode, setTripMode] = useState<TripMode>('driving');
  
  const {
    startInput, endInput, route, alternativeRoute, showAlternative, isLoading, error,
    aiAnalysis, isAnalyzing, routeOptions, selectedRouteMode,
    setStartInput, setEndInput, setStartCoords, setEndCoords, setRouteMode,
    calculateRoute, calculateAlternative, toggleAlternative, clearRoute,
  } = routing;

  const handleCalculateRoute = () => {
    if (!isLoading) calculateRoute();
  };

  const handleTripModeChange = (mode: TripMode) => {
    setTripMode(mode);
    // Recalculate route if we have one
    if (route) {
      calculateRoute();
    }
  };

  const handleUseMyLocation = () => {
    if (gps.hasConsent && gps.location) {
      setStartInput('Twoja lokalizacja');
      setStartCoords({ lat: gps.location.latitude, lng: gps.location.longitude });
    }
  };

  const handleStartNavigation = async () => {
    if (onStartNavigation) {
      await onStartNavigation();
    } else {
      await navigation.startNavigation();
      onClose?.();
    }
  };

  const gpsAvailable = gps.hasConsent && gps.location && gps.status !== 'inactive';
  const canNavigate = route && gps.hasConsent && gps.location && !navigation.isNavigating;
  const startIsGps = !startInput.trim() && gpsAvailable;

  return (
    <div className="space-y-5">
      {/* Route Search */}
      <div className="space-y-3">
        {/* GPS indicator when start is empty */}
        {startIsGps && !navigation.isNavigating && (
          <div className="flex items-center gap-2 px-3 py-2 bg-blue-500/10 rounded-lg border border-blue-500/20">
            <Locate className="h-4 w-4 text-blue-600" />
            <span className="text-sm font-medium text-blue-600">Start: Twoja lokalizacja (GPS)</span>
          </div>
        )}
        
        <AddressAutocompleteInput
          value={startInput}
          onChange={setStartInput}
          onLocationSelect={(loc) => setStartCoords({ lat: loc.lat, lng: loc.lng })}
          placeholder="Skąd? (adres lub współrzędne)"
          markerColor="green"
          disabled={isLoading || navigation.isNavigating}
          gpsLocation={gpsAvailable ? gps.location : null}
          onUseMyLocation={gpsAvailable ? handleUseMyLocation : undefined}
          fieldType="start"
        />
        
        <div className="ml-[18px] h-4 border-l-2 border-dashed border-muted-foreground/30" />
        
        <AddressAutocompleteInput
          value={endInput}
          onChange={setEndInput}
          onLocationSelect={(loc) => setEndCoords({ lat: loc.lat, lng: loc.lng })}
          placeholder="Dokąd? (adres lub współrzędne)"
          markerColor="red"
          disabled={isLoading || navigation.isNavigating}
          fieldType="end"
        />

        {error && (
          <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-lg flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-destructive flex-shrink-0" />
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}
        
        <div className="flex gap-2">
          <Button 
            className="flex-1 gap-2 h-12 text-base" 
            onClick={handleCalculateRoute} 
            disabled={isLoading || !endInput.trim() || navigation.isNavigating}
          >
            {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Navigation className="h-5 w-5" />}
            {isLoading ? 'Wyznaczanie...' : 'Wyznacz trasę'}
          </Button>
          {route && !navigation.isNavigating && (
            <Button variant="outline" size="icon" onClick={clearRoute} className="h-12 w-12">
              <X className="h-5 w-5" />
            </Button>
          )}
        </div>
        
        {gpsAvailable && !startInput.trim() && !navigation.isNavigating && (
          <p className="text-xs text-muted-foreground text-center">💡 Bez punktu startowego użyję Twojej lokalizacji GPS</p>
        )}
      </div>

      {/* Route Mode Selection */}
      {routeOptions.length > 1 && !navigation.isNavigating && (
        <div className="space-y-2 pt-3 border-t">
          <Label className="text-xs text-muted-foreground uppercase tracking-wide">Tryb trasy</Label>
          
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setRouteMode('fastest')}
              className={`flex items-center justify-center gap-2 p-3.5 rounded-xl border-2 transition-all ${
                selectedRouteMode === 'fastest' 
                  ? 'bg-primary/10 border-primary shadow-sm' 
                  : 'bg-muted/30 border-transparent hover:border-muted-foreground/30'
              }`}
            >
              <Zap className={`h-5 w-5 ${selectedRouteMode === 'fastest' ? 'text-primary' : 'text-muted-foreground'}`} />
              <span className={`font-semibold ${selectedRouteMode === 'fastest' ? 'text-primary' : ''}`}>Najszybsza</span>
            </button>
            
            <button
              onClick={() => setRouteMode('simplest')}
              className={`flex items-center justify-center gap-2 p-3.5 rounded-xl border-2 transition-all ${
                selectedRouteMode === 'simplest' 
                  ? 'bg-green-500/10 border-green-500 shadow-sm' 
                  : 'bg-muted/30 border-transparent hover:border-muted-foreground/30'
              }`}
            >
              <GitBranch className={`h-5 w-5 ${selectedRouteMode === 'simplest' ? 'text-green-600' : 'text-muted-foreground'}`} />
              <span className={`font-semibold ${selectedRouteMode === 'simplest' ? 'text-green-600' : ''}`}>Najprostsza</span>
            </button>
          </div>
        </div>
      )}

      {/* Route Info - Premium Cards */}
      {route && (
        <div className="space-y-4 pt-3 border-t">
          {/* Trip Mode Selector */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground uppercase tracking-wide">Tryb podróży</Label>
            <TripModeSelector 
              selected={tripMode} 
              onChange={handleTripModeChange}
              disabled={isLoading || navigation.isNavigating}
            />
          </div>
          
          {/* Distance/Duration cards */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-4 bg-gradient-to-br from-muted/50 to-muted/30 rounded-xl text-center">
              <span className="text-xs text-muted-foreground uppercase tracking-wide">Odległość</span>
              <p className="font-bold text-2xl mt-1">{route.distance.toFixed(1)}</p>
              <span className="text-sm text-muted-foreground">km</span>
            </div>
            <div className="p-4 bg-gradient-to-br from-muted/50 to-muted/30 rounded-xl text-center">
              <span className="text-xs text-muted-foreground uppercase tracking-wide">Czas</span>
              <p className="font-bold text-2xl mt-1">{Math.round(route.duration)}</p>
              <span className="text-sm text-muted-foreground">min</span>
            </div>
          </div>
        </div>
      )}

      {/* RidoAI Risk Assessment */}
      {route && riskAssessment && riskAssessment.riskLevel !== 'low' && !navigation.isNavigating && (
        <div className={`p-4 rounded-xl border-2 space-y-3 ${
          riskAssessment.riskLevel === 'high' 
            ? 'bg-gradient-to-br from-red-500/10 to-orange-500/10 border-red-500/30' 
            : 'bg-gradient-to-br from-amber-500/10 to-yellow-500/10 border-amber-500/30'
        }`}>
          <div className="flex items-center gap-2">
            <AlertTriangle className={`h-5 w-5 ${
              riskAssessment.riskLevel === 'high' ? 'text-red-600' : 'text-amber-600'
            }`} />
            <span className={`font-bold ${
              riskAssessment.riskLevel === 'high' ? 'text-red-700' : 'text-amber-700'
            }`}>
              Ryzyko: {riskAssessment.riskLevel === 'medium' ? 'Średnie' : 'Wysokie'}
            </span>
          </div>
          
          {riskAssessment.messages.slice(0, 2).map((msg, idx) => (
            <p key={idx} className="text-sm text-foreground/80">{msg}</p>
          ))}
          
          {ridoAiAlternative && onUseRidoAiAlternative && (
            <Button 
              className="w-full gap-2 bg-amber-600 hover:bg-amber-700 text-white h-12 font-bold"
              onClick={onUseRidoAiAlternative}
            >
              <Route className="h-5 w-5" />
              Obejdź ryzyko (FREE)
            </Button>
          )}
        </div>
      )}

      {/* Navigate Button - BIGGEST CTA */}
      {canNavigate && (
        <Button 
          className="w-full gap-3 bg-green-600 hover:bg-green-700 text-white h-14 text-lg font-bold shadow-lg"
          onClick={handleStartNavigation}
        >
          <Navigation className="h-6 w-6" />
          Prowadź do celu
        </Button>
      )}

      {/* AI Analysis (condensed for mobile) */}
      {route && !navigation.isNavigating && aiAnalysis && !riskAssessment && (
        <div className="pt-3 border-t space-y-3">
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
            <div className="p-4 bg-gradient-to-br from-primary/5 to-primary/10 rounded-xl border border-primary/20 space-y-2">
              {aiAnalysis.messages.slice(0, 2).map((message, idx) => (
                <div key={idx} className="flex items-start gap-2">
                  <ChevronRight className="h-3 w-3 text-primary mt-1 flex-shrink-0" />
                  <p className="text-sm text-foreground/80">{message}</p>
                </div>
              ))}
              
              <div className="flex items-center justify-between pt-2 border-t border-primary/10">
                <span className="text-xs text-muted-foreground">Ryzyko:</span>
                <Badge 
                  variant="outline" 
                  className={`text-xs font-medium ${
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
              className="w-full gap-2 border-primary/30 text-primary h-10" 
              onClick={calculateAlternative} 
              disabled={isLoading}
            >
              <Route className="h-4 w-4" />
              Sprawdź alternatywę
            </Button>
          )}
          
          {alternativeRoute && (
            <div className="p-4 bg-amber-500/10 rounded-xl border border-amber-500/20">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Route className="h-4 w-4 text-amber-600" />
                  <span className="text-sm font-semibold text-amber-600">Alternatywa FREE</span>
                </div>
                <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={toggleAlternative}>
                  {showAlternative ? 'Ukryj' : 'Pokaż'}
                </Button>
              </div>
              <div className="flex gap-4 text-sm">
                <span><span className="text-muted-foreground">Dystans:</span> <strong>{alternativeRoute.distance.toFixed(1)} km</strong></span>
                <span><span className="text-muted-foreground">Czas:</span> <strong>{Math.round(alternativeRoute.duration)} min</strong></span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default MobileRouteForm;
