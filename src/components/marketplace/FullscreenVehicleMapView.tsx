import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { useGoogleMaps } from "@/hooks/useGoogleMaps";
import { useClusterIndex } from "@/hooks/useClusterIndex";
import { useMapDrawingTools } from "@/hooks/useMapDrawingTools";
import { createCustomOverlayClass } from "@/lib/maps/CustomOverlay";
import {
  isPointInPolygon,
  haversineDistance,
  ensureClockwise,
  ensureCounterClockwise,
  createCirclePolygon,
  WORLD_MASK_PATH,
} from "@/lib/maps/geometry";
import {
  X, MapPin, Search, Loader2, Car, PenTool, Circle, ChevronLeft, ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

// === Types ===
export interface VehicleListingForMap {
  id: string;
  title: string;
  price: number;
  priceType?: string;
  photos?: string[];
  location: string;
  lat?: number;
  lng?: number;
  brand?: string;
  model?: string;
  year?: number;
  fuelType?: string;
  mileage?: number;
  transactionType?: string;
  transactionColor?: string;
}

interface FullscreenVehicleMapViewProps {
  open: boolean;
  onClose: () => void;
  listings: VehicleListingForMap[];
  onViewListing?: (id: string) => void;
}

// Polish cities (vehicle marketplace can use simpler list — no districts)
const CITY_DATA: Array<{ name: string; lat: number; lng: number; zoom: number }> = [
  { name: "Warszawa", lat: 52.2297, lng: 21.0122, zoom: 11 },
  { name: "Kraków", lat: 50.0647, lng: 19.9450, zoom: 12 },
  { name: "Wrocław", lat: 51.1079, lng: 17.0385, zoom: 12 },
  { name: "Poznań", lat: 52.4064, lng: 16.9252, zoom: 12 },
  { name: "Gdańsk", lat: 54.3520, lng: 18.6466, zoom: 12 },
  { name: "Łódź", lat: 51.7592, lng: 19.4560, zoom: 12 },
  { name: "Szczecin", lat: 53.4285, lng: 14.5528, zoom: 12 },
  { name: "Lublin", lat: 51.2465, lng: 22.5684, zoom: 12 },
  { name: "Katowice", lat: 50.2649, lng: 19.0238, zoom: 12 },
  { name: "Białystok", lat: 53.1325, lng: 23.1688, zoom: 12 },
  { name: "Rzeszów", lat: 50.0412, lng: 21.9991, zoom: 13 },
  { name: "Toruń", lat: 53.0138, lng: 18.5984, zoom: 13 },
  { name: "Bydgoszcz", lat: 53.1235, lng: 18.0084, zoom: 12 },
  { name: "Opole", lat: 50.6751, lng: 17.9213, zoom: 13 },
  { name: "Radom", lat: 51.4027, lng: 21.1471, zoom: 13 },
  { name: "Kielce", lat: 50.8661, lng: 20.6286, zoom: 13 },
  { name: "Olsztyn", lat: 53.7784, lng: 20.4801, zoom: 13 },
  { name: "Częstochowa", lat: 50.8118, lng: 19.1203, zoom: 13 },
  { name: "Gdynia", lat: 54.5189, lng: 18.5305, zoom: 12 },
  { name: "Sopot", lat: 54.4416, lng: 18.5601, zoom: 13 },
];

export function FullscreenVehicleMapView({
  open,
  onClose,
  listings,
  onViewListing,
}: FullscreenVehicleMapViewProps) {
  const { isLoaded, google } = useGoogleMaps();
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null);
  const overlaysRef = useRef<any[]>([]);
  const selectionMaskRef = useRef<google.maps.Polygon | null>(null);

  const {
    drawingMode,
    drawnArea,
    circleCenter,
    circleRadius,
    hasActiveDrawing,
    startPolygonDrawing,
    startCircleDrawing,
    clearAllDrawing,
    justFinishedDrawingRef,
    disposeDrawing,
  } = useMapDrawingTools({ google, mapRef, mapContainerRef });

  const [selectedListing, setSelectedListing] = useState<VehicleListingForMap | null>(null);
  const [previewPhotoIndex, setPreviewPhotoIndex] = useState(0);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [mobileTab, setMobileTab] = useState<"map" | "list">("map");
  const [searchQuery, setSearchQuery] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [bufferDistance, setBufferDistance] = useState(0);
  const [useBuffer, setUseBuffer] = useState(false);

  const filteredListings = useMemo(() => {
    return listings.filter((l) => {
      if (!l.lat || !l.lng) return false;

      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const inLocation = l.location?.toLowerCase().includes(q);
        const inTitle = l.title?.toLowerCase().includes(q);
        const matchedCity = CITY_DATA.find((c) => c.name.toLowerCase() === q);
        const fromSuggestion = matchedCity
          ? l.location?.toLowerCase().includes(matchedCity.name.toLowerCase())
          : false;
        if (!inLocation && !inTitle && !fromSuggestion) return false;
      }

      if (drawnArea && drawnArea.length >= 3) {
        if (!isPointInPolygon(l.lat, l.lng, drawnArea)) return false;
      }
      if (circleCenter) {
        const effectiveRadius = circleRadius + (useBuffer ? bufferDistance : 0);
        const dist = haversineDistance(circleCenter.lat, circleCenter.lng, l.lat, l.lng);
        if (dist > effectiveRadius) return false;
      }
      return true;
    });
  }, [listings, searchQuery, drawnArea, circleCenter, circleRadius, bufferDistance, useBuffer]);

  const suggestions = useMemo(() => {
    if (!searchQuery || searchQuery.length < 1) return [];
    const q = searchQuery.toLowerCase();
    return CITY_DATA.filter((c) => c.name.toLowerCase().includes(q)).slice(0, 12);
  }, [searchQuery]);

  const [listPage, setListPage] = useState(1);
  const listPerPage = 7;
  const listTotalPages = Math.max(1, Math.ceil(filteredListings.length / listPerPage));
  const paginatedSideListings = useMemo(() => {
    const start = (listPage - 1) * listPerPage;
    return filteredListings.slice(start, start + listPerPage);
  }, [filteredListings, listPage]);

  useEffect(() => { setListPage(1); }, [filteredListings.length]);

  const formatPriceFull = (price: number) => price.toLocaleString("pl-PL") + "\u00A0zł";

  const { indexRef: clusterIndexRef, version: clusterVersion } = useClusterIndex(
    filteredListings,
    (l) => (l.lat && l.lng ? [l.lng, l.lat] : null),
    { radius: 40, maxZoom: 20, minZoom: 3 },
  );

  const createOverlayClass = useCallback(() => {
    if (!google) return null;
    return createCustomOverlayClass(google, {
      shouldSuppressClick: () => justFinishedDrawingRef.current ?? false,
    });
  }, [google, justFinishedDrawingRef]);

  const createPriceMarker = useCallback((listing: VehicleListingForMap): HTMLDivElement => {
    const transType = listing.transactionType?.toLowerCase() || "";
    const isRentL = transType.includes("wynajem") || transType.includes("krótkoterminowy") || transType.includes("krotkoterminowy");
    const borderColor = isRentL ? "#3b82f6" : "#10b981";
    const div = document.createElement("div");
    div.style.cssText = "display:flex;flex-direction:column;align-items:center;transform:translate(-50%,-100%);cursor:pointer;";
    const label = document.createElement("div");
    label.style.cssText = "background:white;color:#1a1a1a;padding:3px 8px;border-radius:6px;font-size:11px;font-weight:700;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,0.2);";
    label.style.border = `2px solid ${borderColor}`;
    label.textContent = formatPriceFull(listing.price);
    const arrow = document.createElement("div");
    arrow.style.cssText = "width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;margin-top:-1px;";
    arrow.style.borderTop = `5px solid ${borderColor}`;
    div.append(label, arrow);
    return div;
  }, []);

  const createClusterMarker = useCallback((count: number): HTMLDivElement => {
    const size = count > 100 ? 52 : count > 30 ? 44 : count > 10 ? 38 : 32;
    const fs = count > 100 ? 14 : count > 30 ? 13 : 12;
    const div = document.createElement("div");
    div.style.cssText = "display:flex;align-items:center;justify-content:center;transform:translate(-50%,-50%);cursor:pointer;";
    const badge = document.createElement("div");
    badge.style.cssText = "border-radius:50%;background:linear-gradient(135deg,#7c3aed,#6d28d9);color:white;display:flex;align-items:center;justify-content:center;font-weight:700;box-shadow:0 3px 12px rgba(124,58,237,0.4),0 0 0 3px rgba(124,58,237,0.15);border:2px solid rgba(255,255,255,0.8);";
    badge.style.width = `${size}px`;
    badge.style.height = `${size}px`;
    badge.style.fontSize = `${fs}px`;
    badge.textContent = String(count);
    div.appendChild(badge);
    return div;
  }, []);

  const updateMarkers = useCallback(() => {
    if (!mapRef.current || !google) return;
    const map = mapRef.current;
    const index = clusterIndexRef.current;
    overlaysRef.current.forEach((o) => o.setMap?.(null));
    overlaysRef.current = [];
    if (!index) return;
    const bounds = map.getBounds();
    if (!bounds) return;
    const zoom = map.getZoom() ?? 10;
    const sw = bounds.getSouthWest();
    const ne = bounds.getNorthEast();
    const clusters = index.getClusters([sw.lng(), sw.lat(), ne.lng(), ne.lat()], Math.floor(zoom));
    if (!infoWindowRef.current) infoWindowRef.current = new google.maps.InfoWindow();
    const Overlay = createOverlayClass();
    if (!Overlay) return;
    clusters.forEach((cluster: any) => {
      const [lng, lat] = cluster.geometry.coordinates;
      if (cluster.properties.cluster) {
        overlaysRef.current.push(
          new Overlay({ lat, lng }, createClusterMarker(cluster.properties.point_count), map, () => {
            const expansionZoom = index.getClusterExpansionZoom(cluster.id as number);
            map.setZoom(Math.min(expansionZoom, 20));
            map.setCenter({ lat, lng });
          })
        );
      } else {
        const listing = cluster.properties.item as VehicleListingForMap;
        overlaysRef.current.push(
          new Overlay({ lat, lng }, createPriceMarker(listing), map, () => {
            setSelectedListing(listing);
            setPreviewPhotoIndex(0);
            setHoveredId(listing.id);
            if (listing.lat && listing.lng) map.panTo({ lat: listing.lat, lng: listing.lng });
          })
        );
      }
    });
  }, [google, createOverlayClass, createPriceMarker, createClusterMarker, clusterIndexRef]);

  useEffect(() => {
    if (!open || !isLoaded || !google) return;
    let initAttempt = 0;
    let initTimeout: ReturnType<typeof setTimeout>;
    let created = false;
    const tryInit = () => {
      const container = mapContainerRef.current;
      if (!container || created) return;
      if (container.offsetWidth < 100 || container.offsetHeight < 100) {
        initAttempt++;
        if (initAttempt < 15) initTimeout = setTimeout(tryInit, 80 * initAttempt);
        return;
      }
      created = true;
      let center = { lat: 52.2297, lng: 21.0122 };
      let zoom = 6;
      const withCoords = listings.filter((l) => l.lat && l.lng);
      if (withCoords.length > 0) {
        const avgLat = withCoords.reduce((s, l) => s + l.lat!, 0) / withCoords.length;
        const avgLng = withCoords.reduce((s, l) => s + l.lng!, 0) / withCoords.length;
        center = { lat: avgLat, lng: avgLng };
        zoom = withCoords.length === 1 ? 14 : 7;
      }
      const map = new google.maps.Map(container, {
        center, zoom,
        disableDefaultUI: false,
        zoomControl: true,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
        gestureHandling: "cooperative",
      });
      mapRef.current = map;
      infoWindowRef.current = new google.maps.InfoWindow();
      setTimeout(() => {
        google.maps.event.trigger(map, "resize");
        updateMarkers();
      }, 150);
      map.addListener("idle", updateMarkers);
    };
    initTimeout = setTimeout(tryInit, 50);
    return () => {
      clearTimeout(initTimeout);
      overlaysRef.current.forEach((o) => o.setMap?.(null));
      overlaysRef.current = [];
      selectionMaskRef.current?.setMap(null);
      selectionMaskRef.current = null;
      disposeDrawing();
      mapRef.current = null;
    };
  }, [open, isLoaded, google, listings, disposeDrawing]);

  useEffect(() => {
    if (mapRef.current && google) updateMarkers();
  }, [updateMarkers, google, clusterVersion]);

  // === Selection mask overlay (drawn polygon / circle) ===
  useEffect(() => {
    if (!mapRef.current || !google) return;
    selectionMaskRef.current?.setMap(null);
    selectionMaskRef.current = null;

    if (drawnArea && drawnArea.length >= 3) {
      const outerMaskPath = ensureClockwise(WORLD_MASK_PATH);
      const selectionHolePath = ensureCounterClockwise(drawnArea);
      selectionMaskRef.current = new google.maps.Polygon({
        map: mapRef.current,
        paths: [outerMaskPath, selectionHolePath],
        strokeColor: "#7c3aed",
        strokeWeight: 2,
        strokeOpacity: 0.8,
        fillColor: "#7c3aed",
        fillOpacity: 0.20,
        clickable: false,
        zIndex: 1,
      });
      return;
    }

    if (circleCenter) {
      const effectiveRadius = circleRadius + (useBuffer ? bufferDistance : 0);
      const outerMaskPath = ensureClockwise(WORLD_MASK_PATH);
      const circlePath = ensureCounterClockwise(createCirclePolygon(circleCenter, effectiveRadius));
      selectionMaskRef.current = new google.maps.Polygon({
        map: mapRef.current,
        paths: [outerMaskPath, circlePath],
        strokeColor: "#7c3aed",
        strokeWeight: 2,
        strokeOpacity: 0.8,
        fillColor: "#7c3aed",
        fillOpacity: 0.20,
        clickable: false,
        zIndex: 1,
      });
    }
  }, [google, drawnArea, circleCenter, circleRadius, bufferDistance, useBuffer]);

  const handleSelectCity = (city: typeof CITY_DATA[0]) => {
    setShowSuggestions(false);
    setSearchQuery(city.name);
    if (mapRef.current) {
      mapRef.current.setCenter({ lat: city.lat, lng: city.lng });
      mapRef.current.setZoom(city.zoom);
    }
  };

  if (!open) return null;

  return (
    <div className="flex flex-col bg-background" style={{ height: 'calc(100vh - 80px)', minHeight: '500px' }}>
      {/* TOOLBAR */}
      <div className="shrink-0 border-b bg-card/80 backdrop-blur-sm px-4 py-2">
        <div className="max-w-[2000px] mx-auto flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Wpisz miasto..."
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setShowSuggestions(true); }}
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
              className="h-10 rounded-full border-2 border-[#7A4EDA]/50 bg-background pl-9 text-sm shadow-sm focus:border-[#7A4EDA] focus:ring-0 transition-colors"
            />
            {showSuggestions && suggestions.length > 0 && (
              <div className="absolute top-full left-0 mt-1 w-full rounded-xl border bg-popover shadow-lg z-50 max-h-60 overflow-y-auto">
                {suggestions.map((c) => (
                  <button
                    key={c.name}
                    onMouseDown={() => handleSelectCity(c)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent transition-colors"
                  >
                    <MapPin className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="font-medium">{c.name}</span>
                    <span className="text-xs text-muted-foreground">miasto</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <Button
            variant={drawingMode === "pen" ? "default" : "outline"}
            size="sm"
            className="rounded-full h-8 px-3 text-xs gap-1.5"
            onClick={drawingMode === "pen" ? clearAllDrawing : startPolygonDrawing}
          >
            <PenTool className="h-3.5 w-3.5" />
            Zaznacz
          </Button>
          <Button
            variant={drawingMode === "circle" ? "default" : "outline"}
            size="sm"
            className="rounded-full h-8 px-3 text-xs gap-1.5"
            onClick={drawingMode === "circle" ? clearAllDrawing : startCircleDrawing}
          >
            <Circle className="h-3.5 w-3.5" />
            Okrąg
          </Button>

          {hasActiveDrawing && (
            <Button
              variant="ghost"
              size="sm"
              className="rounded-full h-8 px-2.5 text-xs text-destructive hover:text-destructive"
              onClick={clearAllDrawing}
            >
              <X className="h-3.5 w-3.5 mr-0.5" />
              Usuń
            </Button>
          )}

          <div className="flex items-center gap-1.5">
            <Checkbox
              id="veh-buffer-check"
              checked={useBuffer}
              onCheckedChange={(v) => setUseBuffer(!!v)}
              className="h-3.5 w-3.5"
            />
            <label htmlFor="veh-buffer-check" className="text-xs text-muted-foreground cursor-pointer whitespace-nowrap">
              +bufor
            </label>
            {useBuffer && (
              <Input
                type="number"
                value={bufferDistance}
                onChange={(e) => setBufferDistance(Number(e.target.value) || 0)}
                className="h-7 w-16 text-xs rounded-full px-2"
                placeholder="m"
              />
            )}
          </div>

          <div className="w-px h-5 bg-border" />
          <span className="text-xs text-muted-foreground font-medium whitespace-nowrap">
            {filteredListings.length} wyników
          </span>

          <Button variant="ghost" size="sm" className="rounded-full h-8 px-2.5 text-xs ml-auto" onClick={onClose}>
            <X className="h-3.5 w-3.5 mr-1" />
            Zamknij
          </Button>
        </div>
      </div>

      {drawingMode && (
        <div className="shrink-0 bg-primary/10 border-b px-4 py-1.5 text-center text-xs font-medium text-primary">
          {drawingMode === "pen" ? (
            <><PenTool className="inline h-3.5 w-3.5 mr-1.5" />Rysuj obszar — kliknij i przeciągnij po mapie</>
          ) : (
            <><Circle className="inline h-3.5 w-3.5 mr-1.5" />Kliknij na mapie, aby wstawić okrąg</>
          )}
        </div>
      )}

      {/* Mobile tabs */}
      <div className="shrink-0 md:hidden px-4 py-1.5 border-b bg-muted/30 flex items-center justify-between">
        <div className="flex gap-0.5 bg-muted rounded-md p-0.5">
          <Button variant={mobileTab === "map" ? "default" : "ghost"} size="sm" className="h-7 px-3 text-xs" onClick={() => setMobileTab("map")}>
            Mapa
          </Button>
          <Button variant={mobileTab === "list" ? "default" : "ghost"} size="sm" className="h-7 px-3 text-xs" onClick={() => setMobileTab("list")}>
            Lista
          </Button>
        </div>
        <span className="text-xs text-muted-foreground">{filteredListings.length} wyników</span>
      </div>

      {/* MAP + LIST */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        <div
          className={cn(
            "relative flex-1 min-h-0",
            "hidden md:block",
            mobileTab === "map" && "!block"
          )}
        >
          {!isLoaded ? (
            <div className="absolute inset-0 flex items-center justify-center bg-muted">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div ref={mapContainerRef} className="absolute inset-0" />
          )}

          {circleCenter && (
            <div className="absolute top-3 left-3 bg-background/95 backdrop-blur-sm rounded-lg shadow-md border px-3 py-2 z-10">
              <div className="flex items-center gap-2 text-xs">
                <Circle className="h-3.5 w-3.5 text-primary" />
                <span className="font-medium">Okrąg: {(circleRadius / 1000).toFixed(1)} km</span>
                {useBuffer && bufferDistance > 0 && (
                  <span className="text-muted-foreground">+ {bufferDistance}m bufor</span>
                )}
              </div>
            </div>
          )}

          {selectedListing && (
            <>
              <div
                className="absolute inset-0 z-10"
                onClick={() => setSelectedListing(null)}
              />
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 w-[340px] max-w-[90vw] bg-background rounded-xl shadow-2xl border overflow-hidden z-20">
                {selectedListing.photos && selectedListing.photos.length > 0 && (
                  <div className="relative">
                    <img
                      src={selectedListing.photos[previewPhotoIndex] || selectedListing.photos[0]}
                      alt={selectedListing.title}
                      className="w-full h-[160px] object-cover"
                    />
                    {selectedListing.photos.length > 1 && (
                      <>
                        <Button
                          variant="ghost" size="icon"
                          className="absolute left-1 top-1/2 -translate-y-1/2 h-7 w-7 bg-background/70 hover:bg-background/90 rounded-full"
                          onClick={(e) => { e.stopPropagation(); setPreviewPhotoIndex(i => (i - 1 + selectedListing.photos!.length) % selectedListing.photos!.length); }}
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost" size="icon"
                          className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 bg-background/70 hover:bg-background/90 rounded-full"
                          onClick={(e) => { e.stopPropagation(); setPreviewPhotoIndex(i => (i + 1) % selectedListing.photos!.length); }}
                        >
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1">
                          {selectedListing.photos.slice(0, 6).map((_, idx) => (
                            <div key={idx} className={cn("h-1.5 w-1.5 rounded-full transition-colors", idx === previewPhotoIndex ? "bg-white" : "bg-white/50")} />
                          ))}
                          {selectedListing.photos.length > 6 && <span className="text-[9px] text-white/70 ml-1">+{selectedListing.photos.length - 6}</span>}
                        </div>
                      </>
                    )}
                    <Button
                      variant="ghost" size="icon"
                      className="absolute top-1.5 right-1.5 h-6 w-6 bg-background/80 rounded-full"
                      onClick={(e) => { e.stopPropagation(); setSelectedListing(null); }}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
                <div className="p-3">
                  <h4 className="font-semibold text-sm leading-snug line-clamp-2 mb-1">{selectedListing.title}</h4>
                  <div className="flex items-center gap-1 mb-2">
                    <MapPin className="h-3 w-3 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground truncate">{selectedListing.location}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-primary text-base">{formatPriceFull(selectedListing.price)}</span>
                    <div className="text-[11px] text-muted-foreground text-right">
                      {selectedListing.year && <span>{selectedListing.year}</span>}
                      {selectedListing.fuelType && <span> · {selectedListing.fuelType}</span>}
                      {selectedListing.mileage != null && <span> · {selectedListing.mileage.toLocaleString("pl-PL")} km</span>}
                    </div>
                  </div>
                  {onViewListing && (
                    <Button size="sm" className="w-full mt-2 h-8 text-xs" onClick={() => onViewListing(selectedListing.id)}>
                      Szczegóły
                    </Button>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Side list */}
        <div
          className={cn(
            "border-l bg-background flex flex-col min-h-0",
            "hidden md:flex md:w-[280px] lg:w-[320px]",
            mobileTab === "list" && "!flex w-full md:!w-[280px]"
          )}
        >
          <div className="px-3 py-1.5 border-b bg-muted/50 flex items-center justify-between shrink-0">
            <span className="text-xs font-medium">{filteredListings.length} ogłoszeń</span>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" className="h-6 w-6" disabled={listPage === 1} onClick={() => setListPage((p) => p - 1)}>
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <span className="text-[11px] text-muted-foreground">{listPage}/{listTotalPages}</span>
              <Button variant="ghost" size="icon" className="h-6 w-6" disabled={listPage === listTotalPages} onClick={() => setListPage((p) => p + 1)}>
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          <div className="flex-1 overflow-auto min-h-0">
            {paginatedSideListings.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Car className="h-10 w-10 text-muted-foreground/30 mb-2" />
                <p className="text-xs text-muted-foreground">Brak ogłoszeń w tym obszarze</p>
              </div>
            ) : (
              <div className="divide-y">
                {paginatedSideListings.map((listing) => (
                  <SideVehicleCard
                    key={listing.id}
                    listing={listing}
                    isSelected={selectedListing?.id === listing.id}
                    isHovered={hoveredId === listing.id}
                    onMouseEnter={() => setHoveredId(listing.id)}
                    onMouseLeave={() => setHoveredId(null)}
                    onClick={() => {
                      setSelectedListing(listing);
                      setPreviewPhotoIndex(0);
                      if (listing.lat && listing.lng && mapRef.current) {
                        mapRef.current.panTo({ lat: listing.lat, lng: listing.lng });
                        mapRef.current.setZoom(Math.max(mapRef.current.getZoom() || 10, 14));
                      }
                      setMobileTab("map");
                    }}
                    onView={onViewListing ? () => onViewListing(listing.id) : undefined}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function SideVehicleCard({
  listing, isSelected, isHovered, onMouseEnter, onMouseLeave, onClick, onView,
}: {
  listing: VehicleListingForMap;
  isSelected: boolean;
  isHovered?: boolean;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  onClick: () => void;
  onView?: () => void;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const transType = listing.transactionType?.toLowerCase() || "";
  const isRent = transType.includes("wynajem") || transType.includes("krótkoterminowy") || transType.includes("krotkoterminowy");

  useEffect(() => {
    if (isHovered && cardRef.current) {
      cardRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [isHovered]);

  return (
    <div
      ref={cardRef}
      className={cn(
        "flex gap-2 p-2 cursor-pointer hover:bg-accent/50 transition-all",
        isSelected && "bg-accent",
        isHovered && "bg-primary/10 border-l-2 border-l-primary"
      )}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="w-[72px] h-14 rounded-md overflow-hidden bg-muted shrink-0">
        {listing.photos?.[0] ? (
          <img src={listing.photos[0]} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Car className="h-3.5 w-3.5 text-muted-foreground/40" />
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <h4 className="text-xs font-medium leading-snug line-clamp-1">{listing.title}</h4>
        <div className="flex items-center gap-1 mt-0.5">
          <div className={cn("w-1.5 h-1.5 rounded-full shrink-0", isRent ? "bg-blue-500" : "bg-emerald-500")} />
          <span className="text-[11px] text-muted-foreground truncate">{listing.location}</span>
        </div>
        <div className="mt-0.5 flex items-center gap-2">
          <span className="font-bold text-xs text-primary whitespace-nowrap">
            {listing.price.toLocaleString("pl-PL")}{"\u00A0"}zł
          </span>
          <span className="text-[11px] text-muted-foreground whitespace-nowrap truncate">
            {listing.year ?? ""}{listing.fuelType ? ` · ${listing.fuelType}` : ""}
          </span>
        </div>
      </div>
    </div>
  );
}
