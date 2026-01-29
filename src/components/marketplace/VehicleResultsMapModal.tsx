import { useState, useEffect, useRef, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { useGoogleMaps } from "@/hooks/useGoogleMaps";
import { Loader2, X, MapPin, Car, Search } from "lucide-react";

interface VehicleListing {
  id: string;
  title: string;
  price: number;
  priceType?: string;
  photos?: string[];
  location: string;
  year?: number;
  brand?: string;
  model?: string;
  fuelType?: string;
  transactionType?: string;
  transactionColor?: string;
  lat?: number;
  lng?: number;
}

interface VehicleResultsMapModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  listings: VehicleListing[];
  onViewListing?: (id: string) => void;
}

export function VehicleResultsMapModal({ 
  open, 
  onOpenChange, 
  listings,
  onViewListing 
}: VehicleResultsMapModalProps) {
  const { isLoaded, google } = useGoogleMaps();
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null);
  
  const [selectedListing, setSelectedListing] = useState<VehicleListing | null>(null);
  const overlaysRef = useRef<any[]>([]);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);

  // Filter states
  const [cityFilter, setCityFilter] = useState("");
  const [showSale, setShowSale] = useState(true);
  const [showRent, setShowRent] = useState(true);
  const [maxPrice, setMaxPrice] = useState("");
  const [minYear, setMinYear] = useState("");

  useEffect(() => {
    if (open && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setUserLocation({
            lat: position.coords.latitude,
            lng: position.coords.longitude
          });
        },
        () => {},
        { timeout: 5000, enableHighAccuracy: false }
      );
    }
  }, [open]);

  const listingsWithCoords = listings.filter(l => l.lat && l.lng);
  
  const filteredListings = listingsWithCoords.filter(listing => {
    if (cityFilter && !listing.location?.toLowerCase().includes(cityFilter.toLowerCase())) {
      return false;
    }
    
    const transType = listing.transactionType?.toLowerCase() || '';
    const isSale = transType.includes('sprzedaż') || transType.includes('sprzedaz');
    const isRent = transType.includes('wynajem') || transType.includes('krótkoterminowy');
    
    if (isSale && !showSale) return false;
    if (isRent && !showRent) return false;
    if (!isSale && !isRent && !showSale && !showRent) return false;
    
    if (maxPrice && listing.price > parseInt(maxPrice)) return false;
    if (minYear && listing.year && listing.year < parseInt(minYear)) return false;
    
    return true;
  });

  const formatPrice = (price: number) => {
    if (price >= 1000000) {
      return `${(price / 1000000).toFixed(1)}M`;
    }
    if (price >= 1000) {
      return `${(price / 1000).toFixed(0)}k`;
    }
    return price.toString();
  };

  const createMarkerContent = useCallback((listing: VehicleListing): HTMLDivElement => {
    const transType = listing.transactionType?.toLowerCase() || '';
    const isRent = transType.includes('wynajem') || transType.includes('krótkoterminowy');
    const bgColor = isRent ? "#3b82f6" : "#10b981";
    
    const div = document.createElement("div");
    div.style.cssText = `
      display: flex;
      flex-direction: column;
      align-items: center;
      transform: translate(-50%, -100%);
      cursor: pointer;
    `;
    div.innerHTML = `
      <div style="
        background: linear-gradient(135deg, ${bgColor}, ${bgColor}dd);
        color: white;
        padding: 4px 8px;
        border-radius: 6px;
        font-size: 11px;
        font-weight: 700;
        white-space: nowrap;
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        display: flex;
        align-items: center;
        gap: 4px;
        margin-bottom: -2px;
      ">
        ${formatPrice(listing.price)} zł
        <span style="opacity: 0.8; font-weight: 400; font-size: 10px;">• ${listing.year || '-'}</span>
      </div>
      <svg width="20" height="24" viewBox="0 0 20 24" style="filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));">
        <path d="M10 0C4.5 0 0 4.5 0 10c0 7.5 10 14 10 14s10-6.5 10-14c0-5.5-4.5-10-10-10z" fill="${bgColor}"/>
        <circle cx="10" cy="10" r="4" fill="white"/>
      </svg>
    `;
    return div;
  }, []);

  const showInfoWindow = useCallback((
    map: google.maps.Map, 
    infoWindow: google.maps.InfoWindow, 
    listing: VehicleListing
  ) => {
    const content = `
      <div style="max-width: 280px; font-family: system-ui, -apple-system, sans-serif;">
        ${listing.photos?.[0] ? `
          <img 
            src="${listing.photos[0]}" 
            alt="${listing.title}"
            style="width: 100%; height: 120px; object-fit: cover; border-radius: 8px 8px 0 0;"
          />
        ` : ''}
        <div style="padding: 12px;">
          <h3 style="margin: 0 0 6px; font-size: 14px; font-weight: 600; line-height: 1.3;">
            ${listing.title}
          </h3>
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
            <span style="
              background: ${listing.transactionColor || '#6b7280'};
              color: white;
              padding: 2px 8px;
              border-radius: 12px;
              font-size: 11px;
              font-weight: 500;
            ">${listing.transactionType}</span>
            <span style="color: #6b7280; font-size: 12px;">
              ${listing.location}
            </span>
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <div>
              <div style="font-size: 18px; font-weight: 700; color: #7c3aed;">
                ${listing.price.toLocaleString('pl-PL')} zł
                ${listing.priceType === 'weekly' ? '<span style="font-size: 12px; font-weight: 400; color: #6b7280;">/tydzień</span>' : ''}
              </div>
              <div style="font-size: 12px; color: #6b7280;">
                ${listing.year || '-'} ${listing.fuelType ? `• ${listing.fuelType}` : ''}
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    infoWindow.setContent(content);
    infoWindow.setPosition({ lat: listing.lat!, lng: listing.lng! });
    infoWindow.open(map);
  }, []);

  const createOverlayClass = useCallback(() => {
    if (!google) return null;
    
    return class CustomMarkerOverlay extends google.maps.OverlayView {
      private position: google.maps.LatLng;
      private containerDiv: HTMLDivElement;
      private onClickHandler: () => void;

      constructor(
        position: { lat: number; lng: number },
        content: HTMLDivElement,
        mapInstance: google.maps.Map,
        onClick: () => void
      ) {
        super();
        this.position = new google.maps.LatLng(position.lat, position.lng);
        this.onClickHandler = onClick;
        this.containerDiv = document.createElement("div");
        this.containerDiv.style.position = "absolute";
        this.containerDiv.appendChild(content);
        this.containerDiv.addEventListener("click", this.onClickHandler);
        this.setMap(mapInstance);
      }

      onAdd() {
        const panes = this.getPanes();
        panes?.floatPane.appendChild(this.containerDiv);
      }

      draw() {
        const overlayProjection = this.getProjection();
        const pos = overlayProjection.fromLatLngToDivPixel(this.position);
        if (pos) {
          this.containerDiv.style.left = pos.x + "px";
          this.containerDiv.style.top = pos.y + "px";
        }
      }

      onRemove() {
        this.containerDiv.removeEventListener("click", this.onClickHandler);
        this.containerDiv.parentNode?.removeChild(this.containerDiv);
      }
    };
  }, [google]);

  const updateMarkers = useCallback(() => {
    if (!mapRef.current || !google || !infoWindowRef.current) return;
    
    const map = mapRef.current;
    const infoWindow = infoWindowRef.current;
    
    overlaysRef.current.forEach(o => o.setMap?.(null));
    overlaysRef.current = [];
    
    const CustomMarkerOverlay = createOverlayClass();
    if (!CustomMarkerOverlay) return;
    
    filteredListings.forEach(listing => {
      if (!listing.lat || !listing.lng) return;

      const markerContent = createMarkerContent(listing);
      
      const overlay = new CustomMarkerOverlay(
        { lat: listing.lat, lng: listing.lng },
        markerContent,
        map,
        () => {
          setSelectedListing(listing);
          showInfoWindow(map, infoWindow, listing);
        }
      );

      overlaysRef.current.push(overlay);
    });

    if (filteredListings.length > 1) {
      const bounds = new google.maps.LatLngBounds();
      filteredListings.forEach(l => {
        if (l.lat && l.lng) {
          bounds.extend({ lat: l.lat, lng: l.lng });
        }
      });
      map.fitBounds(bounds, 50);
    } else if (filteredListings.length === 1) {
      const single = filteredListings[0];
      if (single.lat && single.lng) {
        map.setCenter({ lat: single.lat, lng: single.lng });
        map.setZoom(14);
      }
    }
  }, [google, filteredListings, createMarkerContent, showInfoWindow, createOverlayClass]);

  useEffect(() => {
    if (mapRef.current && google) {
      updateMarkers();
    }
  }, [cityFilter, showSale, showRent, maxPrice, minYear, updateMarkers, google]);

  useEffect(() => {
    if (!open || !isLoaded || !google) return;

    let initAttempt = 0;
    let initTimeout: ReturnType<typeof setTimeout>;
    let mapCreated = false;

    const tryInitMap = () => {
      const container = mapContainerRef.current;
      if (!container || mapCreated) return;

      const width = container.offsetWidth;
      const height = container.offsetHeight;

      if (width < 100 || height < 100) {
        initAttempt++;
        if (initAttempt < 10) {
          initTimeout = setTimeout(tryInitMap, 100 * initAttempt);
        }
        return;
      }

      mapCreated = true;

      let center = { lat: 52.0, lng: 19.0 };
      let initialZoom = 6;
      
      if (userLocation) {
        center = userLocation;
        initialZoom = 12;
      } else if (filteredListings.length > 0) {
        const avgLat = filteredListings.reduce((sum, l) => sum + (l.lat || 0), 0) / filteredListings.length;
        const avgLng = filteredListings.reduce((sum, l) => sum + (l.lng || 0), 0) / filteredListings.length;
        center = { lat: avgLat, lng: avgLng };
        initialZoom = filteredListings.length === 1 ? 14 : 10;
      }

      const map = new google.maps.Map(container, {
        center,
        zoom: initialZoom,
        disableDefaultUI: false,
        zoomControl: true,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: true,
        gestureHandling: 'greedy',
        draggable: true,
      });

      mapRef.current = map;

      const infoWindow = new google.maps.InfoWindow();
      infoWindowRef.current = infoWindow;

      updateMarkers();

      [50, 100, 200, 400, 800].forEach(delay => {
        setTimeout(() => {
          if (mapRef.current && google) {
            google.maps.event.trigger(mapRef.current, "resize");
          }
        }, delay);
      });
    };

    initTimeout = setTimeout(tryInitMap, 50);

    return () => {
      clearTimeout(initTimeout);
      overlaysRef.current.forEach(o => o.setMap?.(null));
      overlaysRef.current = [];
      mapRef.current = null;
    };
  }, [open, isLoaded, google, userLocation]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent 
        className="max-w-5xl h-[95vh] sm:h-[85vh] flex flex-col p-0 overflow-hidden"
        aria-describedby="vehicle-results-map-description"
      >
        <span id="vehicle-results-map-description" className="sr-only">
          Modal z mapą wyników wyszukiwania pojazdów
        </span>
        
        <DialogHeader className="px-2 sm:px-4 py-2 sm:py-3 border-b shrink-0">
          <div className="flex items-center gap-2 sm:gap-3">
            <Car className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
            <DialogTitle className="text-sm sm:text-base">
              Mapa pojazdów
            </DialogTitle>
          </div>
        </DialogHeader>

        {/* Filter Bar - improved layout with full labels */}
        <div className="px-2 sm:px-4 py-2 border-b bg-muted/50 shrink-0">
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            {/* City search */}
            <div className="relative flex-shrink-0">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Miasto..."
                value={cityFilter}
                onChange={(e) => setCityFilter(e.target.value)}
                className="h-8 w-28 sm:w-36 pl-7 text-xs"
              />
            </div>
            
            {/* Transaction type checkboxes */}
            <label className="flex items-center gap-1.5 cursor-pointer flex-shrink-0">
              <Checkbox 
                checked={showSale} 
                onCheckedChange={(checked) => setShowSale(!!checked)}
              />
              <div className="flex items-center gap-1">
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                <span className="text-xs whitespace-nowrap">Sprzedaż</span>
              </div>
            </label>
            
            <label className="flex items-center gap-1.5 cursor-pointer flex-shrink-0">
              <Checkbox 
                checked={showRent} 
                onCheckedChange={(checked) => setShowRent(!!checked)}
              />
              <div className="flex items-center gap-1">
                <div className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                <span className="text-xs whitespace-nowrap">Wynajem</span>
              </div>
            </label>
            
            {/* Price and Year filters with labels */}
            <div className="flex items-center gap-1 flex-shrink-0">
              <span className="text-xs text-muted-foreground whitespace-nowrap hidden sm:inline">Cena do:</span>
              <Input
                type="number"
                placeholder="Cena do"
                value={maxPrice}
                onChange={(e) => setMaxPrice(e.target.value)}
                className="h-8 w-20 sm:w-24 text-xs"
              />
              <span className="text-xs text-muted-foreground">zł</span>
            </div>
            
            <div className="flex items-center gap-1 flex-shrink-0">
              <span className="text-xs text-muted-foreground whitespace-nowrap hidden sm:inline">Rocznik od:</span>
              <Input
                type="number"
                placeholder="Rocznik"
                value={minYear}
                onChange={(e) => setMinYear(e.target.value)}
                className="h-8 w-20 text-xs"
              />
            </div>
            
            <Badge variant="secondary" className="text-xs ml-auto flex-shrink-0">
              {filteredListings.length} z {listingsWithCoords.length}
            </Badge>
          </div>
        </div>
        
        {/* Map Container */}
        <div 
          className="relative mx-2 sm:mx-4 my-2 sm:my-4 rounded-xl overflow-hidden border flex-1"
          style={{ width: 'calc(100% - 1rem)', minHeight: '280px', height: '100%' }}
        >
          {!isLoaded ? (
            <div className="absolute inset-0 flex items-center justify-center bg-muted/50">
              <div className="text-center">
                <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary mb-2" />
                <p className="text-sm text-muted-foreground">Ładowanie mapy...</p>
              </div>
            </div>
          ) : (
            <div 
              ref={mapContainerRef} 
              className="w-full h-full min-h-[280px]"
              style={{ height: '100%' }}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
