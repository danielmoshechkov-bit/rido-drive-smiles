// GetRido Maps - Mobile Bottom Sheet with 3 tabs (Premium UX)
import { useState, useEffect } from 'react';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Navigation, Route, Activity, ChevronUp } from 'lucide-react';
import { RoutingState } from './useRouting';
import { GpsState } from './useUserLocation';
import { NavigationState } from './useNavigation';
import { Incident } from './incidentsService';
import { RiskAssessment } from './routeRiskService';
import MobileRouteForm from './MobileRouteForm';
import MobileNavigationTab from './MobileNavigationTab';
import MobileStatusTab from './MobileStatusTab';

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
  // Incidents & Risk (optional)
  incidents?: Incident[];
  incidentsLoading?: boolean;
  riskAssessment?: RiskAssessment | null;
  ridoAiAlternative?: any;
  onRefreshIncidents?: () => void;
  onUseRidoAiAlternative?: () => void;
}

const MapsBottomSheet = ({ 
  routing, 
  gps, 
  navigation,
  incidents = [],
  incidentsLoading = false,
  riskAssessment,
  ridoAiAlternative,
  onRefreshIncidents,
  onUseRidoAiAlternative,
}: MapsBottomSheetProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<string>('route');

  const { route, endInput } = routing;

  // Automatyczne przełączanie tabów
  useEffect(() => {
    if (navigation.isNavigating) {
      setActiveTab('nav');
    } else if (!route) {
      setActiveTab('route');
    }
  }, [navigation.isNavigating, route]);

  // Po kliknięciu "Prowadź do celu" - przełącz na nawigację
  const handleStartNavigation = async () => {
    await navigation.startNavigation();
    setActiveTab('nav');
    setIsOpen(false);
  };

  return (
    <div 
      className="absolute bottom-0 left-0 right-0 z-40"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {/* Collapsed handle - always visible */}
      <div 
        className="bg-card/95 backdrop-blur-md border-t rounded-t-2xl shadow-xl cursor-pointer touch-none"
        onClick={() => setIsOpen(true)}
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="flex items-center justify-center py-2">
          <div className="w-12 h-1.5 bg-muted-foreground/30 rounded-full" />
        </div>
        
        {/* Mini preview - Premium styling */}
        <div className="px-4 pb-4 flex items-center justify-between">
          {route ? (
            <>
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
            </>
          ) : (
            <div className="flex items-center gap-3 text-muted-foreground w-full">
              <div className="h-10 w-10 rounded-full bg-muted/50 flex items-center justify-center">
                <ChevronUp className="h-5 w-5" />
              </div>
              <span className="text-sm font-medium">Dotknij aby wyszukać trasę</span>
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
              />
            </TabsContent>
          </Tabs>
        </SheetContent>
      </Sheet>
    </div>
  );
};

export default MapsBottomSheet;
