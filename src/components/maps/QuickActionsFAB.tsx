// GetRido Maps - Quick Actions FAB (Right Side)
import { useState } from 'react';
import { 
  Compass, 
  Navigation, 
  Search, 
  VolumeX, 
  Volume2,
  Layers,
  AlertTriangle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { FollowMode } from './useMapCameraController';

interface QuickActionsFABProps {
  followMode: FollowMode;
  onCycleFollowMode: () => void;
  isMapRotated: boolean;
  onResetBearing: () => void;
  isMuted: boolean;
  onToggleMute: () => void;
  onOpenSearch?: () => void;
  onReportIncident?: () => void;
  isNavigating?: boolean;
}

const QuickActionsFAB = ({
  followMode,
  onCycleFollowMode,
  isMapRotated,
  onResetBearing,
  isMuted,
  onToggleMute,
  onOpenSearch,
  onReportIncident,
  isNavigating = false,
}: QuickActionsFABProps) => {
  // Determine follow mode icon
  const getFollowIcon = () => {
    switch (followMode) {
      case 'center':
        return <Navigation className="h-5 w-5" />;
      case 'heading':
        return <Compass className="h-5 w-5 text-primary" />;
      default:
        return <Navigation className="h-5 w-5 text-muted-foreground" />;
    }
  };

  return (
    <div 
      className="absolute right-3 z-20 flex flex-col gap-2"
      style={{ 
        bottom: isNavigating ? '120px' : '180px',
        transition: 'bottom 0.3s ease',
      }}
    >
      {/* Compass (only when rotated) */}
      {isMapRotated && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              className="h-11 w-11 rounded-full rido-fab"
              onClick={onResetBearing}
            >
              <Compass 
                className="h-5 w-5 text-primary transition-transform"
                style={{ 
                  transform: `rotate(${-45}deg)`,
                }}
              />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="left">Północ na górze</TooltipContent>
        </Tooltip>
      )}

      {/* Follow Mode */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="outline"
            size="icon"
            className={`h-11 w-11 rounded-full rido-fab ${followMode !== 'off' ? 'border-primary/50 bg-primary/5' : ''}`}
            onClick={onCycleFollowMode}
          >
            {getFollowIcon()}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="left">
          {followMode === 'off' && 'Włącz śledzenie'}
          {followMode === 'center' && 'Włącz obrót mapy'}
          {followMode === 'heading' && 'Wyłącz śledzenie'}
        </TooltipContent>
      </Tooltip>

      {/* Search in route */}
      {onOpenSearch && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              className="h-11 w-11 rounded-full rido-fab"
              onClick={onOpenSearch}
            >
              <Search className="h-5 w-5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="left">Szukaj w trasie</TooltipContent>
        </Tooltip>
      )}

      {/* Sound toggle */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="outline"
            size="icon"
            className={`h-11 w-11 rounded-full rido-fab ${isMuted ? 'text-muted-foreground' : ''}`}
            onClick={onToggleMute}
          >
            {isMuted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="left">{isMuted ? 'Włącz dźwięk' : 'Wycisz'}</TooltipContent>
      </Tooltip>

      {/* Report incident (during navigation) */}
      {isNavigating && onReportIncident && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              className="h-11 w-11 rounded-full rido-fab"
              onClick={onReportIncident}
            >
              <AlertTriangle className="h-5 w-5 text-amber-500" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="left">Zgłoś zdarzenie</TooltipContent>
        </Tooltip>
      )}
    </div>
  );
};

export default QuickActionsFAB;
