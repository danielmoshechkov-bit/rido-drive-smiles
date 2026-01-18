import { Map, Plus, Minus, Navigation, Layers, Car } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

const MapsContainer = () => {
  return (
    <div className="relative flex-1 h-full bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-900 overflow-hidden">
      {/* Grid pattern simulating map */}
      <div 
        className="absolute inset-0 opacity-30 dark:opacity-20"
        style={{
          backgroundImage: `
            linear-gradient(hsl(var(--primary) / 0.15) 1px, transparent 1px),
            linear-gradient(90deg, hsl(var(--primary) / 0.15) 1px, transparent 1px)
          `,
          backgroundSize: '60px 60px'
        }}
      />
      
      {/* Decorative roads */}
      <div className="absolute inset-0 overflow-hidden">
        <div 
          className="absolute top-1/4 left-0 right-0 h-3 bg-slate-300/50 dark:bg-slate-600/30"
          style={{ transform: 'rotate(-5deg) translateY(-50%)' }}
        />
        <div 
          className="absolute top-0 bottom-0 left-1/3 w-3 bg-slate-300/50 dark:bg-slate-600/30"
          style={{ transform: 'rotate(3deg)' }}
        />
        <div 
          className="absolute top-2/3 left-0 right-0 h-2 bg-slate-300/40 dark:bg-slate-600/25"
          style={{ transform: 'rotate(2deg)' }}
        />
        <div 
          className="absolute top-0 bottom-0 right-1/4 w-2 bg-slate-300/40 dark:bg-slate-600/25"
          style={{ transform: 'rotate(-2deg)' }}
        />
      </div>

      {/* Central info overlay */}
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="text-center p-8 bg-background/90 backdrop-blur-sm rounded-2xl shadow-lg max-w-md border">
          <div className="relative inline-block mb-4">
            <Map className="h-16 w-16 text-primary/40" />
            <div className="absolute -bottom-1 -right-1 h-6 w-6 bg-amber-500 rounded-full flex items-center justify-center">
              <span className="text-xs font-bold text-white">?</span>
            </div>
          </div>
          <h2 className="text-xl font-bold text-foreground">Mapa – tryb testowy</h2>
          <p className="text-muted-foreground mt-2 text-sm">
            Google Maps API zostanie podpięte w kolejnym etapie
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Badge variant="outline">Nawigacja</Badge>
            <Badge variant="outline">Ruch drogowy</Badge>
            <Badge variant="outline">Zdarzenia</Badge>
          </div>
        </div>
      </div>
      
      {/* Map controls (fake) */}
      <div className="absolute top-4 right-4 flex flex-col gap-1">
        <Button 
          variant="secondary" 
          size="icon" 
          disabled 
          className="h-9 w-9 bg-background/90 backdrop-blur-sm shadow-md"
        >
          <Plus className="h-4 w-4" />
        </Button>
        <Button 
          variant="secondary" 
          size="icon" 
          disabled 
          className="h-9 w-9 bg-background/90 backdrop-blur-sm shadow-md"
        >
          <Minus className="h-4 w-4" />
        </Button>
        <div className="h-2" />
        <Button 
          variant="secondary" 
          size="icon" 
          disabled 
          className="h-9 w-9 bg-background/90 backdrop-blur-sm shadow-md"
        >
          <Navigation className="h-4 w-4" />
        </Button>
      </div>
      
      {/* Layer indicators (fake) */}
      <div className="absolute bottom-4 left-4 flex gap-2">
        <Badge 
          variant="secondary" 
          className="gap-1.5 bg-background/90 backdrop-blur-sm shadow-sm"
        >
          <Layers className="h-3 w-3" />
          Warstwy
        </Badge>
        <Badge 
          variant="secondary" 
          className="gap-1.5 bg-background/90 backdrop-blur-sm shadow-sm"
        >
          <Car className="h-3 w-3" />
          Ruch
        </Badge>
      </div>

      {/* Scale indicator (fake) */}
      <div className="absolute bottom-4 right-4 flex items-center gap-2 bg-background/90 backdrop-blur-sm rounded px-2 py-1 shadow-sm">
        <div className="w-16 h-1 bg-foreground/60 rounded" />
        <span className="text-xs text-muted-foreground">1 km</span>
      </div>
    </div>
  );
};

export default MapsContainer;
