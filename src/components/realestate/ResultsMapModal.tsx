import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useGoogleMaps } from "@/hooks/useGoogleMaps";
import { Loader2, X, MapPin, Home, Maximize2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface PropertyListing {
  id: string;
  title: string;
  price: number;
  priceType?: string;
  photos?: string[];
  location: string;
  district?: string;
  areaM2: number;
  rooms?: number;
  propertyType?: string;
  transactionType?: string;
  transactionColor?: string;
  lat?: number;
  lng?: number;
}

interface ResultsMapModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  listings: PropertyListing[];
  onViewListing?: (id: string) => void;
}

export function ResultsMapModal({ 
  open, 
  onOpenChange, 
  listings,
  onViewListing 
}: ResultsMapModalProps) {
  const { isLoaded, google } = useGoogleMaps();
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null);
  
  const [selectedListing, setSelectedListing] = useState<PropertyListing | null>(null);
  const overlaysRef = useRef<any[]>([]);

  // Filter listings that have coordinates
  const listingsWithCoords = listings.filter(l => l.lat && l.lng);
  
  // Debug: log what we receive
  console.log('[ResultsMapModal] listings:', listings.length, 'with coords:', listingsWithCoords.length);
  if (listings.length > 0) {
    console.log('[ResultsMapModal] Sample listing:', listings[0]);
  }

  const formatPrice = (price: number, priceType?: string) => {
    if (price >= 1000000) {
      return `${(price / 1000000).toFixed(1)}M`;
    }
    if (price >= 1000) {
      return `${(price / 1000).toFixed(0)}k`;
    }
    return price.toString();
  };

  const createMarkerContent = (listing: PropertyListing): HTMLDivElement => {
    const bgColor = listing.transactionType === "Wynajem" ? "#3b82f6" : "#10b981";
    const div = document.createElement("div");
    div.style.cssText = `
      background: linear-gradient(135deg, ${bgColor}, ${bgColor}dd);
      color: white;
      padding: 6px 10px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 700;
      white-space: nowrap;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 4px;
      transform: translateX(-50%);
    `;
    div.innerHTML = `
      ${formatPrice(listing.price, listing.priceType)} zł
      <span style="opacity: 0.8; font-weight: 400;">• ${listing.areaM2}m²</span>
    `;
    return div;
  };

  const showInfoWindow = (
    map: google.maps.Map, 
    infoWindow: google.maps.InfoWindow, 
    listing: PropertyListing
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
              ${listing.location}${listing.district ? `, ${listing.district}` : ''}
            </span>
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <div>
              <div style="font-size: 18px; font-weight: 700; color: #7c3aed;">
                ${listing.price.toLocaleString('pl-PL')} zł
                ${listing.priceType === 'rent_monthly' ? '<span style="font-size: 12px; font-weight: 400; color: #6b7280;">/mies.</span>' : ''}
              </div>
              <div style="font-size: 12px; color: #6b7280;">
                ${listing.areaM2} m² ${listing.rooms ? `• ${listing.rooms} pok.` : ''}
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    infoWindow.setContent(content);
    infoWindow.setPosition({ lat: listing.lat!, lng: listing.lng! });
    infoWindow.open(map);
  };

  // Initialize map when modal opens - robust retry logic like LocationMapModal
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
      console.log(`[ResultsMapModal] Init attempt ${initAttempt + 1}: ${width}x${height}px`);

      if (width < 100 || height < 100) {
        initAttempt++;
        if (initAttempt < 10) {
          initTimeout = setTimeout(tryInitMap, 100 * initAttempt);
        } else {
          console.error("[ResultsMapModal] Failed to init map after 10 attempts - container has no dimensions");
        }
        return;
      }

      mapCreated = true;

      // Calculate center from listings or default to Poland center
      let center = { lat: 52.0, lng: 19.0 };
      if (listingsWithCoords.length > 0) {
        const avgLat = listingsWithCoords.reduce((sum, l) => sum + (l.lat || 0), 0) / listingsWithCoords.length;
        const avgLng = listingsWithCoords.reduce((sum, l) => sum + (l.lng || 0), 0) / listingsWithCoords.length;
        center = { lat: avgLat, lng: avgLng };
      }
      
      console.log('[ResultsMapModal] Initializing map with center:', center, 'listings:', listingsWithCoords.length);

      // Create map with same config as LocationMapModal
      const map = new google.maps.Map(container, {
        center,
        zoom: listingsWithCoords.length === 1 ? 14 : 6,
        disableDefaultUI: false,
        zoomControl: true,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: true,
        gestureHandling: 'greedy',
        draggable: true,
      });

      mapRef.current = map;
      
      // Debug window reference
      (window as any).__debugResultsMap = map;
      (window as any).__debugResultsMapContainer = container;

      // Create info window
      const infoWindow = new google.maps.InfoWindow();
      infoWindowRef.current = infoWindow;

      // Create custom overlay class dynamically
      class CustomMarkerOverlay extends google.maps.OverlayView {
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
      }

      // Create markers for each listing
      listingsWithCoords.forEach(listing => {
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

      console.log('[ResultsMapModal] Created', overlaysRef.current.length, 'markers');

      // Fit bounds to show all markers
      if (listingsWithCoords.length > 1) {
        const bounds = new google.maps.LatLngBounds();
        listingsWithCoords.forEach(l => {
          if (l.lat && l.lng) {
            bounds.extend({ lat: l.lat, lng: l.lng });
          }
        });
        map.fitBounds(bounds, 50);
      }

      // Force resize after render - multiple triggers for stability at various intervals
      [50, 100, 200, 400, 800].forEach(delay => {
        setTimeout(() => {
          if (mapRef.current && google) {
            google.maps.event.trigger(mapRef.current, "resize");
            if (delay === 100 && listingsWithCoords.length > 0) {
              mapRef.current.setCenter(center);
            }
          }
        }, delay);
      });

      // Log gm-style count after 1 second to verify rendering
      setTimeout(() => {
        const gmStyles = container.querySelectorAll('.gm-style').length;
        console.log("[ResultsMapModal] gm-style count:", gmStyles);
        if (gmStyles === 0) {
          console.error("[ResultsMapModal] Map failed to render properly - no .gm-style elements found");
        }
      }, 1000);
    };

    // Start with a small delay to let the modal render
    initTimeout = setTimeout(tryInitMap, 50);

    return () => {
      clearTimeout(initTimeout);
      // Cleanup overlays
      overlaysRef.current.forEach(o => o.setMap?.(null));
      overlaysRef.current = [];
      mapRef.current = null;
    };
  }, [open, isLoaded, google, listingsWithCoords.length]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent 
        className="max-w-5xl h-[95vh] sm:h-[85vh] flex flex-col p-0 overflow-hidden"
        aria-describedby="results-map-modal-description"
      >
        <span id="results-map-modal-description" className="sr-only">
          Modal z mapą wyników wyszukiwania nieruchomości
        </span>
        
        <DialogHeader className="px-2 sm:px-4 py-2 sm:py-3 border-b shrink-0">
          <div className="flex items-center gap-2 sm:gap-3">
            <MapPin className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
            <DialogTitle className="text-sm sm:text-base">
              Mapa wyników ({listingsWithCoords.length})
            </DialogTitle>
          </div>
          {/* X button removed - DialogContent already has one built-in */}
        </DialogHeader>
        
        {/* Map Container */}
        <div 
          className="relative mx-2 sm:mx-4 my-2 sm:my-4 rounded-xl overflow-hidden border flex-1"
          style={{ width: 'calc(100% - 1rem)', minHeight: '280px', height: '100%' }}
        >
          {!isLoaded ? (
            <div className="absolute inset-0 flex items-center justify-center bg-muted">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : listingsWithCoords.length === 0 ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-muted gap-3">
              <Home className="h-12 w-12 text-muted-foreground" />
              <p className="text-muted-foreground text-sm text-center px-4">
                {listings.length === 0 
                  ? "Brak ogłoszeń do wyświetlenia"
                  : `Brak nieruchomości z lokalizacją (${listings.length} ogłoszeń bez współrzędnych)`
                }
              </p>
              {listings.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  Dodaj współrzędne w edycji ogłoszenia
                </p>
              )}
            </div>
          ) : (
            <div ref={mapContainerRef} className="absolute inset-0 min-h-[280px] sm:min-h-[400px]" />
          )}

          {/* Selected Listing Card */}
          {selectedListing && (
            <div className="absolute bottom-2 sm:bottom-4 right-2 sm:right-4 max-w-[calc(100%-1rem)] sm:max-w-xs bg-background rounded-lg shadow-xl border overflow-hidden">
              {selectedListing.photos?.[0] && (
                <img 
                  src={selectedListing.photos[0]} 
                  alt={selectedListing.title}
                  className="w-full h-20 sm:h-24 object-cover"
                />
              )}
              <div className="p-2 sm:p-3">
                <h4 className="font-medium text-xs sm:text-sm line-clamp-2 mb-1">{selectedListing.title}</h4>
                <div className="flex items-center gap-2 mb-2">
                  <Badge 
                    style={{ backgroundColor: selectedListing.transactionColor }}
                    className="text-white text-xs"
                  >
                    {selectedListing.transactionType}
                  </Badge>
                  <span className="text-xs text-muted-foreground truncate">{selectedListing.location}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <span className="font-bold text-primary text-sm">{selectedListing.price.toLocaleString('pl-PL')} zł</span>
                    <span className="text-xs text-muted-foreground ml-1">
                      {selectedListing.areaM2}m²
                    </span>
                  </div>
                  {onViewListing && (
                    <Button 
                      size="sm" 
                      variant="outline"
                      className="h-7 text-xs shrink-0"
                      onClick={() => onViewListing(selectedListing.id)}
                    >
                      Zobacz
                    </Button>
                  )}
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="absolute top-1 right-1 h-6 w-6 bg-background/80"
                onClick={() => setSelectedListing(null)}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          )}
        </div>

        {/* Footer with Legend and Close Button */}
        <div className="px-2 sm:px-4 pb-2 sm:pb-4 pt-0 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full bg-emerald-500" />
              <span className="text-xs">Sprzedaż</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full bg-blue-500" />
              <span className="text-xs">Wynajem</span>
            </div>
          </div>
          
          <Button 
            onClick={() => onOpenChange(false)}
            size="sm"
            className="h-8 sm:h-9 text-xs sm:text-sm"
          >
            Zamknij
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
