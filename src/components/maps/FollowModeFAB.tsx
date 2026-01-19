// GetRido Maps - Follow Mode FAB with Compass (Premium RIDO styling)
// v2: Added persistent Resume button during navigation when follow is off
import { Navigation2, Compass, X, LocateFixed, MapPin } from 'lucide-react';
import { FollowMode } from './useMapCameraController';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { RIDO_THEME_COLORS } from './ridoMapTheme';

interface FollowModeFABProps {
  followMode: FollowMode;
  isMapRotated: boolean;
  showPill: boolean;
  onCycleFollowMode: () => void;
  onResetBearing: () => void;
  onRestoreFollowMode: () => void;
  onDismissPill: () => void;
  isNavigating: boolean;
}

const FollowModeFAB = ({
  followMode,
  isMapRotated,
  showPill,
  onCycleFollowMode,
  onResetBearing,
  onRestoreFollowMode,
  onDismissPill,
  isNavigating,
}: FollowModeFABProps) => {
  // Get icon and label based on follow mode
  const getFollowModeIcon = () => {
    switch (followMode) {
      case 'off':
        return <LocateFixed className="h-5 w-5" />;
      case 'center':
        return <Navigation2 className="h-5 w-5" />;
      case 'heading':
        return <Navigation2 className="h-5 w-5 animate-pulse" />;
    }
  };

  const getFollowModeLabel = () => {
    switch (followMode) {
      case 'off':
        return 'Śledzenie wyłączone';
      case 'center':
        return 'Śledzenie (północ)';
      case 'heading':
        return 'Śledzenie (kierunek)';
    }
  };

  const getFollowModeStyle = () => {
    switch (followMode) {
      case 'off':
        return 'bg-background/95 text-muted-foreground border-border';
      case 'center':
        return 'bg-primary/10 text-primary border-primary/30';
      case 'heading':
        return 'bg-primary text-primary-foreground border-primary';
    }
  };

  return (
    <TooltipProvider>
      <div className="flex flex-col items-end gap-2">
        {/* ═══════════════════════════════════════════════════════════════
            PERSISTENT RESUME BUTTON - Always visible when follow=off during navigation
            ═══════════════════════════════════════════════════════════════ */}
        {isNavigating && followMode === 'off' && (
          <Button
            onClick={onRestoreFollowMode}
            className="gap-2 bg-primary shadow-lg hover:bg-primary/90 animate-fade-in"
            size="sm"
          >
            <MapPin className="h-4 w-4" />
            Wznów śledzenie
          </Button>
        )}
        
        {/* Compass button - only show when map is rotated */}
        {isMapRotated && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={onResetBearing}
                className="rido-fab h-10 w-10 rounded-full flex items-center justify-center animate-fade-in"
                aria-label="Północ na górze"
              >
                <Compass className="h-5 w-5 text-primary" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="left">
              <p>Północ na górze</p>
            </TooltipContent>
          </Tooltip>
        )}

        {/* Follow Mode button */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={onCycleFollowMode}
              className={`rido-fab h-12 w-12 rounded-full flex items-center justify-center border-2 transition-all duration-200 ${getFollowModeStyle()}`}
              aria-label={getFollowModeLabel()}
            >
              {getFollowModeIcon()}
            </button>
          </TooltipTrigger>
          <TooltipContent side="left">
            <p>{getFollowModeLabel()}</p>
          </TooltipContent>
        </Tooltip>

        {/* "Follow disabled" pill - shows when user manually moved map (NOT during navigation - use Resume button instead) */}
        {showPill && !isNavigating && (
          <div 
            className="animate-fade-in flex items-center gap-2 px-3 py-2 rounded-full shadow-lg border"
            style={{
              background: `linear-gradient(135deg, ${RIDO_THEME_COLORS.violetSoft}15, ${RIDO_THEME_COLORS.violetPrimary}10)`,
              borderColor: `${RIDO_THEME_COLORS.violetPrimary}30`,
            }}
          >
            <span className="text-xs font-medium text-foreground">Śledzenie wyłączone</span>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-xs text-primary hover:text-primary"
              onClick={onRestoreFollowMode}
            >
              Włącz
            </Button>
            <button
              onClick={onDismissPill}
              className="h-5 w-5 rounded-full flex items-center justify-center hover:bg-muted/50"
            >
              <X className="h-3 w-3 text-muted-foreground" />
            </button>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
};

export default FollowModeFAB;