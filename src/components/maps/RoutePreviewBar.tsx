// GetRido Maps - Route Preview Bar (Google Maps style bottom bar)
// Shows route summary with Start button while map stays visible

import { Navigation, Clock, MapPin, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { RouteResult } from './routingService';

interface RoutePreviewBarProps {
  route: RouteResult | null;
  destination: string;
  onStartNavigation: () => void;
  onExpand: () => void;
  isLoading?: boolean;
}

const RoutePreviewBar = ({ 
  route, 
  destination,
  onStartNavigation, 
  onExpand,
  isLoading = false,
}: RoutePreviewBarProps) => {
  if (!route && !isLoading) return null;

  return (
    <div 
      className="absolute bottom-0 left-0 right-0 z-40"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="mx-3 mb-3 rounded-2xl overflow-hidden shadow-2xl bg-card/98 backdrop-blur-xl border border-border/50">
        {isLoading ? (
          <div className="p-4 flex items-center justify-center gap-3">
            <div className="h-5 w-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <span className="text-sm text-muted-foreground">Wyznaczam trasę...</span>
          </div>
        ) : route ? (
          <>
            {/* Main route info */}
            <div 
              className="p-4 flex items-center gap-4 cursor-pointer active:bg-muted/50 transition-colors"
              onClick={onExpand}
            >
              {/* Route stats */}
              <div className="flex items-center gap-4 flex-1">
                {/* Duration */}
                <div className="flex items-center gap-2">
                  <Clock className="h-5 w-5 text-muted-foreground" />
                  <span className="text-2xl font-bold">{Math.round(route.duration)}</span>
                  <span className="text-sm text-muted-foreground">min</span>
                </div>
                
                {/* Separator */}
                <div className="w-px h-8 bg-border" />
                
                {/* Distance */}
                <div className="flex items-center gap-1.5">
                  <span className="text-lg font-semibold">{route.distance.toFixed(1)}</span>
                  <span className="text-sm text-muted-foreground">km</span>
                </div>
              </div>

              {/* Expand indicator */}
              <ChevronUp className="h-5 w-5 text-muted-foreground" />
            </div>

            {/* Destination & Start button */}
            <div className="px-4 pb-4 flex items-center gap-3">
              {/* Destination chip */}
              <div className="flex-1 flex items-center gap-2 bg-muted/50 rounded-full px-3 py-2 min-w-0">
                <MapPin className="h-4 w-4 text-primary shrink-0" />
                <span className="text-sm truncate">{destination || 'Cel'}</span>
              </div>

              {/* Start button - Google Maps style */}
              <Button
                onClick={(e) => {
                  e.stopPropagation();
                  onStartNavigation();
                }}
                className="h-12 px-6 rounded-full bg-[#1a73e8] hover:bg-[#1557b0] text-white font-semibold shadow-lg gap-2"
              >
                <Navigation className="h-5 w-5" />
                Start
              </Button>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
};

export default RoutePreviewBar;