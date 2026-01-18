// GetRido Maps - Mobile Bottom Sheet (Yandex-style redesign)
import { useState, useEffect } from 'react';
import { Search, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { RoutingState } from './useRouting';
import { GpsState } from './useUserLocation';
import { NavigationState } from './useNavigation';
import { Incident } from './incidentsService';
import { RiskAssessment } from './routeRiskService';
import { AddressSuggestion } from './autocompleteService';
import { CameraController } from './useMapCameraController';
import CategoryGrid, { POICategory, POI_CATEGORIES } from './CategoryGrid';
import SearchSheet from './SearchSheet';
import MapAISheet from './MapAISheet';
import { AISparkleIcon } from './CategoryIcons';

interface MapsBottomSheetProps {
  routing: RoutingState & {
    setStartInput: (value: string) => void;
    setEndInput: (value: string) => void;
    setStartCoords: (coords: { lat: number; lng: number } | null) => void;
    setEndCoords: (coords: { lat: number; lng: number } | null) => void;
    setRouteMode: (mode: 'fastest' | 'simplest') => void;
    calculateRoute: (gpsOverride?: any, endCoordsOverride?: { lat: number; lng: number } | null, endInputOverride?: string) => void;
    calculateAlternative: () => void;
    toggleAlternative: () => void;
    clearRoute: () => void;
  };
  gps: GpsState;
  navigation: NavigationState & {
    startNavigation: () => Promise<void>;
    stopNavigation: () => void;
    toggleFollowMode: () => void;
  };
  cameraController?: CameraController;
  incidents?: Incident[];
  incidentsLoading?: boolean;
  riskAssessment?: RiskAssessment | null;
  ridoAiAlternative?: any;
  onRefreshIncidents?: () => void;
  onUseRidoAiAlternative?: () => void;
  isLandscape?: boolean;
}

const MapsBottomSheet = ({ 
  routing, 
  gps, 
  navigation,
  cameraController,
  incidents = [],
  incidentsLoading = false,
  riskAssessment,
  ridoAiAlternative,
  onRefreshIncidents,
  onUseRidoAiAlternative,
  isLandscape = false,
}: MapsBottomSheetProps) => {
  const [showSearchSheet, setShowSearchSheet] = useState(false);
  const [showAISheet, setShowAISheet] = useState(false);

  const { route, endInput } = routing;

  // Handle location selection - pass coords directly to avoid state timing issues
  const handleLocationSelect = (location: AddressSuggestion) => {
    const coords = { lat: location.lat, lng: location.lng };
    routing.setEndInput(location.shortName);
    routing.setEndCoords(coords);
    routing.setStartInput('');
    routing.setStartCoords(null);
    // Pass coords directly to calculateRoute to avoid React state batching delay
    routing.calculateRoute(null, coords, location.shortName);
  };

  // Handle category selection
  const handleCategorySelect = (category: POICategory) => {
    // For now, search for the category
    routing.setEndInput(category.label);
    // In the future, this would trigger POI search
  };

  // Handle AI action
  const handleAIAction = (action: string) => {
    console.log('AI Action:', action);
    setShowAISheet(false);
    // Handle different AI actions
    switch (action) {
      case 'parking':
        handleCategorySelect(POI_CATEGORIES.find(c => c.id === 'parking')!);
        break;
      case 'fuel':
        handleCategorySelect(POI_CATEGORIES.find(c => c.id === 'fuel')!);
        break;
      // Add more actions...
    }
  };

  // Landscape mode - minimal bar
  if (isLandscape) {
    return (
      <div 
        className="fixed bottom-0 left-0 right-0 z-40 bg-card/95 backdrop-blur border-t"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="flex items-center justify-between px-4 py-2 h-12">
          {route ? (
            <>
              <span className="font-medium text-sm truncate max-w-40">{endInput || 'Cel'}</span>
              <div className="flex items-center gap-3">
                <span className="font-bold">{Math.round(route.duration)} min</span>
                <span className="text-muted-foreground text-sm">{route.distance.toFixed(1)} km</span>
              </div>
            </>
          ) : (
            <button
              onClick={() => setShowSearchSheet(true)}
              className="flex items-center gap-2 text-sm text-muted-foreground"
            >
              <Search className="h-4 w-4" />
              Dotknij aby wyszukać
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Main collapsed bottom sheet */}
      <div 
        className="fixed bottom-0 left-0 right-0 z-40"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="rounded-t-3xl bg-card/98 backdrop-blur-xl border-t border-x border-white/10 shadow-2xl shadow-black/20 overflow-hidden">
          {/* Handle */}
          <div className="flex items-center justify-center pt-3 pb-2">
            <div className="w-12 h-1.5 bg-muted-foreground/20 rounded-full" />
          </div>

          {/* Search bar row */}
          <div className="px-4 pb-3">
            <div className="flex items-center gap-3">
              {/* Main search button - premium style */}
              <button
                onClick={() => setShowSearchSheet(true)}
                className="flex-1 h-14 px-5 rounded-2xl bg-muted/40 hover:bg-muted/60 border-2 border-transparent hover:border-primary/20 transition-all duration-200 flex items-center gap-4 text-left shadow-lg shadow-black/5"
              >
                <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Search className="h-5 w-5 text-primary" />
                </div>
                <span className="text-muted-foreground font-medium">Gdzie chcesz jechać? 🚗</span>
              </button>

              {/* Premium AI Button with gradient and animation */}
              <button
                onClick={() => setShowAISheet(true)}
                className="h-14 w-14 rounded-2xl bg-gradient-to-br from-violet-500 via-purple-500 to-indigo-600 text-white flex items-center justify-center shadow-xl shadow-violet-500/30 shrink-0 hover:shadow-2xl hover:shadow-violet-500/40 hover:scale-105 active:scale-95 transition-all duration-200 relative overflow-hidden group"
              >
                {/* Shimmer effect */}
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
                <AISparkleIcon />
              </button>
            </div>
          </div>

          {/* Category chips - horizontal scroll with premium styling */}
          <div className="px-4 pb-5 overflow-x-auto no-scrollbar">
            <div className="flex gap-2.5">
              {POI_CATEGORIES.slice(0, 5).map((category) => (
                <button
                  key={category.id}
                  onClick={() => handleCategorySelect(category)}
                  className="flex items-center gap-2.5 px-4 py-2.5 rounded-2xl bg-muted/40 hover:bg-muted/70 border border-transparent hover:border-primary/10 active:scale-95 transition-all duration-200 shrink-0 shadow-sm hover:shadow-md"
                >
                  <div className={`h-8 w-8 rounded-xl ${category.bgClass} text-white flex items-center justify-center shadow-md`}>
                    {category.icon}
                  </div>
                  <span className="text-sm font-medium whitespace-nowrap">{category.label}</span>
                </button>
              ))}
              
              {/* More categories button - premium style */}
              <button
                onClick={() => setShowSearchSheet(true)}
                className="flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-gradient-to-r from-primary/10 to-primary/5 text-primary hover:from-primary/20 hover:to-primary/10 border border-primary/20 active:scale-95 transition-all duration-200 shrink-0"
              >
                <span className="text-sm font-semibold">Więcej</span>
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Full Search Sheet */}
      <SearchSheet
        open={showSearchSheet}
        onClose={() => setShowSearchSheet(false)}
        onLocationSelect={handleLocationSelect}
        onCategorySelect={handleCategorySelect}
        gps={gps}
      />

      {/* AI Assistant Sheet */}
      <MapAISheet
        open={showAISheet}
        onClose={() => setShowAISheet(false)}
        onAction={handleAIAction}
      />
    </>
  );
};

export default MapsBottomSheet;
