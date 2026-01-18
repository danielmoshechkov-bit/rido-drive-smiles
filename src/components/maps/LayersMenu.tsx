/**
 * GetRido Maps - Layers Menu
 * Quick access to map layers and theme toggle
 */
import { useState } from 'react';
import { 
  Layers, 
  Sun, 
  Moon, 
  Construction, 
  Eye, 
  EyeOff,
  Fuel,
  ParkingCircle,
  Zap,
  X
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { 
  Popover, 
  PopoverContent, 
  PopoverTrigger 
} from '@/components/ui/popover';
import { RidoMapTheme, saveTheme } from './ridoMapTheme';

interface LayersMenuProps {
  currentTheme: RidoMapTheme;
  onThemeChange: (theme: RidoMapTheme) => void;
  showIncidents: boolean;
  onToggleIncidents: (show: boolean) => void;
  // POI layer toggles (future)
  poiLayers?: {
    fuel: boolean;
    parking: boolean;
    evCharger: boolean;
  };
  onTogglePOILayer?: (layer: 'fuel' | 'parking' | 'evCharger', show: boolean) => void;
}

const LayersMenu = ({ 
  currentTheme, 
  onThemeChange, 
  showIncidents, 
  onToggleIncidents,
  poiLayers,
  onTogglePOILayer,
}: LayersMenuProps) => {
  const [open, setOpen] = useState(false);

  const handleThemeToggle = () => {
    const newTheme: RidoMapTheme = currentTheme === 'light' ? 'dark' : 'light';
    saveTheme(newTheme);
    onThemeChange(newTheme);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="rido-fab h-12 w-12 rounded-full flex items-center justify-center"
          aria-label="Warstwy mapy"
        >
          <Layers className="h-5 w-5 text-primary" />
        </button>
      </PopoverTrigger>
      <PopoverContent side="left" align="end" className="w-64 p-0">
        <div className="p-3 border-b bg-muted/30">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-sm">Warstwy mapy</span>
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-7 w-7"
              onClick={() => setOpen(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="p-3 space-y-4">
          {/* Theme toggle */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {currentTheme === 'light' ? (
                <Sun className="h-4 w-4 text-amber-500" />
              ) : (
                <Moon className="h-4 w-4 text-blue-400" />
              )}
              <Label htmlFor="theme-toggle" className="text-sm font-medium">
                {currentTheme === 'light' ? 'Tryb jasny' : 'Tryb ciemny'}
              </Label>
            </div>
            <Switch
              id="theme-toggle"
              checked={currentTheme === 'dark'}
              onCheckedChange={handleThemeToggle}
            />
          </div>

          <div className="h-px bg-border" />

          {/* Incidents layer */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Construction className="h-4 w-4 text-amber-500" />
              <Label htmlFor="incidents-toggle" className="text-sm font-medium">
                Zdarzenia
              </Label>
            </div>
            <Switch
              id="incidents-toggle"
              checked={showIncidents}
              onCheckedChange={onToggleIncidents}
            />
          </div>

          {/* POI layers (if available) */}
          {poiLayers && onTogglePOILayer && (
            <>
              <div className="h-px bg-border" />
              
              <div className="space-y-3">
                <Label className="text-xs text-muted-foreground uppercase tracking-wide">
                  Punkty POI
                </Label>
                
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Fuel className="h-4 w-4 text-orange-500" />
                    <span className="text-sm">Stacje paliw</span>
                  </div>
                  <Switch
                    checked={poiLayers.fuel}
                    onCheckedChange={(v) => onTogglePOILayer('fuel', v)}
                  />
                </div>
                
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ParkingCircle className="h-4 w-4 text-blue-500" />
                    <span className="text-sm">Parkingi</span>
                  </div>
                  <Switch
                    checked={poiLayers.parking}
                    onCheckedChange={(v) => onTogglePOILayer('parking', v)}
                  />
                </div>
                
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Zap className="h-4 w-4 text-green-500" />
                    <span className="text-sm">Ładowarki EV</span>
                  </div>
                  <Switch
                    checked={poiLayers.evCharger}
                    onCheckedChange={(v) => onTogglePOILayer('evCharger', v)}
                  />
                </div>
              </div>
            </>
          )}

          {/* Info */}
          <div className="pt-2">
            <Badge variant="secondary" className="text-[10px] w-full justify-center">
              GetRido Maps Premium
            </Badge>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default LayersMenu;
