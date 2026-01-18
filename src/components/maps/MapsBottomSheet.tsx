// GetRido Maps - Mobile Bottom Sheet with 3 tabs
import { useState } from 'react';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Navigation, Route, Activity, ChevronUp } from 'lucide-react';
import { RoutingState } from './useRouting';
import { GpsState } from './useUserLocation';
import { NavigationState } from './useNavigation';
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
}

const MapsBottomSheet = ({ routing, gps, navigation }: MapsBottomSheetProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<string>('route');

  const { route, endInput } = routing;

  return (
    <div 
      className="absolute bottom-0 left-0 right-0 z-40"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {/* Collapsed handle - always visible */}
      <div 
        className="bg-card/95 backdrop-blur-md border-t rounded-t-2xl shadow-xl cursor-pointer touch-none safe-area-bottom"
        onClick={() => setIsOpen(true)}
      >
        <div className="flex items-center justify-center py-2">
          <div className="w-10 h-1 bg-muted-foreground/30 rounded-full" />
        </div>
        
        {/* Mini preview */}
        <div className="px-4 pb-3 flex items-center justify-between">
          {route ? (
            <>
              <div className="flex items-center gap-2">
                <Navigation className="h-4 w-4 text-primary" />
                <span className="font-medium text-sm truncate max-w-40">{endInput || 'Cel'}</span>
              </div>
              <span className="text-sm text-muted-foreground">
                {Math.round(route.duration)} min · {route.distance.toFixed(1)} km
              </span>
            </>
          ) : (
            <div className="flex items-center gap-2 text-muted-foreground">
              <ChevronUp className="h-4 w-4" />
              <span className="text-sm">Dotknij aby wyszukać trasę</span>
            </div>
          )}
        </div>
      </div>
      
      {/* Expanded sheet */}
      <Sheet open={isOpen} onOpenChange={setIsOpen}>
        <SheetContent 
          side="bottom" 
          className="h-[70vh] rounded-t-2xl p-0 overflow-hidden"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          <div className="flex items-center justify-center py-2 border-b">
            <div className="w-10 h-1 bg-muted-foreground/30 rounded-full" />
          </div>
          
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col h-full">
            <TabsList className="w-full grid grid-cols-3 rounded-none border-b bg-transparent h-12">
              <TabsTrigger 
                value="route" 
                className="gap-1.5 data-[state=active]:bg-primary/10 data-[state=active]:text-primary rounded-none border-b-2 border-transparent data-[state=active]:border-primary"
              >
                <Route className="h-4 w-4" />
                Trasa
              </TabsTrigger>
              <TabsTrigger 
                value="nav" 
                className="gap-1.5 data-[state=active]:bg-primary/10 data-[state=active]:text-primary rounded-none border-b-2 border-transparent data-[state=active]:border-primary"
              >
                <Navigation className="h-4 w-4" />
                Nawigacja
              </TabsTrigger>
              <TabsTrigger 
                value="status" 
                className="gap-1.5 data-[state=active]:bg-primary/10 data-[state=active]:text-primary rounded-none border-b-2 border-transparent data-[state=active]:border-primary"
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
              <MobileStatusTab gps={gps} />
            </TabsContent>
          </Tabs>
        </SheetContent>
      </Sheet>
    </div>
  );
};

export default MapsBottomSheet;
