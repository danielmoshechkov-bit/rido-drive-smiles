// GetRido Maps - Route Alternatives Time Badges (Google Maps Style)
import { RouteOption } from './routingService';

interface RouteTimeBadgeProps {
  route: RouteOption;
  isSelected: boolean;
  isFastest?: boolean;
  onClick: () => void;
  // Position on map (calculated from route midpoint)
  position?: { x: number; y: number };
}

// Individual route time badge that appears on the map
export const RouteTimeBadge = ({
  route,
  isSelected,
  isFastest = false,
  onClick,
}: RouteTimeBadgeProps) => {
  const duration = Math.round(route.duration);
  
  return (
    <button
      onClick={onClick}
      className={`
        flex items-center gap-1.5 px-3 py-1.5 rounded-full font-bold text-sm
        transition-all duration-200 shadow-lg
        ${isSelected 
          ? 'bg-primary text-white scale-110 shadow-primary/30' 
          : 'bg-white text-foreground hover:bg-primary/10 hover:scale-105'
        }
        ${!isSelected && 'border border-border/50'}
      `}
      style={{
        boxShadow: isSelected 
          ? '0 4px 20px -4px hsl(259 65% 58% / 0.4)' 
          : '0 2px 8px -2px rgb(0 0 0 / 0.15)',
      }}
    >
      <span className="text-base">{duration}</span>
      <span className="text-xs opacity-75">min</span>
      {isFastest && !isSelected && (
        <span className="text-[10px] text-emerald-600 font-medium">⚡</span>
      )}
    </button>
  );
};

// Route alternatives list for bottom sheet
interface RouteAlternativesListProps {
  routes: RouteOption[];
  selectedId: string | null;
  onSelect: (route: RouteOption) => void;
}

export const RouteAlternativesList = ({
  routes,
  selectedId,
  onSelect,
}: RouteAlternativesListProps) => {
  if (routes.length === 0) return null;

  // Find fastest route
  const fastestRoute = routes.reduce((a, b) => a.duration < b.duration ? a : b);
  
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground px-1">Dostępne trasy</p>
      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
        {routes.map((route, idx) => {
          const isSelected = route.id === selectedId;
          const isFastest = route.id === fastestRoute.id;
          const duration = Math.round(route.duration);
          
          return (
            <button
              key={route.id}
              onClick={() => onSelect(route)}
              className={`
                flex-shrink-0 flex flex-col items-center px-4 py-2.5 rounded-xl
                transition-all duration-200
                ${isSelected 
                  ? 'bg-primary text-white shadow-lg shadow-primary/20' 
                  : 'bg-muted/70 hover:bg-muted'
                }
              `}
            >
              <span className="font-bold text-lg">{duration}</span>
              <span className="text-xs opacity-75">min</span>
              <span className="text-[10px] mt-1 opacity-60">{route.distance.toFixed(1)} km</span>
              {isFastest && (
                <span className={`text-[10px] mt-0.5 font-medium ${isSelected ? 'text-amber-300' : 'text-emerald-600'}`}>
                  Najszybsza
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default RouteTimeBadge;
