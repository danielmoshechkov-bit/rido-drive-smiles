import { Map, Sparkles, AlertTriangle, Loader2, Navigation, X, Route, Brain, ChevronRight, Clock, TrendingUp } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { RoutingState } from './useRouting';

interface MapsSidebarProps {
  routing: RoutingState & {
    setStartInput: (value: string) => void;
    setEndInput: (value: string) => void;
    calculateRoute: () => void;
    calculateAlternative: () => void;
    toggleAlternative: () => void;
    clearRoute: () => void;
  };
}

const MapsSidebar = ({ routing }: MapsSidebarProps) => {
  const {
    startInput,
    endInput,
    route,
    alternativeRoute,
    showAlternative,
    isLoading,
    error,
    aiAnalysis,
    isAnalyzing,
    setStartInput,
    setEndInput,
    calculateRoute,
    calculateAlternative,
    toggleAlternative,
    clearRoute,
  } = routing;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !isLoading) {
      calculateRoute();
    }
  };

  // Calculate time difference for alternative route
  const timeDifference = alternativeRoute && route 
    ? Math.round(alternativeRoute.duration - route.duration)
    : 0;

  return (
    <div className="w-80 flex-shrink-0 bg-card border-r flex flex-col h-full overflow-y-auto">
      {/* Header */}
      <div className="p-4 border-b">
        <div className="flex items-center gap-2">
          <Map className="h-6 w-6 text-primary" />
          <span className="font-bold text-lg">GetRido Maps</span>
        </div>
        <Badge variant="secondary" className="mt-2">Tryb STANDARD</Badge>
      </div>

      {/* Route Search */}
      <div className="p-4 space-y-3">
        <Label className="text-xs text-muted-foreground uppercase tracking-wide">
          Planowanie trasy
        </Label>
        
        <div className="relative">
          <div className="absolute left-3 top-1/2 -translate-y-1/2 h-2.5 w-2.5 rounded-full bg-green-500 ring-2 ring-green-500/20" />
          <Input 
            placeholder="Skąd? (adres lub współrzędne)" 
            className="pl-9 bg-background" 
            value={startInput}
            onChange={(e) => setStartInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isLoading}
          />
        </div>
        
        {/* Connecting line */}
        <div className="ml-[18px] h-3 border-l-2 border-dashed border-muted-foreground/30" />
        
        <div className="relative">
          <div className="absolute left-3 top-1/2 -translate-y-1/2 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-red-500/20" />
          <Input 
            placeholder="Dokąd? (adres lub współrzędne)" 
            className="pl-9 bg-background" 
            value={endInput}
            onChange={(e) => setEndInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isLoading}
          />
        </div>

        {error && (
          <p className="text-xs text-destructive">{error}</p>
        )}
        
        <div className="flex gap-2">
          <Button 
            className="flex-1 gap-2" 
            onClick={calculateRoute}
            disabled={isLoading || !startInput.trim() || !endInput.trim()}
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Navigation className="h-4 w-4" />
            )}
            {isLoading ? 'Wyznaczanie...' : 'Wyznacz trasę'}
          </Button>
          
          {route && (
            <Button variant="outline" size="icon" onClick={clearRoute}>
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Route Mode */}
      <div className="p-4 border-t space-y-3">
        <Label className="text-xs text-muted-foreground uppercase tracking-wide">
          Tryb trasy
        </Label>
        
        <RadioGroup defaultValue="standard" className="space-y-2">
          <div className="flex items-center space-x-3 p-2 rounded-lg bg-primary/5 border border-primary/20">
            <RadioGroupItem value="standard" id="standard" />
            <Label htmlFor="standard" className="cursor-pointer flex-1">Standardowa</Label>
            <Badge variant="outline" className="text-xs bg-green-500/10 text-green-600 border-green-500/30">
              FREE
            </Badge>
          </div>
          <div className="flex items-center space-x-3 p-2 rounded-lg bg-muted/50 opacity-60">
            <RadioGroupItem value="ai" id="ai" disabled />
            <Label htmlFor="ai" className="cursor-pointer flex-1">RidoAI (PRO)</Label>
            <Badge variant="outline" className="text-xs">Wkrótce</Badge>
          </div>
        </RadioGroup>
      </div>

      {/* Route Info */}
      <div className="p-4 border-t bg-muted/30">
        <Label className="text-xs text-muted-foreground uppercase tracking-wide">
          Informacje o trasie
        </Label>
        
        <div className="grid grid-cols-2 gap-3 mt-3">
          <div className="p-3 bg-background rounded-lg border">
            <span className="text-xs text-muted-foreground">Odległość</span>
            <p className="font-semibold text-lg">
              {route ? `${route.distance.toFixed(1)} km` : '— km'}
            </p>
          </div>
          <div className="p-3 bg-background rounded-lg border">
            <span className="text-xs text-muted-foreground">Czas</span>
            <p className="font-semibold text-lg">
              {route ? `${Math.round(route.duration)} min` : '— min'}
            </p>
          </div>
        </div>
        
        {route ? (
          <div className="mt-3 p-3 bg-blue-500/10 rounded-lg border border-blue-500/20">
            <div className="flex items-center gap-2 mb-1">
              <Navigation className="h-4 w-4 text-blue-600" />
              <span className="text-xs font-medium text-blue-600">Tryb STANDARD</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Trasa bez danych o ruchu drogowym
            </p>
          </div>
        ) : (
          <div className="mt-3 p-3 bg-primary/5 rounded-lg border border-primary/10">
            <div className="flex items-center gap-2 mb-1">
              <Sparkles className="h-4 w-4 text-primary" />
              <span className="text-xs font-medium text-primary">Analiza AI</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Wyznacz trasę, aby zobaczyć analizę AI
            </p>
          </div>
        )}
      </div>

      {/* AI FREE Analysis Section */}
      {route && (
        <div className="p-4 border-t space-y-3">
          <div className="flex items-center gap-2">
            <Brain className="h-4 w-4 text-primary" />
            <Label className="text-xs text-muted-foreground uppercase tracking-wide">
              GetRido AI – analiza FREE
            </Label>
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
              {/* AI Messages */}
              <div className="p-3 bg-gradient-to-br from-primary/5 to-primary/10 rounded-lg border border-primary/20">
                <div className="space-y-2">
                  {aiAnalysis.messages.map((message, idx) => (
                    <div key={idx} className="flex items-start gap-2">
                      <ChevronRight className="h-3 w-3 text-primary mt-0.5 flex-shrink-0" />
                      <p className="text-xs text-foreground/80">{message}</p>
                    </div>
                  ))}
                </div>
                
                {/* Estimated delay */}
                {aiAnalysis.estimatedDelay && aiAnalysis.estimatedDelay > 0 && (
                  <div className="mt-3 pt-2 border-t border-primary/10 flex items-center gap-2">
                    <Clock className="h-3 w-3 text-amber-500" />
                    <span className="text-xs text-amber-600">
                      Szacowane opóźnienie: +{aiAnalysis.estimatedDelay} min
                    </span>
                  </div>
                )}
              </div>
              
              {/* Risk indicator */}
              <div className="flex items-center justify-between p-2 bg-background rounded-lg border">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-3 w-3 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Poziom ryzyka:</span>
                </div>
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
              
              {/* Alternative route suggestion */}
              {aiAnalysis.suggestAlternative && !alternativeRoute && (
                <Button 
                  variant="outline" 
                  className="w-full gap-2 border-primary/30 text-primary hover:bg-primary/5"
                  onClick={calculateAlternative}
                  disabled={isLoading}
                >
                  <Route className="h-4 w-4" />
                  <span>Sprawdź alternatywę (FREE)</span>
                </Button>
              )}
              
              {/* Alternative route info */}
              {alternativeRoute && (
                <div className="p-3 bg-amber-500/10 rounded-lg border border-amber-500/20">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Route className="h-4 w-4 text-amber-600" />
                      <span className="text-xs font-medium text-amber-600">Alternatywa FREE</span>
                    </div>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="h-6 px-2 text-xs"
                      onClick={toggleAlternative}
                    >
                      {showAlternative ? 'Ukryj' : 'Pokaż'}
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-muted-foreground">Dystans:</span>
                      <span className="ml-1 font-medium">{alternativeRoute.distance.toFixed(1)} km</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Czas:</span>
                      <span className="ml-1 font-medium">{Math.round(alternativeRoute.duration)} min</span>
                    </div>
                  </div>
                  {timeDifference !== 0 && (
                    <p className="text-xs text-muted-foreground mt-2">
                      Różnica: {timeDifference > 0 ? '+' : ''}{timeDifference} min względem trasy głównej
                    </p>
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
          <Sparkles className="h-4 w-4" />
          <span className="flex-1 text-left">Zapytaj AI</span>
          <Badge variant="secondary" className="text-xs">Wkrótce</Badge>
        </Button>
        
        <Button variant="outline" className="w-full gap-2 justify-start" disabled>
          <AlertTriangle className="h-4 w-4" />
          <span className="flex-1 text-left">Zgłoś zdarzenie</span>
          <Badge variant="secondary" className="text-xs">Wkrótce</Badge>
        </Button>
      </div>
    </div>
  );
};

export default MapsSidebar;
