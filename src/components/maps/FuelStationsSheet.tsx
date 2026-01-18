// GetRido Maps - Fuel Stations Sheet
// Shows nearby fuel stations along the route

import { useState, useEffect } from 'react';
import { Fuel, MapPin, Clock, Navigation, Star, X } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

interface FuelStation {
  id: string;
  name: string;
  brand: string;
  address: string;
  distance: number; // meters
  detourTime: number; // minutes extra
  rating?: number;
  isOpen?: boolean;
  prices?: {
    pb95?: number;
    pb98?: number;
    diesel?: number;
    lpg?: number;
  };
}

// Mock data - in production, this would come from Google Places or similar API
const MOCK_STATIONS: FuelStation[] = [
  {
    id: '1',
    name: 'Orlen',
    brand: 'ORLEN',
    address: 'ul. Wolska 145',
    distance: 930,
    detourTime: 2,
    rating: 4.2,
    isOpen: true,
    prices: { pb95: 6.49, pb98: 7.19, diesel: 6.39, lpg: 2.89 },
  },
  {
    id: '2',
    name: 'BP',
    brand: 'BP',
    address: 'ul. Grabowska 8',
    distance: 1200,
    detourTime: 3,
    rating: 4.5,
    isOpen: true,
    prices: { pb95: 6.55, pb98: 7.29, diesel: 6.45 },
  },
  {
    id: '3',
    name: 'Shell',
    brand: 'SHELL',
    address: 'ul. Tylna 29',
    distance: 1500,
    detourTime: 4,
    rating: 4.3,
    isOpen: true,
    prices: { pb95: 6.59, pb98: 7.35, diesel: 6.49, lpg: 2.95 },
  },
  {
    id: '4',
    name: 'Circle K',
    brand: 'CIRCLE K',
    address: 'ul. Główna 55',
    distance: 2100,
    detourTime: 5,
    rating: 4.0,
    isOpen: true,
    prices: { pb95: 6.45, pb98: 7.15, diesel: 6.35 },
  },
];

const getBrandColor = (brand: string): string => {
  switch (brand.toUpperCase()) {
    case 'ORLEN': return 'bg-red-500';
    case 'BP': return 'bg-green-600';
    case 'SHELL': return 'bg-yellow-500';
    case 'CIRCLE K': return 'bg-red-600';
    case 'LOTOS': return 'bg-blue-600';
    default: return 'bg-gray-500';
  }
};

interface FuelStationsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectStation?: (station: FuelStation) => void;
}

const FuelStationsSheet = ({ open, onOpenChange, onSelectStation }: FuelStationsSheetProps) => {
  const [stations, setStations] = useState<FuelStation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (open) {
      // Simulate API call
      setLoading(true);
      const timer = setTimeout(() => {
        setStations(MOCK_STATIONS);
        setLoading(false);
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [open]);

  const formatDistance = (meters: number): string => {
    if (meters < 1000) return `${meters}m`;
    return `${(meters / 1000).toFixed(1)}km`;
  };

  const handleSelectStation = (station: FuelStation) => {
    onSelectStation?.(station);
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[70vh] rounded-t-3xl">
        <SheetHeader className="pb-4">
          <div className="flex items-center justify-between">
            <SheetTitle className="flex items-center gap-2">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center">
                <Fuel className="h-5 w-5 text-white" />
              </div>
              <span>Stacje paliw na trasie</span>
            </SheetTitle>
          </div>
        </SheetHeader>

        <div className="space-y-3 overflow-y-auto pb-safe">
          {loading ? (
            // Loading skeletons
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="p-4 rounded-2xl border bg-card">
                <div className="flex items-start gap-3">
                  <Skeleton className="h-12 w-12 rounded-xl" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-5 w-24" />
                    <Skeleton className="h-4 w-36" />
                    <Skeleton className="h-4 w-20" />
                  </div>
                </div>
              </div>
            ))
          ) : (
            stations.map((station) => (
              <button
                key={station.id}
                onClick={() => handleSelectStation(station)}
                className="w-full p-4 rounded-2xl border bg-card hover:bg-accent/50 active:scale-[0.98] transition-all text-left"
              >
                <div className="flex items-start gap-3">
                  {/* Brand icon */}
                  <div className={`h-12 w-12 rounded-xl ${getBrandColor(station.brand)} flex items-center justify-center shadow-lg`}>
                    <Fuel className="h-6 w-6 text-white" />
                  </div>

                  <div className="flex-1 min-w-0">
                    {/* Name & rating */}
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-lg">{station.name}</span>
                      {station.rating && (
                        <div className="flex items-center gap-0.5 text-amber-500">
                          <Star className="h-3.5 w-3.5 fill-current" />
                          <span className="text-xs font-medium">{station.rating}</span>
                        </div>
                      )}
                      {station.isOpen && (
                        <span className="text-xs font-medium text-green-600 bg-green-100 dark:bg-green-900/30 px-1.5 py-0.5 rounded">
                          Otwarte
                        </span>
                      )}
                    </div>

                    {/* Address */}
                    <p className="text-sm text-muted-foreground flex items-center gap-1 mt-0.5">
                      <MapPin className="h-3 w-3" />
                      {station.address}
                    </p>

                    {/* Distance & detour */}
                    <div className="flex items-center gap-3 mt-2 text-sm">
                      <span className="flex items-center gap-1 font-medium text-primary">
                        <Navigation className="h-3.5 w-3.5" />
                        {formatDistance(station.distance)}
                      </span>
                      <span className="flex items-center gap-1 text-muted-foreground">
                        <Clock className="h-3.5 w-3.5" />
                        +{station.detourTime} min
                      </span>
                    </div>

                    {/* Prices */}
                    {station.prices && (
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        {station.prices.pb95 && (
                          <span className="text-xs px-2 py-1 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 font-medium">
                            Pb95: {station.prices.pb95.toFixed(2)} zł
                          </span>
                        )}
                        {station.prices.diesel && (
                          <span className="text-xs px-2 py-1 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 font-medium">
                            ON: {station.prices.diesel.toFixed(2)} zł
                          </span>
                        )}
                        {station.prices.lpg && (
                          <span className="text-xs px-2 py-1 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 font-medium">
                            LPG: {station.prices.lpg.toFixed(2)} zł
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </button>
            ))
          )}

          {!loading && stations.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <Fuel className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p className="font-medium">Brak stacji paliw na trasie</p>
              <p className="text-sm">Spróbuj zmienić trasę</p>
            </div>
          )}
        </div>

        {/* Bottom hint */}
        <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-background to-transparent pointer-events-none">
          <p className="text-center text-xs text-muted-foreground">
            ✅ Wybierz stację aby dodać przystanek
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default FuelStationsSheet;
