// GetRido Maps - Route Preview Bar (Yandex-style with alternatives info)
import { Navigation, Clock, MapPin, ChevronUp, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { RouteResult } from './routingService';

interface RoutePreviewBarProps {
  route: RouteResult | null;
  destination: string;
  onStartNavigation: () => void;
  onExpand: () => void;
  isLoading?: boolean;
  alternativesCount?: number;
  hasWarnings?: boolean;
}

const RoutePreviewBar = ({ 
  route, 
  destination,
  onStartNavigation, 
  onExpand,
  isLoading = false,
  alternativesCount = 0,
  hasWarnings = false,
}: RoutePreviewBarProps) => {
  if (!route && !isLoading) return null;

  const formatDuration = (minutes: number): string => {
    if (minutes < 60) return `${Math.round(minutes)}`;
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    return `${hours}h ${mins}`;
  };

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
            {/* Main route info - clickable to expand */}
            <button 
              className="w-full p-4 flex items-center gap-4 active:bg-muted/50 transition-colors text-left"
              onClick={onExpand}
            >
              {/* Duration - BIG */}
              <div className="text-center min-w-[80px]">
                <div className="flex items-baseline justify-center gap-1">
                  <span className="text-3xl font-bold">{formatDuration(route.duration)}</span>
                  <span className="text-sm text-muted-foreground">min</span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{route.distance.toFixed(1)} km</p>
              </div>

              {/* Separator */}
              <div className="w-px h-12 bg-border" />

              {/* Destination + warnings */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-primary shrink-0" />
                  <span className="font-medium truncate">{destination || 'Cel'}</span>
                </div>
                
                {/* Meta info */}
                <div className="flex items-center gap-2 mt-1">
                  {hasWarnings && (
                    <div className="flex items-center gap-1 text-amber-600">
                      <AlertTriangle className="h-3 w-3" />
                      <span className="text-xs">Utrudnienia</span>
                    </div>
                  )}
                  {alternativesCount > 0 && (
                    <span className="text-xs text-muted-foreground">
                      +{alternativesCount} tras
                    </span>
                  )}
                </div>
              </div>

              {/* Expand indicator */}
              <ChevronUp className="h-5 w-5 text-muted-foreground shrink-0" />
            </button>

            {/* Start button */}
            <div className="px-4 pb-4">
              <Button
                onClick={(e) => {
                  e.stopPropagation();
                  onStartNavigation();
                }}
                className="w-full h-14 gap-2 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-lg shadow-lg"
              >
                <Navigation className="h-6 w-6" />
                Jedźmy!
              </Button>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
};

export default RoutePreviewBar;
