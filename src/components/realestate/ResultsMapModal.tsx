import { useState, useEffect, useRef, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { useGoogleMaps } from "@/hooks/useGoogleMaps";
import { Loader2, X, MapPin, Home, Search } from "lucide-react";

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
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);

  // Filter states
  const [cityFilter, setCityFilter] = useState("");
  const [showSale, setShowSale] = useState(true);
  const [showRent, setShowRent] = useState(true);
  const [maxPrice, setMaxPrice] = useState("");
  const [minArea, setMinArea] = useState("");
  const [mapPropertyType, setMapPropertyType] = useState("");

  // Get user's geolocation when modal opens
  useEffect(() => {
    if (open && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setUserLocation({
            lat: position.coords.latitude,
            lng: position.coords.longitude
          });
        },
        (error) => {
          console.log('[ResultsMapModal] Geolocation error:', error.message);
        },
        { timeout: 5000, enableHighAccuracy: false }
      );
    }
  }, [open]);

  // Filter listings that have coordinates
  const listingsWithCoords = listings.filter(l => l.lat && l.lng);
  
  // Apply filters - Fixed transaction type matching
  const filteredListings = listingsWithCoords.filter(listing => {
    // City filter
    if (cityFilter && !listing.location?.toLowerCase().includes(cityFilter.toLowerCase())) {
      return false;
    }

    // Property type filter
    if (mapPropertyType && !listing.propertyType?.toLowerCase().includes(mapPropertyType)) {
      return false;
    }
    
    // Transaction type filter
    const transType = listing.transactionType?.toLowerCase() || '';
    const isSale = transType.includes('sprzedaż') || transType.includes('sprzedaz');
    const isRent = transType.includes('wynajem') || transType.includes('krótkoterminowy');
    
    if (isSale && !showSale) return false;
    if (isRent && !showRent) return false;
    if (!isSale && !isRent && !showSale && !showRent) return false;
    
    // Max price filter
    if (maxPrice && listing.price > parseInt(maxPrice)) return false;
    
    // Min area filter
    if (minArea && listing.areaM2 < parseInt(minArea)) return false;
    
    return true;
  });
  
  console.log('[ResultsMapModal] listings:', listings.length, 'with coords:', listingsWithCoords.length, 'filtered:', filteredListings.length);

  const formatPrice = (price: number, priceType?: string) => {
    if (price >= 1000000) {
      return `${(price / 1000000).toFixed(1)}M`;
    }
    if (price >= 1000) {
      return `${Math.round(price / 1000)}k`;
    }
    return price.toString();
  };

  const formatPriceFull = (price: number) => {
    return price.toLocaleString('pl-PL') + ' zł';
  };

  // Clustering: group nearby listings based on zoom level
  const clusterListings = useCallback((listings: PropertyListing[], zoom: number) => {
    if (zoom >= 14) {
      // At high zoom, show individual markers
      return listings.map(l => ({ type: 'single' as const, listings: [l], lat: l.lat!, lng: l.lng! }));
    }

    // Grid-based clustering
    const gridSize = zoom <= 8 ? 2 : zoom <= 10 ? 1 : zoom <= 12 ? 0.5 : 0.2;
    const clusters: Map<string, { listings: PropertyListing[]; latSum: number; lngSum: number }> = new Map();

    listings.forEach(l => {
      if (!l.lat || !l.lng) return;
      const key = `${Math.floor(l.lat / gridSize)}_${Math.floor(l.lng / gridSize)}`;
      const existing = clusters.get(key);
      if (existing) {
        existing.listings.push(l);
        existing.latSum += l.lat;
        existing.lngSum += l.lng;
      } else {
        clusters.set(key, { listings: [l], latSum: l.lat, lngSum: l.lng });
      }
    });

    return Array.from(clusters.values()).map(c => {
      const count = c.listings.length;
      if (count === 1) {
        return { type: 'single' as const, listings: c.listings, lat: c.listings[0].lat!, lng: c.listings[0].lng! };
      }
      return { type: 'cluster' as const, listings: c.listings, lat: c.latSum / count, lng: c.lngSum / count };
    });
  }, []);

  // Create individual price marker
  const createMarkerContent = useCallback((listing: PropertyListing): HTMLDivElement => {
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
        background: white;
        color: #1a1a1a;
        padding: 4px 10px;
        border-radius: 8px;
        font-size: 12px;
        font-weight: 700;
        white-space: nowrap;
        box-shadow: 0 2px 8px rgba(0,0,0,0.25);
        border: 2px solid ${bgColor};
        display: flex;
        align-items: center;
        gap: 4px;
      ">
        ${formatPriceFull(listing.price)}
      </div>
      <div style="
        width: 0; height: 0;
        border-left: 6px solid transparent;
        border-right: 6px solid transparent;
        border-top: 6px solid ${bgColor};
        margin-top: -1px;
      "></div>
    `;
    return div;
  }, []);

  // Create cluster marker (circle with count)
  const createClusterContent = useCallback((count: number): HTMLDivElement => {
    const size = count > 100 ? 56 : count > 30 ? 48 : count > 10 ? 42 : 36;
    const fontSize = count > 100 ? 15 : count > 30 ? 14 : 13;
    
    const div = document.createElement("div");
    div.style.cssText = `
      display: flex;
      align-items: center;
      justify-content: center;
      transform: translate(-50%, -50%);
      cursor: pointer;
    `;
    div.innerHTML = `
      <div style="
        width: ${size}px;
        height: ${size}px;
        border-radius: 50%;
        background: linear-gradient(135deg, #7c3aed, #6d28d9);
        color: white;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: ${fontSize}px;
        font-weight: 700;
        box-shadow: 0 3px 12px rgba(124,58,237,0.4), 0 0 0 4px rgba(124,58,237,0.15);
        border: 2px solid rgba(255,255,255,0.8);
      ">
        ${count}
      </div>
    `;
    return div;
  }, []);

  const showInfoWindow = useCallback((
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
  }, []);

  // Create custom overlay class
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

  // Update markers with clustering based on zoom
  const updateMarkers = useCallback(() => {
    if (!mapRef.current || !google || !infoWindowRef.current) return;
    
    const map = mapRef.current;
    const infoWindow = infoWindowRef.current;
    const zoom = map.getZoom() || 10;
    
    // Clear existing overlays
    overlaysRef.current.forEach(o => o.setMap?.(null));
    overlaysRef.current = [];
    
    const CustomMarkerOverlay = createOverlayClass();
    if (!CustomMarkerOverlay) return;
    
    const clusters = clusterListings(filteredListings, zoom);
    
    clusters.forEach(cluster => {
      if (cluster.type === 'single') {
        const listing = cluster.listings[0];
        const markerContent = createMarkerContent(listing);
        
        const overlay = new CustomMarkerOverlay(
          { lat: cluster.lat, lng: cluster.lng },
          markerContent,
          map,
          () => {
            setSelectedListing(listing);
            showInfoWindow(map, infoWindow, listing);
          }
        );
        overlaysRef.current.push(overlay);
      } else {
        // Cluster marker
        const clusterContent = createClusterContent(cluster.listings.length);
        
        const overlay = new CustomMarkerOverlay(
          { lat: cluster.lat, lng: cluster.lng },
          clusterContent,
          map,
          () => {
            // Zoom into the cluster
            const bounds = new google.maps.LatLngBounds();
            cluster.listings.forEach(l => {
              if (l.lat && l.lng) bounds.extend({ lat: l.lat, lng: l.lng });
            });
            map.fitBounds(bounds, 50);
          }
        );
        overlaysRef.current.push(overlay);
      }
    });

    console.log('[ResultsMapModal] Clusters:', clusters.length, 'at zoom:', zoom);
  }, [google, filteredListings, createMarkerContent, createClusterContent, showInfoWindow, createOverlayClass, clusterListings]);

  // Update markers when filters change (after initial map creation)
  useEffect(() => {
    if (mapRef.current && google) {
      updateMarkers();
    }
  }, [cityFilter, showSale, showRent, maxPrice, minArea, updateMarkers, google]);

  // Initialize map when modal opens
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
          console.error("[ResultsMapModal] Failed to init map after 10 attempts");
        }
        return;
      }

      mapCreated = true;

      // Calculate center: prefer user location, then listings, then Poland center
      let center = { lat: 52.0, lng: 19.0 }; // Default: Poland center
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
      
      console.log('[ResultsMapModal] Initializing map with center:', center);

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

      // Create initial markers
      updateMarkers();

      // Force resize after render
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
        aria-describedby="results-map-modal-description"
      >
        <span id="results-map-modal-description" className="sr-only">
          Modal z mapą wyników wyszukiwania nieruchomości
        </span>
        
        <DialogHeader className="px-2 sm:px-4 py-2 sm:py-3 border-b shrink-0">
          <div className="flex items-center gap-2 sm:gap-3">
            <MapPin className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
            <DialogTitle className="text-sm sm:text-base">
              Mapa wyników
            </DialogTitle>
          </div>
        </DialogHeader>

        {/* Filter Bar */}
        <div className="px-2 sm:px-4 py-2 border-b bg-muted/50 shrink-0 space-y-2">
          {/* Property type pills */}
          <div className="flex flex-wrap items-center gap-1.5">
            {[
              { key: "", label: "Wszystkie" },
              { key: "mieszkanie", label: "Mieszkania" },
              { key: "dom", label: "Domy" },
              { key: "lokal", label: "Lokale" },
              { key: "magazyn", label: "Magazyny" },
            ].map(t => (
              <button
                key={t.key}
                onClick={() => setMapPropertyType(t.key)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors border ${
                  mapPropertyType === t.key
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background text-muted-foreground border-border hover:border-primary/50"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            {/* City Filter */}
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Miasto..."
                value={cityFilter}
                onChange={(e) => setCityFilter(e.target.value)}
                className="h-8 w-28 sm:w-36 pl-7 text-xs"
              />
            </div>
            
            <div className="h-6 w-px bg-border hidden sm:block" />
            
            {/* Checkbox Sprzedaż */}
            <label className="flex items-center gap-1.5 cursor-pointer">
              <Checkbox 
                checked={showSale} 
                onCheckedChange={(checked) => setShowSale(!!checked)}
              />
              <div className="flex items-center gap-1">
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                <span className="text-xs">Sprzedaż</span>
              </div>
            </label>
            
            {/* Checkbox Wynajem */}
            <label className="flex items-center gap-1.5 cursor-pointer">
              <Checkbox 
                checked={showRent} 
                onCheckedChange={(checked) => setShowRent(!!checked)}
              />
              <div className="flex items-center gap-1">
                <div className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                <span className="text-xs">Wynajem</span>
              </div>
            </label>
            
            <div className="h-6 w-px bg-border hidden sm:block" />
            
            {/* Max Price */}
            <div className="flex items-center gap-1">
              <Input
                type="number"
                placeholder="Cena do"
                value={maxPrice}
                onChange={(e) => setMaxPrice(e.target.value)}
                className="h-8 w-24 sm:w-28 text-xs"
              />
              <span className="text-xs text-muted-foreground">zł</span>
            </div>
            
            {/* Min Area */}
            <div className="flex items-center gap-1">
              <Input
                type="number"
                placeholder="Metraż od"
                value={minArea}
                onChange={(e) => setMinArea(e.target.value)}
                className="h-8 w-20 sm:w-24 text-xs"
              />
              <span className="text-xs text-muted-foreground">m²</span>
            </div>
            
            {/* Results Counter */}
            <Badge variant="secondary" className="text-xs ml-auto">
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
            </div>
          ) : filteredListings.length === 0 ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-muted gap-3">
              <Search className="h-12 w-12 text-muted-foreground" />
              <p className="text-muted-foreground text-sm text-center px-4">
                Brak wyników dla wybranych filtrów
              </p>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => {
                  setCityFilter("");
                  setShowSale(true);
                  setShowRent(true);
                  setMaxPrice("");
                  setMinArea("");
                }}
              >
                Wyczyść filtry
              </Button>
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

        {/* Footer with Close Button only */}
        <div className="px-2 sm:px-4 pb-2 sm:pb-4 pt-0 flex items-center justify-end shrink-0">
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
