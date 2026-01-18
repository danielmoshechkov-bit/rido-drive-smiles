// GetRido Maps - Floating Action Buttons for Mobile
import { Locate, Layers, Truck } from 'lucide-react';
import { GpsState } from './useUserLocation';
import { NavigationState } from './useNavigation';
import { useUserRole } from '@/hooks/useUserRole';

interface MapsFABsProps {
  gps: GpsState;
  navigation: NavigationState;
}

const MapsFABs = ({ gps, navigation }: MapsFABsProps) => {
  const { roles } = useUserRole();
  
  // Check if user has fleet access (driver, fleet manager, or admin)
  const hasFleetAccess = roles.includes('admin') || 
                         roles.includes('fleet_rental') || 
                         roles.includes('fleet_settlement') ||
                         roles.includes('driver');

  const handleCenterOnMe = () => {
    if (gps.hasConsent && gps.location) {
      gps.centerOnUser();
    }
  };

  // Don't show FABs during active navigation (use nav bar instead)
  if (navigation.isNavigating) {
    return null;
  }

  return (
    <div 
      className="absolute right-4 z-30 flex flex-col gap-3"
      style={{ 
        bottom: 'calc(7rem + env(safe-area-inset-bottom))',
      }}
    >
      {/* Center on me */}
      <button
        onClick={handleCenterOnMe}
        disabled={!gps.hasConsent || !gps.location}
        className="h-12 w-12 rounded-full bg-card shadow-lg border 
                   flex items-center justify-center
                   disabled:opacity-50 active:scale-95 transition-transform"
        aria-label="Centruj na mnie"
      >
        <Locate className="h-5 w-5 text-primary" />
      </button>
      
      {/* Layers (placeholder for future) */}
      <button
        className="h-12 w-12 rounded-full bg-card shadow-lg border 
                   flex items-center justify-center
                   active:scale-95 transition-transform opacity-50"
        aria-label="Warstwy"
        disabled
      >
        <Layers className="h-5 w-5" />
      </button>
      
      {/* Fleet Live (only if driver/fleet/admin) */}
      {hasFleetAccess && (
        <button
          className="h-12 w-12 rounded-full bg-card shadow-lg border 
                     flex items-center justify-center
                     active:scale-95 transition-transform opacity-50"
          aria-label="Fleet Live"
          disabled
        >
          <Truck className="h-5 w-5" />
        </button>
      )}
    </div>
  );
};

export default MapsFABs;
