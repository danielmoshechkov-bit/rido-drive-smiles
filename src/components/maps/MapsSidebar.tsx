import { Map, Sparkles, AlertTriangle, Loader2, Navigation, X } from 'lucide-react';
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
    clearRoute: () => void;
  };
}

const MapsSidebar = ({ routing }: MapsSidebarProps) => {
  const {
    startInput,
    endInput,
    route,
    isLoading,
    error,
    setStartInput,
    setEndInput,
    calculateRoute,
    clearRoute,
  } = routing;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !isLoading) {
      calculateRoute();
    }
  };

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
              Analiza AI zostanie wyświetlona tutaj
            </p>
          </div>
        )}
      </div>

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
