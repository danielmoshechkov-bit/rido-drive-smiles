import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import Supercluster from "supercluster";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { useGoogleMaps } from "@/hooks/useGoogleMaps";
import {
  X, MapPin, Search, Loader2, Home, PenTool, Eye, ChevronLeft, ChevronRight, Map as MapIcon, List, Plus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { UniversalHomeButton } from "@/components/UniversalHomeButton";
import { MyGetRidoButton } from "@/components/MyGetRidoButton";

// === Types ===
export interface PropertyListingForMap {
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

interface FullscreenMapViewProps {
  open: boolean;
  onClose: () => void;
  listings: PropertyListingForMap[];
  onViewListing?: (id: string) => void;
  user?: any;
  onNavigate?: (path: string) => void;
}

// Warsaw districts for autocomplete
const WARSAW_DISTRICTS = [
  "Bemowo", "Białołęka", "Bielany", "Mokotów", "Ochota",
  "Praga-Południe", "Praga-Północ", "Rembertów", "Śródmieście",
  "Targówek", "Ursus", "Ursynów", "Wawer", "Wesoła",
  "Wilanów", "Włochy", "Wola", "Żoliborz",
];

const PROPERTY_TYPE_PILLS = [
  { key: "", label: "Wszystkie" },
  { key: "mieszkanie", label: "Mieszkania" },
  { key: "dom", label: "Domy" },
  { key: "lokal", label: "Lokale" },
  { key: "magazyn", label: "Magazyny" },
];

// District center coords (approximate) for Warsaw
const DISTRICT_COORDS: Record<string, { lat: number; lng: number }> = {
  "Bemowo": { lat: 52.2545, lng: 20.9132 },
  "Białołęka": { lat: 52.3200, lng: 20.9700 },
  "Bielany": { lat: 52.2900, lng: 20.9350 },
  "Mokotów": { lat: 52.1950, lng: 21.0100 },
  "Ochota": { lat: 52.2150, lng: 20.9850 },
  "Praga-Południe": { lat: 52.2350, lng: 21.0700 },
  "Praga-Północ": { lat: 52.2550, lng: 21.0400 },
  "Rembertów": { lat: 52.2600, lng: 21.1500 },
  "Śródmieście": { lat: 52.2300, lng: 21.0100 },
  "Targówek": { lat: 52.2900, lng: 21.0600 },
  "Ursus": { lat: 52.1950, lng: 20.8800 },
  "Ursynów": { lat: 52.1450, lng: 21.0300 },
  "Wawer": { lat: 52.1950, lng: 21.1500 },
  "Wesoła": { lat: 52.2400, lng: 21.2200 },
  "Wilanów": { lat: 52.1550, lng: 21.0800 },
  "Włochy": { lat: 52.2050, lng: 20.9200 },
  "Wola": { lat: 52.2350, lng: 20.9700 },
  "Żoliborz": { lat: 52.2700, lng: 20.9850 },
};

export function FullscreenMapView({
  open,
  onClose,
  listings,
  onViewListing,
  user,
  onNavigate,
}: FullscreenMapViewProps) {
  const { isLoaded, google } = useGoogleMaps();
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null);
  const clusterIndexRef = useRef<Supercluster | null>(null);
  const overlaysRef = useRef<any[]>([]);

  // Drawing refs
  const drawingPolygonRef = useRef<google.maps.Polygon | null>(null);
  const drawingPolylineRef = useRef<google.maps.Polyline | null>(null);
  const isBrushDrawingRef = useRef(false);

  const [selectedListing, setSelectedListing] = useState<PropertyListingForMap | null>(null);
  const [mobileTab, setMobileTab] = useState<"map" | "list">("map");

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [showSale, setShowSale] = useState(true);
  const [showRent, setShowRent] = useState(true);
  const [mapPropertyType, setMapPropertyType] = useState("");
  const [drawingMode, setDrawingMode] = useState(false);
  const [drawnArea, setDrawnArea] = useState<Array<{ lat: number; lng: number }> | null>(null);

  // Filtered listings
  const filteredListings = useMemo(() => {
    return listings.filter((l) => {
      if (!l.lat || !l.lng) return false;
      if (mapPropertyType && !l.propertyType?.toLowerCase().includes(mapPropertyType)) return false;
      const transType = l.transactionType?.toLowerCase() || "";
      const isSale = transType.includes("sprzedaż") || transType.includes("sprzedaz");
      const isRent = transType.includes("wynajem") || transType.includes("krótkoterminowy");
      if (isSale && !showSale) return false;
      if (isRent && !showRent) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const inLocation = l.location?.toLowerCase().includes(q);
        const inDistrict = l.district?.toLowerCase().includes(q);
        const inTitle = l.title?.toLowerCase().includes(q);
        if (!inLocation && !inDistrict && !inTitle) return false;
      }
      // Drawn area filter
      if (drawnArea && drawnArea.length >= 3) {
        if (!isPointInPolygon(l.lat, l.lng, drawnArea)) return false;
      }
      return true;
    });
  }, [listings, mapPropertyType, showSale, showRent, searchQuery, drawnArea]);

  // District suggestions
  const suggestions = useMemo(() => {
    if (!searchQuery || searchQuery.length < 2) return [];
    const q = searchQuery.toLowerCase();
    return WARSAW_DISTRICTS.filter((d) => d.toLowerCase().includes(q));
  }, [searchQuery]);

  // Pagination for sidebar list
  const [listPage, setListPage] = useState(1);
  const listPerPage = 20;
  const listTotalPages = Math.max(1, Math.ceil(filteredListings.length / listPerPage));
  const paginatedSideListings = useMemo(() => {
    const start = (listPage - 1) * listPerPage;
    return filteredListings.slice(start, start + listPerPage);
  }, [filteredListings, listPage]);

  useEffect(() => { setListPage(1); }, [filteredListings.length]);

  const formatPriceFull = (price: number) => price.toLocaleString("pl-PL") + " zł";

  // === Supercluster ===
  useEffect(() => {
    const withCoords = listings.filter((l) => l.lat && l.lng);
    if (!withCoords.length) {
      clusterIndexRef.current = null;
      return;
    }
    const index = new Supercluster({ radius: 60, maxZoom: 16, minZoom: 3 });
    index.load(
      withCoords.map((l) => ({
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: [l.lng!, l.lat!] },
        properties: { listing: l },
      }))
    );
    clusterIndexRef.current = index;
  }, [listings]);

  // === Overlay class ===
  const createOverlayClass = useCallback(() => {
    if (!google) return null;
    return class extends google.maps.OverlayView {
      private pos: google.maps.LatLng;
      private div: HTMLDivElement;
      private handler: () => void;
      constructor(p: { lat: number; lng: number }, content: HTMLDivElement, map: google.maps.Map, onClick: () => void) {
        super();
        this.pos = new google.maps.LatLng(p.lat, p.lng);
        this.handler = onClick;
        this.div = document.createElement("div");
        this.div.style.position = "absolute";
        this.div.appendChild(content);
        this.div.addEventListener("click", this.handler);
        this.setMap(map);
      }
      onAdd() { this.getPanes()?.floatPane.appendChild(this.div); }
      draw() {
        const pt = this.getProjection().fromLatLngToDivPixel(this.pos);
        if (pt) { this.div.style.left = pt.x + "px"; this.div.style.top = pt.y + "px"; }
      }
      onRemove() { this.div.removeEventListener("click", this.handler); this.div.parentNode?.removeChild(this.div); }
    };
  }, [google]);

  // === Marker content ===
  const createPriceMarker = useCallback((listing: PropertyListingForMap): HTMLDivElement => {
    const transType = listing.transactionType?.toLowerCase() || "";
    const isRentL = transType.includes("wynajem") || transType.includes("krótkoterminowy");
    const borderColor = isRentL ? "#3b82f6" : "#10b981";
    const div = document.createElement("div");
    div.style.cssText = "display:flex;flex-direction:column;align-items:center;transform:translate(-50%,-100%);cursor:pointer;";
    div.innerHTML = `<div style="background:white;color:#1a1a1a;padding:4px 10px;border-radius:8px;font-size:12px;font-weight:700;white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,0.25);border:2px solid ${borderColor};">${formatPriceFull(listing.price)}</div><div style="width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-top:6px solid ${borderColor};margin-top:-1px;"></div>`;
    return div;
  }, []);

  const createClusterMarker = useCallback((count: number): HTMLDivElement => {
    const size = count > 100 ? 56 : count > 30 ? 48 : count > 10 ? 42 : 36;
    const fs = count > 100 ? 15 : count > 30 ? 14 : 13;
    const div = document.createElement("div");
    div.style.cssText = "display:flex;align-items:center;justify-content:center;transform:translate(-50%,-50%);cursor:pointer;";
    div.innerHTML = `<div style="width:${size}px;height:${size}px;border-radius:50%;background:linear-gradient(135deg,#7c3aed,#6d28d9);color:white;display:flex;align-items:center;justify-content:center;font-size:${fs}px;font-weight:700;box-shadow:0 3px 12px rgba(124,58,237,0.4),0 0 0 4px rgba(124,58,237,0.15);border:2px solid rgba(255,255,255,0.8);">${count}</div>`;
    return div;
  }, []);

  // === InfoWindow ===
  const showInfoWindow = useCallback(
    (map: google.maps.Map, iw: google.maps.InfoWindow, listing: PropertyListingForMap) => {
      iw.setContent(
        `<div style="max-width:280px;font-family:system-ui,sans-serif;">${listing.photos?.[0] ? `<img src="${listing.photos[0]}" style="width:100%;height:120px;object-fit:cover;border-radius:8px 8px 0 0;" />` : ""}<div style="padding:12px;"><h3 style="margin:0 0 6px;font-size:14px;font-weight:600;">${listing.title}</h3><div style="font-size:18px;font-weight:700;color:#7c3aed;">${formatPriceFull(listing.price)}</div><div style="font-size:12px;color:#6b7280;">${listing.areaM2} m² ${listing.rooms ? `• ${listing.rooms} pok.` : ""} • ${listing.location}</div>${onViewListing ? `<button onclick="window.__ridoViewListing('${listing.id}')" style="margin-top:8px;padding:6px 16px;background:#7c3aed;color:white;border:none;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;">Zobacz szczegóły</button>` : ""}</div></div>`
      );
      iw.setPosition({ lat: listing.lat!, lng: listing.lng! });
      iw.open(map);
    },
    [onViewListing]
  );

  // === Update markers ===
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

    const clusters = index.getClusters(
      [sw.lng(), sw.lat(), ne.lng(), ne.lat()],
      Math.floor(zoom)
    );

    if (!infoWindowRef.current) infoWindowRef.current = new google.maps.InfoWindow();
    const iw = infoWindowRef.current;
    const Overlay = createOverlayClass();
    if (!Overlay) return;

    clusters.forEach((cluster) => {
      const [lng, lat] = cluster.geometry.coordinates;
      if (cluster.properties.cluster) {
        overlaysRef.current.push(
          new Overlay({ lat, lng }, createClusterMarker(cluster.properties.point_count), map, () => {
            const expansionZoom = index.getClusterExpansionZoom(cluster.id as number);
            map.setZoom(Math.min(expansionZoom, 18));
            map.setCenter({ lat, lng });
          })
        );
      } else {
        const listing = cluster.properties.listing;
        overlaysRef.current.push(
          new Overlay({ lat, lng }, createPriceMarker(listing), map, () => {
            setSelectedListing(listing);
            showInfoWindow(map, iw, listing);
          })
        );
      }
    });
  }, [google, createOverlayClass, createPriceMarker, createClusterMarker, showInfoWindow]);

  // Global handler for InfoWindow button
  useEffect(() => {
    (window as any).__ridoViewListing = (id: string) => {
      onViewListing?.(id);
    };
    return () => { delete (window as any).__ridoViewListing; };
  }, [onViewListing]);

  // === Init map ===
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

      // User location or default
      let center = { lat: 52.2297, lng: 21.0122 };
      let zoom = 11;

      const withCoords = listings.filter((l) => l.lat && l.lng);
      if (withCoords.length > 0) {
        const avgLat = withCoords.reduce((s, l) => s + l.lat!, 0) / withCoords.length;
        const avgLng = withCoords.reduce((s, l) => s + l.lng!, 0) / withCoords.length;
        center = { lat: avgLat, lng: avgLng };
        zoom = withCoords.length === 1 ? 14 : 10;
      }

      const map = new google.maps.Map(container, {
        center,
        zoom,
        disableDefaultUI: false,
        zoomControl: true,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
        gestureHandling: "greedy",
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
      drawingPolygonRef.current?.setMap(null);
      drawingPolylineRef.current?.setMap(null);
      mapRef.current = null;
    };
  }, [open, isLoaded, google, listings]);

  // Re-render markers when listings change
  useEffect(() => {
    if (mapRef.current && google) updateMarkers();
  }, [updateMarkers, google]);

  // === Drawing ===
  const startDrawing = useCallback(() => {
    if (!mapRef.current || !google) return;
    setDrawingMode(true);
    setDrawnArea(null);
    drawingPolygonRef.current?.setMap(null);

    const map = mapRef.current;
    map.setOptions({ draggable: false, gestureHandling: "none" });

    const path: google.maps.LatLng[] = [];
    const polyline = new google.maps.Polyline({
      map,
      path,
      strokeColor: "#7c3aed",
      strokeWeight: 3,
      strokeOpacity: 0.8,
    });
    drawingPolylineRef.current = polyline;
    isBrushDrawingRef.current = false;

    const mouseDownListener = map.addListener("mousedown", (e: google.maps.MapMouseEvent) => {
      if (!e.latLng) return;
      isBrushDrawingRef.current = true;
      path.length = 0;
      path.push(e.latLng);
      polyline.setPath(path);
    });

    const mouseMoveListener = map.addListener("mousemove", (e: google.maps.MapMouseEvent) => {
      if (!isBrushDrawingRef.current || !e.latLng) return;
      path.push(e.latLng);
      polyline.setPath(path);
    });

    const mouseUpListener = map.addListener("mouseup", () => {
      if (!isBrushDrawingRef.current) return;
      isBrushDrawingRef.current = false;
      google.maps.event.removeListener(mouseDownListener);
      google.maps.event.removeListener(mouseMoveListener);
      google.maps.event.removeListener(mouseUpListener);

      map.setOptions({ draggable: true, gestureHandling: "greedy" });
      polyline.setMap(null);

      if (path.length < 3) {
        setDrawingMode(false);
        return;
      }

      const points = path.map((p) => ({ lat: p.lat(), lng: p.lng() }));

      // Create polygon overlay
      const polygon = new google.maps.Polygon({
        map,
        paths: points,
        strokeColor: "#7c3aed",
        strokeWeight: 2,
        strokeOpacity: 0.9,
        fillColor: "#7c3aed",
        fillOpacity: 0.15,
      });
      drawingPolygonRef.current = polygon;
      setDrawnArea(points);
      setDrawingMode(false);
    });
  }, [google]);

  const clearDrawing = useCallback(() => {
    drawingPolygonRef.current?.setMap(null);
    drawingPolygonRef.current = null;
    setDrawnArea(null);
    setDrawingMode(false);
  }, []);

  // === District select ===
  const handleSelectDistrict = (district: string) => {
    setSearchQuery(district);
    setShowSuggestions(false);
    const coords = DISTRICT_COORDS[district];
    if (coords && mapRef.current) {
      mapRef.current.setCenter(coords);
      mapRef.current.setZoom(14);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      {/* Portal Header - same as main marketplace */}
      <header className="shrink-0 bg-background/95 backdrop-blur-md border-b">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <UniversalHomeButton />
            <span className="font-bold text-lg md:text-xl text-primary">
              Nieruchomości
            </span>
          </div>
          <div className="flex items-center gap-2">
            <MyGetRidoButton user={user} />
            <Button
              size="sm"
              onClick={() => onNavigate?.(user ? '/nieruchomosci/agent/panel?tab=add' : '/auth?redirect=/nieruchomosci/agent/panel?tab=add')}
              className="rounded-full"
            >
              <Plus className="h-4 w-4 mr-1" />
              <span className="hidden sm:inline">Dodaj ogłoszenie</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={onClose}
              className="rounded-full gap-1.5"
            >
              <X className="h-4 w-4" />
              <span className="hidden sm:inline">Zamknij mapę</span>
            </Button>
          </div>
        </div>
      </header>

      {/* Filter Bar */}
      <div className="shrink-0 border-b bg-background px-3 py-2 flex items-center gap-2 flex-wrap">
        {/* Property type pills */}
        <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide">
          {PROPERTY_TYPE_PILLS.map((t) => (
            <button
              key={t.key}
              onClick={() => setMapPropertyType(t.key)}
              className={cn(
                "px-2.5 py-1 rounded-full text-xs font-medium border whitespace-nowrap transition-colors",
                mapPropertyType === t.key
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background text-muted-foreground border-border hover:border-primary/50"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="h-6 w-px bg-border hidden sm:block" />

        {/* Search with autocomplete */}
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Miasto, dzielnica..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setShowSuggestions(true);
            }}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
            className="h-8 w-36 sm:w-44 pl-7 text-xs"
          />
          {showSuggestions && suggestions.length > 0 && (
            <div className="absolute top-full left-0 mt-1 w-48 bg-popover border rounded-lg shadow-lg z-50 max-h-48 overflow-y-auto">
              {suggestions.map((d) => (
                <button
                  key={d}
                  onMouseDown={() => handleSelectDistrict(d)}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors"
                >
                  <MapPin className="inline h-3 w-3 mr-1.5 text-muted-foreground" />
                  {d}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="h-6 w-px bg-border hidden sm:block" />

        {/* Transaction type checkboxes */}
        <label className="flex items-center gap-1.5 cursor-pointer">
          <Checkbox checked={showSale} onCheckedChange={(c) => setShowSale(!!c)} />
          <div className="flex items-center gap-1">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
            <span className="text-xs">Sprzedaż</span>
          </div>
        </label>
        <label className="flex items-center gap-1.5 cursor-pointer">
          <Checkbox checked={showRent} onCheckedChange={(c) => setShowRent(!!c)} />
          <div className="flex items-center gap-1">
            <div className="w-2.5 h-2.5 rounded-full bg-blue-500" />
            <span className="text-xs">Wynajem</span>
          </div>
        </label>

        <div className="h-6 w-px bg-border hidden sm:block" />

        {/* Drawing toggle */}
        {drawnArea ? (
          <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={clearDrawing}>
            <X className="h-3.5 w-3.5" />
            Usuń zaznaczenie
          </Button>
        ) : (
          <Button
            variant={drawingMode ? "default" : "outline"}
            size="sm"
            className="h-8 gap-1.5 text-xs"
            onClick={drawingMode ? () => setDrawingMode(false) : startDrawing}
          >
            <PenTool className="h-3.5 w-3.5" />
            Zaznacz obszar
          </Button>
        )}

        {/* Results counter */}
        <Badge variant="secondary" className="text-xs ml-auto shrink-0">
          {filteredListings.length} ogłoszeń
        </Badge>

        {/* Mobile tab toggle */}
        <div className="flex md:hidden gap-0.5 bg-muted rounded-lg p-0.5">
          <Button
            variant={mobileTab === "map" ? "default" : "ghost"}
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => setMobileTab("map")}
          >
            <MapIcon className="h-3.5 w-3.5 mr-1" />
            Mapa
          </Button>
          <Button
            variant={mobileTab === "list" ? "default" : "ghost"}
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => setMobileTab("list")}
          >
            <List className="h-3.5 w-3.5 mr-1" />
            Lista
          </Button>
        </div>

        {/* Close button */}
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0"
          onClick={onClose}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Drawing mode banner */}
      {drawingMode && (
        <div className="bg-primary/10 border-b px-4 py-2 text-center text-sm font-medium text-primary">
          <PenTool className="inline h-4 w-4 mr-2" />
          Rysuj obszar na mapie — kliknij i przeciągnij
        </div>
      )}

      {/* Main content: map + list */}
      <div className="flex-1 flex overflow-hidden">
        {/* Map Panel */}
        <div
          className={cn(
            "relative",
            // Desktop: always 65%
            "hidden md:block md:w-[65%]",
            // Mobile: show based on tab
            mobileTab === "map" && "!block w-full md:!w-[65%]"
          )}
        >
          {!isLoaded ? (
            <div className="absolute inset-0 flex items-center justify-center bg-muted">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div ref={mapContainerRef} className="absolute inset-0" />
          )}

          {/* Selected listing card overlay */}
          {selectedListing && (
            <div className="absolute bottom-3 right-3 max-w-xs bg-background rounded-lg shadow-xl border overflow-hidden z-10">
              {selectedListing.photos?.[0] && (
                <img
                  src={selectedListing.photos[0]}
                  alt={selectedListing.title}
                  className="w-full h-24 object-cover"
                />
              )}
              <div className="p-3">
                <h4 className="font-medium text-sm line-clamp-2 mb-1">{selectedListing.title}</h4>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs text-muted-foreground">{selectedListing.location}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="font-bold text-primary text-sm">
                    {formatPriceFull(selectedListing.price)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {selectedListing.areaM2}m² {selectedListing.rooms ? `• ${selectedListing.rooms} pok.` : ""}
                  </span>
                </div>
                {onViewListing && (
                  <Button
                    size="sm"
                    className="w-full mt-2 h-8 text-xs"
                    onClick={() => onViewListing(selectedListing.id)}
                  >
                    Zobacz szczegóły
                  </Button>
                )}
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

        {/* List Panel */}
        <div
          className={cn(
            "border-l bg-background flex flex-col",
            "hidden md:flex md:w-[35%]",
            mobileTab === "list" && "!flex w-full md:!w-[35%]"
          )}
        >
          {/* List header */}
          <div className="px-3 py-2 border-b bg-muted/50 flex items-center justify-between">
            <span className="text-sm font-medium">
              {filteredListings.length} ogłoszeń
            </span>
            <span className="text-xs text-muted-foreground">
              Strona {listPage}/{listTotalPages}
            </span>
          </div>

          {/* Scrollable list */}
          <div className="flex-1 overflow-y-auto">
            {paginatedSideListings.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Home className="h-12 w-12 text-muted-foreground/30 mb-3" />
                <p className="text-sm text-muted-foreground">Brak ogłoszeń do wyświetlenia</p>
              </div>
            ) : (
              <div className="divide-y">
                {paginatedSideListings.map((listing) => (
                  <SideListingCard
                    key={listing.id}
                    listing={listing}
                    isSelected={selectedListing?.id === listing.id}
                    onClick={() => {
                      setSelectedListing(listing);
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

          {/* Pagination */}
          {listTotalPages > 1 && (
            <div className="px-3 py-2 border-t flex items-center justify-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="h-7"
                disabled={listPage === 1}
                onClick={() => setListPage((p) => p - 1)}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-xs text-muted-foreground">
                {listPage} / {listTotalPages}
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="h-7"
                disabled={listPage === listTotalPages}
                onClick={() => setListPage((p) => p + 1)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// === Side listing card ===
function SideListingCard({
  listing,
  isSelected,
  onClick,
  onView,
}: {
  listing: PropertyListingForMap;
  isSelected: boolean;
  onClick: () => void;
  onView?: () => void;
}) {
  const transType = listing.transactionType?.toLowerCase() || "";
  const isRent = transType.includes("wynajem") || transType.includes("krótkoterminowy");

  return (
    <div
      className={cn(
        "flex gap-3 p-3 cursor-pointer hover:bg-accent/50 transition-colors",
        isSelected && "bg-accent"
      )}
      onClick={onClick}
    >
      {/* Thumbnail */}
      <div className="w-20 h-16 rounded-lg overflow-hidden bg-muted shrink-0">
        {listing.photos?.[0] ? (
          <img src={listing.photos[0]} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Home className="h-5 w-5 text-muted-foreground/40" />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <h4 className="text-sm font-medium line-clamp-1">{listing.title}</h4>
        <div className="flex items-center gap-1.5 mt-0.5">
          <div className={cn("w-2 h-2 rounded-full", isRent ? "bg-blue-500" : "bg-emerald-500")} />
          <span className="text-xs text-muted-foreground truncate">{listing.location}</span>
        </div>
        <div className="flex items-center justify-between mt-1">
          <span className="font-bold text-sm text-primary">
            {listing.price.toLocaleString("pl-PL")} zł
          </span>
          <span className="text-xs text-muted-foreground">
            {listing.areaM2}m² {listing.rooms ? `• ${listing.rooms}p` : ""}
          </span>
        </div>
      </div>

      {/* View button */}
      {onView && (
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0 self-center"
          onClick={(e) => {
            e.stopPropagation();
            onView();
          }}
        >
          <Eye className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}

// === Utility: Point in polygon ===
function isPointInPolygon(lat: number, lng: number, polygon: Array<{ lat: number; lng: number }>): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lat, yi = polygon[i].lng;
    const xj = polygon[j].lat, yj = polygon[j].lng;
    if (((yi > lng) !== (yj > lng)) && (lat < ((xj - xi) * (lng - yi)) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}
