// GetRido Maps - Trip Mode Selector
import { Car, PersonStanding, Bike, Bus, Train } from 'lucide-react';
import { cn } from '@/lib/utils';

export type TripMode = 'driving' | 'walking' | 'cycling' | 'transit' | 'rail';

interface TripModeSelectorProps {
  selected: TripMode;
  onChange: (mode: TripMode) => void;
  disabled?: boolean;
  compact?: boolean;
}

const MODES: { id: TripMode; icon: React.ElementType; label: string; available: boolean }[] = [
  { id: 'driving', icon: Car, label: 'Auto', available: true },
  { id: 'walking', icon: PersonStanding, label: 'Pieszo', available: true },
  { id: 'cycling', icon: Bike, label: 'Rower', available: true },
  { id: 'transit', icon: Bus, label: 'Komunikacja', available: false },
  { id: 'rail', icon: Train, label: 'Pociąg', available: false },
];

const TripModeSelector = ({ selected, onChange, disabled = false, compact = false }: TripModeSelectorProps) => {
  return (
    <div className={cn(
      "flex items-center gap-1 p-1 bg-muted/50 rounded-xl",
      compact ? "gap-0.5" : "gap-1"
    )}>
      {MODES.map(mode => {
        const Icon = mode.icon;
        const isSelected = selected === mode.id;
        const isDisabled = disabled || !mode.available;
        
        return (
          <button
            key={mode.id}
            onClick={() => mode.available && onChange(mode.id)}
            disabled={isDisabled}
            className={cn(
              "flex flex-col items-center justify-center transition-all rounded-lg",
              compact ? "p-1.5 min-w-10" : "p-2 min-w-14 gap-1",
              isSelected 
                ? "bg-primary text-primary-foreground shadow-sm" 
                : "hover:bg-muted",
              isDisabled && !isSelected && "opacity-50 cursor-not-allowed"
            )}
            title={!mode.available ? 'Wkrótce dostępne' : mode.label}
          >
            <Icon className={cn(
              "transition-colors",
              compact ? "h-4 w-4" : "h-5 w-5"
            )} />
            {!compact && (
              <span className="text-[10px] font-medium leading-tight">{mode.label}</span>
            )}
          </button>
        );
      })}
    </div>
  );
};

export default TripModeSelector;
