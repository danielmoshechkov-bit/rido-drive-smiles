// GetRido Maps - Navigation Bottom Bar (Stats + Exit)
import { Clock, Route, Zap, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { NavigationState } from './useNavigation';

interface NavigationBottomBarProps {
  navigation: NavigationState;
  onStop: () => void;
  onShowAlternatives?: () => void;
}

const NavigationBottomBar = ({
  navigation,
  onStop,
  onShowAlternatives,
}: NavigationBottomBarProps) => {
  const { remainingDistance, remainingDuration, eta } = navigation;

  const formatEta = (date: Date | null): string => {
    if (!date) return '--:--';
    return date.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
  };

  const formatDuration = (minutes: number): string => {
    if (minutes < 60) {
      return `${Math.round(minutes)} min`;
    }
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    return `${hours} h ${mins} min`;
  };

  return (
    <div 
      className="absolute bottom-0 left-0 right-0 z-30 safe-area-bottom"
      style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 8px)' }}
    >
      <div className="mx-3 mb-3 rounded-2xl bg-card border shadow-xl overflow-hidden">
        <div className="flex items-center justify-between p-3">
          {/* Stats */}
          <div className="flex items-center gap-4">
            {/* Duration */}
            <div className="flex items-center gap-2">
              <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center">
                <Clock className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="font-bold text-lg leading-tight">{formatDuration(remainingDuration)}</p>
                <p className="text-xs text-muted-foreground">pozostało</p>
              </div>
            </div>
            
            {/* Distance */}
            <div className="flex items-center gap-2">
              <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center">
                <Route className="h-4 w-4 text-muted-foreground" />
              </div>
              <div>
                <p className="font-bold text-lg leading-tight">{remainingDistance.toFixed(1)} km</p>
                <p className="text-xs text-muted-foreground">dystans</p>
              </div>
            </div>
          </div>
          
          {/* ETA + Actions */}
          <div className="flex items-center gap-2">
            {/* ETA Badge */}
            <div 
              className="px-3 py-1.5 rounded-full text-white font-bold"
              style={{
                background: 'linear-gradient(135deg, hsl(142 71% 45%), hsl(142 76% 36%))',
              }}
            >
              {formatEta(eta)}
            </div>
            
            {/* Alternatives button */}
            {onShowAlternatives && (
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-9 w-9"
                onClick={onShowAlternatives}
              >
                <Zap className="h-4 w-4" />
              </Button>
            )}
            
            {/* Stop button */}
            <Button 
              variant="destructive" 
              size="icon" 
              className="h-9 w-9 rounded-full"
              onClick={onStop}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default NavigationBottomBar;
