// GetRido Maps - Mobile Bottom Sheet with Search (Premium UX)
import { useState, useEffect } from 'react';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Navigation, Route, Activity, Search, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { RoutingState } from './useRouting';
import { GpsState } from './useUserLocation';
import { NavigationState } from './useNavigation';
import { Incident } from './incidentsService';
import { RiskAssessment } from './routeRiskService';
import MobileRouteForm from './MobileRouteForm';
import MobileNavigationTab from './MobileNavigationTab';
import MobileStatusTab from './MobileStatusTab';
import { AddressAutocompleteInput } from './AddressAutocompleteInput';
import { AddressSuggestion } from './autocompleteService';
import { CameraController } from './useMapCameraController';

interface MapsBottomSheetProps {
  routing: RoutingState & {
    setStartInput: (value: string) => void;
    setEndInput: (value: string) => void;
    setStartCoords: (coords: { lat: number; lng: number } | null) => void;
    setEndCoords: (coords: { lat: number; lng: number } | null) => void;
    setRouteMode: (mode: 'fastest' | 'simplest') => void;
    calculateRoute: () => void;
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
  // Camera controller for animations
  cameraController?: CameraController;
  // Incidents & Risk (optional)
  incidents?: Incident[];
  incidentsLoading?: boolean;
  riskAssessment?: RiskAssessment | null;
  ridoAiAlternative?: any;
  onRefreshIncidents?: () => void;
  onUseRidoAiAlternative?: () => void;
  // Landscape mode (minimized UI)
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
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<string>('route');
  const [searchInput, setSearchInput] = useState('');

  const { route, endInput, isLoading } = routing;

  // Automatyczne przełączanie tabów
  useEffect(() => {
    if (navigation.isNavigating) {
      setActiveTab('nav');
    } else if (!route) {
      setActiveTab('route');
    }
  }, [navigation.isNavigating, route]);

  // Po kliknięciu "Prowadź do celu" - przełącz na nawigację z animacją
  const handleStartNavigation = async () => {
    // 1. Trigger fly animation first
    cameraController?.animateToNavigation();
    
    // 2. Start navigation after short delay for animation
    await new Promise(resolve => setTimeout(resolve, 500));
    await navigation.startNavigation();
    
    setActiveTab('nav');
    setIsOpen(false);
  };

  // Handle location selection from autocomplete
  const handleLocationSelect = (location: AddressSuggestion) => {
    // Set destination
    routing.setEndInput(location.shortName);
    routing.setEndCoords({ lat: location.lat, lng: location.lng });
    
    // Use GPS as start (null = current location)
    routing.setStartInput('');
    routing.setStartCoords(null);
    
    // Calculate route and open sheet
    routing.calculateRoute();
    setSearchInput(location.shortName);
    setIsOpen(true);
  };

  // In landscape mode, show only minimal compact bar
  if (isLandscape) {
    return (
      <div 
        className="fixed bottom-0 left-0 right-0 z-40 bg-card/95 backdrop-blur border-t"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="flex items-center justify-between px-4 py-2 h-12">
          {route ? (
            <>
              <div className="flex items-center gap-3">
                <Navigation className="h-4 w-4 text-primary" />
                <span className="font-medium text-sm truncate max-w-32">{endInput || 'Cel'}</span>
              </div>
              <div className="flex items-center gap-4">
                <span className="font-bold">{Math.round(route.duration)} min</span>
                <span className="text-muted-foreground text-sm">{route.distance.toFixed(1)} km</span>
              </div>
            </>
          ) : (
            <span className="text-sm text-muted-foreground">Dotknij aby wyszukać trasę</span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div 
      className="fixed bottom-0 left-0 right-0 z-40 bg-background"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {/* Collapsed handle - RIDO Premium styling */}
      <div 
        className="bg-card border-t rounded-t-2xl shadow-xl cursor-pointer touch-none"
        onClick={() => setIsOpen(true)}
      >
        <div className="flex items-center justify-center py-2.5">
          {/* Gold gradient handle */}
          <div className="w-12 h-1.5 rounded-full bg-gradient-to-r from-primary/40 via-amber-400/60 to-primary/40" />
        </div>
        
        {/* Mini preview or Search with Ludek */}
        <div className="px-4 pb-4">
          {route ? (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <Navigation className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <span className="font-semibold text-sm block truncate max-w-40">{endInput || 'Cel'}</span>
                  <span className="text-xs text-muted-foreground">Trasa wyznaczona</span>
                </div>
              </div>
              <div className="text-right">
                <span className="font-bold text-xl">{Math.round(route.duration)}</span>
                <span className="text-sm text-muted-foreground ml-1">min</span>
                <p className="text-xs text-muted-foreground">{route.distance.toFixed(1)} km</p>
              </div>
            </div>
          ) : (
            /* Premium search card with Ludek mascot */
            <div 
              className="rido-search-card rounded-2xl p-4 animate-slide-up-fade"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Mascot + Input row */}
              <div className="flex items-center gap-3">
                {/* Ludek mascot */}
                <div className="relative flex-shrink-0">
                  <img 
                    src="/lovable-uploads/253e522c-702e-4ce9-9429-10ddbde63878.png"
                    alt="Rido AI"
                    className="h-14 w-14 drop-shadow-md animate-bounce-gentle"
                  />
                  {/* Sparkle indicator */}
                  <div className="absolute -top-1 -right-1 h-5 w-5 bg-primary rounded-full flex items-center justify-center animate-pulse">
                    <Sparkles className="h-3 w-3 text-primary-foreground" />
                  </div>
                </div>
                
                {/* Input with button */}
                <div className="flex-1 flex items-center bg-background rounded-full border-2 border-primary/20 overflow-hidden shadow-sm hover:border-primary/40 transition-colors">
                  <AddressAutocompleteInput
                    value={searchInput}
                    onChange={setSearchInput}
                    onLocationSelect={handleLocationSelect}
                    placeholder="Gdzie chcesz jechać?"
                    markerColor="red"
                    fieldType="end"
                    className="flex-1 h-12 border-0 bg-transparent text-base px-4 focus:ring-0 focus:outline-none placeholder:text-muted-foreground/60"
                  />
                  <Button 
                    size="sm" 
                    className="h-10 px-5 rounded-full mr-1 bg-primary hover:bg-primary/90 shadow-md"
                    onClick={() => setIsOpen(true)}
                  >
                    <Search className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              
              {/* Powered by Rido AI */}
              <p className="text-center text-sm text-muted-foreground mt-3 flex items-center justify-center gap-1.5">
                Powered by <span className="text-primary font-semibold">Rido AI</span>
                <Sparkles className="h-3.5 w-3.5 text-primary" />
              </p>
            </div>
          )}
        </div>
      </div>
      
      {/* Expanded sheet */}
      <Sheet open={isOpen} onOpenChange={setIsOpen}>
        <SheetContent 
          side="bottom" 
          className="h-[75vh] rounded-t-2xl p-0 overflow-hidden"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 1rem)' }}
        >
          <div className="flex items-center justify-center py-2 border-b bg-background/50">
            <div className="w-12 h-1.5 bg-muted-foreground/30 rounded-full" />
          </div>
          
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col h-full">
            <TabsList className="w-full grid grid-cols-3 rounded-none border-b bg-transparent h-14 px-2">
              <TabsTrigger 
                value="route" 
                className="gap-2 data-[state=active]:bg-primary/10 data-[state=active]:text-primary rounded-lg border-0 data-[state=active]:shadow-none h-11 font-medium"
              >
                <Route className="h-4 w-4" />
                Trasa
              </TabsTrigger>
              <TabsTrigger 
                value="nav" 
                className="gap-2 data-[state=active]:bg-primary/10 data-[state=active]:text-primary rounded-lg border-0 data-[state=active]:shadow-none h-11 font-medium"
              >
                <Navigation className="h-4 w-4" />
                Nawigacja
              </TabsTrigger>
              <TabsTrigger 
                value="status" 
                className="gap-2 data-[state=active]:bg-primary/10 data-[state=active]:text-primary rounded-lg border-0 data-[state=active]:shadow-none h-11 font-medium"
              >
                <Activity className="h-4 w-4" />
                Status
              </TabsTrigger>
            </TabsList>
            
            {/* Tab: Route */}
            <TabsContent 
              value="route" 
              className="flex-1 overflow-y-auto overscroll-contain mt-0 p-4"
              style={{ WebkitOverflowScrolling: 'touch' }}
            >
              <MobileRouteForm 
                routing={routing} 
                gps={gps} 
                navigation={navigation}
                onClose={() => setIsOpen(false)}
                onStartNavigation={handleStartNavigation}
                riskAssessment={riskAssessment}
                ridoAiAlternative={ridoAiAlternative}
                onUseRidoAiAlternative={onUseRidoAiAlternative}
              />
            </TabsContent>
            
            {/* Tab: Navigation */}
            <TabsContent 
              value="nav" 
              className="flex-1 overflow-y-auto overscroll-contain mt-0 p-4"
            >
              <MobileNavigationTab navigation={navigation} gps={gps} />
            </TabsContent>
            
            {/* Tab: Status */}
            <TabsContent 
              value="status" 
              className="flex-1 overflow-y-auto overscroll-contain mt-0 p-4"
            >
            <MobileStatusTab 
                gps={gps} 
                incidents={incidents}
                incidentsLoading={incidentsLoading}
                onRefreshIncidents={onRefreshIncidents}
                routeCoordinates={routing.route?.coordinates}
              />
            </TabsContent>
          </Tabs>
        </SheetContent>
      </Sheet>
    </div>
  );
};

export default MapsBottomSheet;