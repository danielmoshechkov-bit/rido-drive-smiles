import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import Supercluster from "supercluster";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { useGoogleMaps } from "@/hooks/useGoogleMaps";
import {
  X, MapPin, Search, Loader2, Home, PenTool, Circle, ChevronLeft, ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";


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

// Cities and districts for autocomplete
const LOCATION_DATA: Array<{ name: string; type: 'miasto' | 'dzielnica'; parent?: string; lat: number; lng: number; zoom: number }> = [
  { name: "Warszawa", type: "miasto", lat: 52.2297, lng: 21.0122, zoom: 11 },
  { name: "Kraków", type: "miasto", lat: 50.0647, lng: 19.9450, zoom: 12 },
  { name: "Wrocław", type: "miasto", lat: 51.1079, lng: 17.0385, zoom: 12 },
  { name: "Poznań", type: "miasto", lat: 52.4064, lng: 16.9252, zoom: 12 },
  { name: "Gdańsk", type: "miasto", lat: 54.3520, lng: 18.6466, zoom: 12 },
  { name: "Łódź", type: "miasto", lat: 51.7592, lng: 19.4560, zoom: 12 },
  { name: "Szczecin", type: "miasto", lat: 53.4285, lng: 14.5528, zoom: 12 },
  { name: "Lublin", type: "miasto", lat: 51.2465, lng: 22.5684, zoom: 12 },
  { name: "Katowice", type: "miasto", lat: 50.2649, lng: 19.0238, zoom: 12 },
  { name: "Białystok", type: "miasto", lat: 53.1325, lng: 23.1688, zoom: 12 },
  { name: "Rzeszów", type: "miasto", lat: 50.0412, lng: 21.9991, zoom: 13 },
  { name: "Toruń", type: "miasto", lat: 53.0138, lng: 18.5984, zoom: 13 },
  { name: "Bydgoszcz", type: "miasto", lat: 53.1235, lng: 18.0084, zoom: 12 },
  { name: "Opole", type: "miasto", lat: 50.6751, lng: 17.9213, zoom: 13 },
  { name: "Radom", type: "miasto", lat: 51.4027, lng: 21.1471, zoom: 13 },
  { name: "Kielce", type: "miasto", lat: 50.8661, lng: 20.6286, zoom: 13 },
  { name: "Olsztyn", type: "miasto", lat: 53.7784, lng: 20.4801, zoom: 13 },
  { name: "Częstochowa", type: "miasto", lat: 50.8118, lng: 19.1203, zoom: 13 },
  { name: "Piaseczno", type: "miasto", lat: 52.0737, lng: 21.0234, zoom: 13 },
  { name: "Ożarów Mazowiecki", type: "miasto", lat: 52.2204, lng: 20.7969, zoom: 13 },
  { name: "Pruszków", type: "miasto", lat: 52.1707, lng: 20.8122, zoom: 14 },
  { name: "Legionowo", type: "miasto", lat: 52.4014, lng: 20.9258, zoom: 14 },
  { name: "Raszyn", type: "miasto", lat: 52.1575, lng: 20.9308, zoom: 14 },
  { name: "Tarczyn", type: "miasto", lat: 51.9773, lng: 20.9141, zoom: 14 },
  { name: "Nadarzyn", type: "miasto", lat: 52.0878, lng: 20.8080, zoom: 14 },
  { name: "Bemowo", type: "dzielnica", parent: "Warszawa", lat: 52.2545, lng: 20.9132, zoom: 13 },
  { name: "Białołęka", type: "dzielnica", parent: "Warszawa", lat: 52.3225, lng: 20.9732, zoom: 13 },
  { name: "Bielany", type: "dzielnica", parent: "Warszawa", lat: 52.2900, lng: 20.9430, zoom: 13 },
  { name: "Mokotów", type: "dzielnica", parent: "Warszawa", lat: 52.1935, lng: 21.0448, zoom: 13 },
  { name: "Ochota", type: "dzielnica", parent: "Warszawa", lat: 52.2145, lng: 20.9832, zoom: 14 },
  { name: "Praga-Południe", type: "dzielnica", parent: "Warszawa", lat: 52.2345, lng: 21.0932, zoom: 13 },
  { name: "Praga-Północ", type: "dzielnica", parent: "Warszawa", lat: 52.2585, lng: 21.0432, zoom: 14 },
  { name: "Rembertów", type: "dzielnica", parent: "Warszawa", lat: 52.2605, lng: 21.1732, zoom: 14 },
  { name: "Śródmieście", type: "dzielnica", parent: "Warszawa", lat: 52.2319, lng: 21.0060, zoom: 14 },
  { name: "Targówek", type: "dzielnica", parent: "Warszawa", lat: 52.2925, lng: 21.0532, zoom: 13 },
  { name: "Ursus", type: "dzielnica", parent: "Warszawa", lat: 52.1945, lng: 20.8832, zoom: 14 },
  { name: "Ursynów", type: "dzielnica", parent: "Warszawa", lat: 52.1545, lng: 21.0432, zoom: 13 },
  { name: "Wawer", type: "dzielnica", parent: "Warszawa", lat: 52.2005, lng: 21.1532, zoom: 13 },
  { name: "Wesoła", type: "dzielnica", parent: "Warszawa", lat: 52.2565, lng: 21.2232, zoom: 14 },
  { name: "Wilanów", type: "dzielnica", parent: "Warszawa", lat: 52.1645, lng: 21.0932, zoom: 13 },
  { name: "Włochy", type: "dzielnica", parent: "Warszawa", lat: 52.2005, lng: 20.9132, zoom: 14 },
  { name: "Wola", type: "dzielnica", parent: "Warszawa", lat: 52.2365, lng: 20.9632, zoom: 13 },
  { name: "Żoliborz", type: "dzielnica", parent: "Warszawa", lat: 52.2685, lng: 20.9832, zoom: 14 },
];

const PROPERTY_CATEGORIES = [
  { value: "mieszkanie", label: "Mieszkania" },
  { value: "dom", label: "Domy" },
  { value: "dzialka", label: "Działki" },
  { value: "lokal", label: "Lokale użytkowe" },
  { value: "pokoj", label: "Pokoje" },
  { value: "kawalerka", label: "Kawalerki" },
  { value: "rynek-pierwotny", label: "Rynek pierwotny" },
  { value: "hala-magazyn", label: "Hale i magazyny" },
];

const TRANSACTION_TYPES = [
  { value: "sprzedaz", label: "Sprzedaż" },
  { value: "wynajem", label: "Wynajem" },
  { value: "wynajem-krotkoterminowy", label: "Krótkoterminowy" },
];

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
  const districtPolygonsRef = useRef<google.maps.Polygon[]>([]);
  const circleRef = useRef<google.maps.Circle | null>(null);
  const isBrushDrawingRef = useRef(false);

  const [selectedListing, setSelectedListing] = useState<PropertyListingForMap | null>(null);
  const [previewPhotoIndex, setPreviewPhotoIndex] = useState(0);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [mobileTab, setMobileTab] = useState<"map" | "list">("map");

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [mapPropertyType, setMapPropertyType] = useState<string | null>(null);
  const [mapTransactionType, setMapTransactionType] = useState<string | null>(null);
  const [drawingMode, setDrawingMode] = useState<false | "pen" | "circle">(false);
  const [drawnArea, setDrawnArea] = useState<Array<{ lat: number; lng: number }> | null>(null);
  const [circleCenter, setCircleCenter] = useState<{ lat: number; lng: number } | null>(null);
  const [circleRadius, setCircleRadius] = useState(1000);
  const [bufferDistance, setBufferDistance] = useState(0);
  const [useBuffer, setUseBuffer] = useState(false);
  const [districtBoundaries, setDistrictBoundaries] = useState<Array<Array<{ lat: number; lng: number }>>>([]);
  const [selectedDistricts, setSelectedDistricts] = useState<string[]>([]);

  // Filtered listings
  const filteredListings = useMemo(() => {
    return listings.filter((l) => {
      if (!l.lat || !l.lng) return false;
      const listingType = l.propertyType?.toLowerCase() || "";
      const listingTitle = l.title?.toLowerCase() || "";
      if (mapPropertyType) {
        if (mapPropertyType === "hala-magazyn") {
          const isWarehouse = ["magazyn", "hala", "produkcja"].some(
            (v) => listingType.includes(v) || listingTitle.includes(v)
          );
          if (!isWarehouse) return false;
        } else if (mapPropertyType === "lokal") {
          const isLokal = ["lokal", "usługow", "handlow", "biuro"].some(
            (v) => listingType.includes(v) || listingTitle.includes(v)
          );
          if (!isLokal) return false;
        } else if (mapPropertyType === "rynek-pierwotny") {
          if (!(listingType.includes("inwestycja") || listingTitle.includes("inwestycja") || listingTitle.includes("deweloper"))) return false;
        } else if (!listingType.includes(mapPropertyType)) {
          return false;
        }
      }
      const transType = l.transactionType?.toLowerCase() || "";
      if (mapTransactionType === "sprzedaz" && !(transType.includes("sprzedaż") || transType.includes("sprzedaz"))) return false;
      if (mapTransactionType === "wynajem" && !transType.includes("wynajem")) return false;
      if (mapTransactionType === "wynajem-krotkoterminowy" && !(transType.includes("krótkoterminowy") || transType.includes("krotkoterminowy"))) return false;
      // District boundary filter (polygon-based, accurate) - supports multiple districts
      if (districtBoundaries.length > 0) {
        const inAnyDistrict = districtBoundaries.some(boundary => 
          boundary.length >= 3 && isPointInPolygon(l.lat, l.lng, boundary)
        );
        if (!inAnyDistrict) return false;
      } else if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const inLocation = l.location?.toLowerCase().includes(q);
        const inDistrict = l.district?.toLowerCase().includes(q);
        const inTitle = l.title?.toLowerCase().includes(q);
        const matchedSuggestion = LOCATION_DATA.find(
          (loc) => loc.name.toLowerCase() === q || `${loc.name}, ${loc.parent ?? ''}`.toLowerCase() === q
        );
        const fromSuggestion = matchedSuggestion
          ? l.location?.toLowerCase().includes(matchedSuggestion.name.toLowerCase()) || l.district?.toLowerCase().includes(matchedSuggestion.name.toLowerCase())
          : false;
        if (!inLocation && !inDistrict && !inTitle && !fromSuggestion) return false;
      }
      // Drawn polygon filter
      if (drawnArea && drawnArea.length >= 3) {
        if (!isPointInPolygon(l.lat, l.lng, drawnArea)) return false;
      }
      // Circle filter
      if (circleCenter) {
        const effectiveRadius = circleRadius + (useBuffer ? bufferDistance : 0);
        const dist = haversineDistance(circleCenter.lat, circleCenter.lng, l.lat, l.lng);
        if (dist > effectiveRadius) return false;
      }
      return true;
    });
  }, [listings, mapPropertyType, mapTransactionType, searchQuery, drawnArea, circleCenter, circleRadius, bufferDistance, useBuffer, districtBoundaries]);

  // Location suggestions
  const suggestions = useMemo(() => {
    if (!searchQuery || searchQuery.length < 1) return [];
    const q = searchQuery.toLowerCase();
    return LOCATION_DATA
      .filter((loc) => `${loc.name} ${loc.parent ?? ''}`.toLowerCase().includes(q))
      .slice(0, 12);
  }, [searchQuery]);

  // Pagination
  const [listPage, setListPage] = useState(1);
  const listPerPage = 7;
  const listTotalPages = Math.max(1, Math.ceil(filteredListings.length / listPerPage));
  const paginatedSideListings = useMemo(() => {
    const start = (listPage - 1) * listPerPage;
    return filteredListings.slice(start, start + listPerPage);
  }, [filteredListings, listPage]);

  useEffect(() => { setListPage(1); }, [filteredListings.length]);

  const formatPriceFull = (price: number) => price.toLocaleString("pl-PL") + "\u00A0zł";

  // === Supercluster ===
  useEffect(() => {
    const withCoords = listings.filter((l) => l.lat && l.lng);
    if (!withCoords.length) { clusterIndexRef.current = null; return; }
    const index = new Supercluster({ radius: 50, maxZoom: 18, minZoom: 3 });
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

  const createPriceMarker = useCallback((listing: PropertyListingForMap): HTMLDivElement => {
    const transType = listing.transactionType?.toLowerCase() || "";
    const isRentL = transType.includes("wynajem") || transType.includes("krótkoterminowy");
    const borderColor = isRentL ? "#3b82f6" : "#10b981";
    const div = document.createElement("div");
    div.style.cssText = "display:flex;flex-direction:column;align-items:center;transform:translate(-50%,-100%);cursor:pointer;";
    div.innerHTML = `<div style="background:white;color:#1a1a1a;padding:3px 8px;border-radius:6px;font-size:11px;font-weight:700;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,0.2);border:2px solid ${borderColor};">${formatPriceFull(listing.price)}</div><div style="width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;border-top:5px solid ${borderColor};margin-top:-1px;"></div>`;
    return div;
  }, []);

  const createClusterMarker = useCallback((count: number): HTMLDivElement => {
    const size = count > 100 ? 52 : count > 30 ? 44 : count > 10 ? 38 : 32;
    const fs = count > 100 ? 14 : count > 30 ? 13 : 12;
    const div = document.createElement("div");
    div.style.cssText = "display:flex;align-items:center;justify-content:center;transform:translate(-50%,-50%);cursor:pointer;";
    div.innerHTML = `<div style="width:${size}px;height:${size}px;border-radius:50%;background:linear-gradient(135deg,#7c3aed,#6d28d9);color:white;display:flex;align-items:center;justify-content:center;font-size:${fs}px;font-weight:700;box-shadow:0 3px 12px rgba(124,58,237,0.4),0 0 0 3px rgba(124,58,237,0.15);border:2px solid rgba(255,255,255,0.8);">${count}</div>`;
    return div;
  }, []);

  const showInfoWindow = useCallback(
    (_map: google.maps.Map, _iw: google.maps.InfoWindow, listing: PropertyListingForMap) => {
      // Only use React card overlay, no Google InfoWindow to avoid duplicates
      setSelectedListing(listing);
      setPreviewPhotoIndex(0);
      setHoveredId(listing.id);
      if (_map && listing.lat && listing.lng) {
        _map.panTo({ lat: listing.lat, lng: listing.lng });
      }
    },
    []
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
    const clusters = index.getClusters([sw.lng(), sw.lat(), ne.lng(), ne.lat()], Math.floor(zoom));
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
            setPreviewPhotoIndex(0);
            setHoveredId(listing.id);
            showInfoWindow(map, iw, listing);
          })
        );
      }
    });
  }, [google, createOverlayClass, createPriceMarker, createClusterMarker, showInfoWindow]);

  // Global handler
  useEffect(() => {
    (window as any).__ridoViewListing = (id: string) => { onViewListing?.(id); };
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
      drawingPolygonRef.current?.setMap(null);
      drawingPolylineRef.current?.setMap(null);
      districtPolygonsRef.current.forEach(p => p.setMap(null));
      districtPolygonsRef.current = [];
      circleRef.current?.setMap(null);
      mapRef.current = null;
    };
  }, [open, isLoaded, google, listings]);

  useEffect(() => {
    if (mapRef.current && google) updateMarkers();
  }, [updateMarkers, google]);

  // === Polygon drawing (works on both desktop and mobile) ===
  const startPolygonDrawing = useCallback(() => {
    if (!mapRef.current || !google) return;
    setDrawingMode("pen");
    setDrawnArea(null);
    setCircleCenter(null);
    circleRef.current?.setMap(null);
    drawingPolygonRef.current?.setMap(null);
    const map = mapRef.current;
    map.setOptions({ draggable: false, gestureHandling: "none" });
    const path: google.maps.LatLng[] = [];
    const polyline = new google.maps.Polyline({ map, path, strokeColor: "#7c3aed", strokeWeight: 3, strokeOpacity: 0.8 });
    drawingPolylineRef.current = polyline;
    isBrushDrawingRef.current = false;

    const startDraw = (latLng: google.maps.LatLng) => {
      isBrushDrawingRef.current = true;
      path.length = 0;
      path.push(latLng);
      polyline.setPath(path);
    };
    const continueDraw = (latLng: google.maps.LatLng) => {
      if (!isBrushDrawingRef.current) return;
      path.push(latLng);
      polyline.setPath(path);
    };
    const endDraw = () => {
      if (!isBrushDrawingRef.current) return;
      isBrushDrawingRef.current = false;
      cleanup();
      map.setOptions({ draggable: true, gestureHandling: "cooperative" });
      polyline.setMap(null);
      if (path.length < 3) { setDrawingMode(false); return; }
      const points = path.map((p) => ({ lat: p.lat(), lng: p.lng() }));
      const polygon = new google.maps.Polygon({
        map, paths: points,
        strokeColor: "#7c3aed", strokeWeight: 2, strokeOpacity: 0.9,
        fillColor: "#7c3aed", fillOpacity: 0.15,
      });
      drawingPolygonRef.current = polygon;
      setDrawnArea(points);
      setDrawingMode(false);
    };

    // Mouse events (desktop)
    const mouseDownListener = map.addListener("mousedown", (e: google.maps.MapMouseEvent) => {
      if (e.latLng) startDraw(e.latLng);
    });
    const mouseMoveListener = map.addListener("mousemove", (e: google.maps.MapMouseEvent) => {
      if (e.latLng) continueDraw(e.latLng);
    });
    const mouseUpListener = map.addListener("mouseup", endDraw);

    // Touch events on map container (mobile)
    const container = mapContainerRef.current;
    const getLatLngFromTouch = (touch: Touch): google.maps.LatLng | null => {
      if (!container || !map.getProjection()) return null;
      const rect = container.getBoundingClientRect();
      const x = touch.clientX - rect.left;
      const y = touch.clientY - rect.top;
      const scale = Math.pow(2, map.getZoom()!);
      const nw = map.getProjection()!.fromLatLngToPoint(map.getBounds()!.getNorthEast())!;
      const sw = map.getProjection()!.fromLatLngToPoint(map.getBounds()!.getSouthWest())!;
      const worldPoint = new google.maps.Point(
        sw.x + (x / rect.width) * (nw.x - sw.x),
        nw.y + (y / rect.height) * (sw.y - nw.y)
      );
      return map.getProjection()!.fromPointToLatLng(worldPoint);
    };

    const handleTouchStart = (e: TouchEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const latLng = getLatLngFromTouch(e.touches[0]);
      if (latLng) startDraw(latLng);
    };
    const handleTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const latLng = getLatLngFromTouch(e.touches[0]);
      if (latLng) continueDraw(latLng);
    };
    const handleTouchEnd = (e: TouchEvent) => {
      e.preventDefault();
      endDraw();
    };

    if (container) {
      container.addEventListener("touchstart", handleTouchStart, { passive: false });
      container.addEventListener("touchmove", handleTouchMove, { passive: false });
      container.addEventListener("touchend", handleTouchEnd, { passive: false });
    }

    const cleanup = () => {
      google.maps.event.removeListener(mouseDownListener);
      google.maps.event.removeListener(mouseMoveListener);
      google.maps.event.removeListener(mouseUpListener);
      if (container) {
        container.removeEventListener("touchstart", handleTouchStart);
        container.removeEventListener("touchmove", handleTouchMove);
        container.removeEventListener("touchend", handleTouchEnd);
      }
    };
  }, [google]);

  // === Circle drawing ===
  const startCircleDrawing = useCallback(() => {
    if (!mapRef.current || !google) return;
    setDrawingMode("circle");
    setDrawnArea(null);
    setCircleCenter(null);
    drawingPolygonRef.current?.setMap(null);
    circleRef.current?.setMap(null);
    const map = mapRef.current;
    const clickListener = map.addListener("click", (e: google.maps.MapMouseEvent) => {
      if (!e.latLng) return;
      google.maps.event.removeListener(clickListener);
      const center = { lat: e.latLng.lat(), lng: e.latLng.lng() };
      setCircleCenter(center);
      const circle = new google.maps.Circle({
        map, center, radius: circleRadius,
        strokeColor: "#7c3aed", strokeWeight: 2, strokeOpacity: 0.8,
        fillColor: "#7c3aed", fillOpacity: 0.1, editable: true,
      });
      circleRef.current = circle;
      circle.addListener("radius_changed", () => {
        setCircleRadius(Math.round(circle.getRadius()));
      });
      circle.addListener("center_changed", () => {
        const c = circle.getCenter();
        if (c) setCircleCenter({ lat: c.lat(), lng: c.lng() });
      });
      setDrawingMode(false);
    });
  }, [google, circleRadius]);

  const clearAllDrawing = useCallback(() => {
    drawingPolygonRef.current?.setMap(null);
    drawingPolygonRef.current = null;
    circleRef.current?.setMap(null);
    circleRef.current = null;
    setDrawnArea(null);
    setCircleCenter(null);
    setDrawingMode(false);
  }, []);

  // === Fetch district boundary (additive - supports multi-select) ===
  const addDistrictBoundary = useCallback(async (name: string, parent?: string) => {
    if (!google || !mapRef.current) return;
    try {
      const q = parent ? `${name}, ${parent}, Poland` : `${name}, Poland`;
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&polygon_geojson=1&limit=1`,
        { headers: { 'Accept-Language': 'pl' } }
      );
      const data = await res.json();
      if (!data[0]?.geojson) return;
      const geojson = data[0].geojson;
      let coords: google.maps.LatLngLiteral[][] = [];
      const extractCoords = (ring: number[][]) => ring.map(([lng, lat]) => ({ lat, lng }));
      if (geojson.type === 'Polygon') {
        coords = geojson.coordinates.map(extractCoords);
      } else if (geojson.type === 'MultiPolygon') {
        coords = geojson.coordinates.flatMap((poly: number[][][]) => poly.map(extractCoords));
      }
      if (coords.length === 0) return;

      // Add boundary for filtering
      const allPoints = coords.flat();
      setDistrictBoundaries(prev => [...prev, allPoints]);
      setSelectedDistricts(prev => [...prev, name]);

      // Rebuild inverted overlay for ALL selected districts
      // Remove old overlays
      districtPolygonsRef.current.forEach(p => p.setMap(null));
      districtPolygonsRef.current = [];

      // We need all coords for all districts - store them and rebuild
      // For now, add individual district polygon with inverted overlay
      const outerBounds = [
        { lat: -85, lng: -180 },
        { lat: -85, lng: 180 },
        { lat: 85, lng: 180 },
        { lat: 85, lng: -180 },
      ];

      // Get all boundaries including the new one
      setDistrictBoundaries(prev => {
        const allBoundaries = [...prev];
        // Rebuild single inverted polygon with all district holes
        const allCoordRings: google.maps.LatLngLiteral[][] = [];
        // We need the raw coords for each district - use a simpler approach
        // Just highlight each district boundary individually
        return allBoundaries;
      });

      // Create highlight polygon for this district (stroke only, to show the area)
      const highlightPolygon = new google.maps.Polygon({
        paths: coords, strokeColor: '#7c3aed', strokeWeight: 2, strokeOpacity: 0.8,
        fillColor: '#7c3aed', fillOpacity: 0.08, map: mapRef.current, clickable: false,
      });
      districtPolygonsRef.current.push(highlightPolygon);

      // Fit bounds to include all districts
      const bounds = new google.maps.LatLngBounds();
      coords.forEach(ring => ring.forEach(p => bounds.extend(p)));
      // Also extend to existing boundaries
      districtPolygonsRef.current.forEach(poly => {
        const path = poly.getPath();
        path.forEach(p => bounds.extend(p));
      });
      mapRef.current.fitBounds(bounds, 40);
    } catch (err) {
      console.warn('[FullscreenMap] Failed to fetch district boundary:', err);
    }
  }, [google]);

  const removeDistrictBoundary = useCallback((name: string) => {
    setSelectedDistricts(prev => prev.filter(d => d !== name));
    setDistrictBoundaries(prev => {
      const idx = selectedDistricts.indexOf(name);
      if (idx === -1) return prev;
      return prev.filter((_, i) => i !== idx);
    });
    // Remove corresponding polygon
    const idx = selectedDistricts.indexOf(name);
    if (idx >= 0 && districtPolygonsRef.current[idx]) {
      districtPolygonsRef.current[idx].setMap(null);
      districtPolygonsRef.current.splice(idx, 1);
    }
  }, [selectedDistricts]);

  const handleSelectLocation = (loc: typeof LOCATION_DATA[0]) => {
    setShowSuggestions(false);
    if (loc.type === 'dzielnica') {
      // Toggle district selection
      if (selectedDistricts.includes(loc.name)) {
        removeDistrictBoundary(loc.name);
      } else {
        addDistrictBoundary(loc.name, loc.parent);
      }
      setSearchQuery("");
    } else {
      setSearchQuery(loc.name);
      if (mapRef.current) {
        mapRef.current.setCenter({ lat: loc.lat, lng: loc.lng });
        mapRef.current.setZoom(loc.zoom);
      }
      // Clear district selections for city search
      districtPolygonsRef.current.forEach(p => p.setMap(null));
      districtPolygonsRef.current = [];
      setDistrictBoundaries([]);
      setSelectedDistricts([]);
    }
  };

  if (!open) return null;

  const hasActiveDrawing = !!(drawnArea || circleCenter);

  return (
    <div className="flex flex-col bg-background" style={{ height: 'calc(100vh - 80px)', minHeight: '500px' }}>

      {/* === TOOLBAR === */}
      <div className="shrink-0 border-b bg-card/80 backdrop-blur-sm px-4 py-2">
        <div className="max-w-[2000px] mx-auto flex items-center gap-3 flex-wrap">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Wpisz miasto lub dzielnicę..."
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setShowSuggestions(true); }}
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
              className="h-9 rounded-full border-border/80 bg-background pl-9 text-sm"
            />
            {showSuggestions && suggestions.length > 0 && (
              <div className="absolute top-full left-0 mt-1 w-full rounded-xl border bg-popover shadow-lg z-50 max-h-60 overflow-y-auto">
                {suggestions.map((loc) => {
                  const isSelected = loc.type === 'dzielnica' && selectedDistricts.includes(loc.name);
                  return (
                    <button
                      key={`${loc.type}-${loc.name}`}
                      onMouseDown={() => handleSelectLocation(loc)}
                      className={cn(
                        "flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent transition-colors",
                        isSelected && "bg-primary/10"
                      )}
                    >
                      {loc.type === 'dzielnica' ? (
                        <Checkbox checked={isSelected} className="h-3.5 w-3.5 pointer-events-none" />
                      ) : (
                        <MapPin className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      )}
                      <span className="font-medium">{loc.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {loc.type === 'dzielnica' ? `dzielnica, ${loc.parent}` : 'miasto'}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Selected districts chips */}
          {selectedDistricts.length > 0 && (
            <div className="flex items-center gap-1 flex-wrap">
              {selectedDistricts.map(name => (
                <span key={name} className="inline-flex items-center gap-1 bg-primary/10 text-primary text-xs px-2 py-1 rounded-full">
                  {name}
                  <button onClick={() => removeDistrictBoundary(name)} className="hover:text-destructive">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}

          <Button
            variant={drawingMode === "pen" ? "default" : "outline"}
            size="sm"
            className="rounded-full h-8 px-3 text-xs gap-1.5"
            onClick={drawingMode === "pen" ? () => setDrawingMode(false) : startPolygonDrawing}
          >
            <PenTool className="h-3.5 w-3.5" />
            Zaznacz
          </Button>
          <Button
            variant={drawingMode === "circle" ? "default" : "outline"}
            size="sm"
            className="rounded-full h-8 px-3 text-xs gap-1.5"
            onClick={drawingMode === "circle" ? () => setDrawingMode(false) : startCircleDrawing}
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

          {/* Buffer */}
          <div className="flex items-center gap-1.5">
            <Checkbox
              id="buffer-check"
              checked={useBuffer}
              onCheckedChange={(v) => setUseBuffer(!!v)}
              className="h-3.5 w-3.5"
            />
            <label htmlFor="buffer-check" className="text-xs text-muted-foreground cursor-pointer whitespace-nowrap">
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
        </div>
      </div>

      {/* Drawing mode banner */}
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

      {/* === MAP + LIST (fills remaining viewport) === */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* Map Panel */}
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

          {/* Circle info */}
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

          {/* Selected listing card overlay - click anywhere outside to close */}
          {selectedListing && (
            <>
              {/* Invisible backdrop to close on click */}
              <div 
                className="absolute inset-0 z-10" 
                onClick={() => setSelectedListing(null)}
              />
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 w-[340px] max-w-[90vw] bg-background rounded-xl shadow-2xl border overflow-hidden z-20">
                {/* Photo carousel */}
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
                    <span className="text-xs text-muted-foreground">{selectedListing.areaM2}m²</span>
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

        {/* List Panel */}
        <div
          className={cn(
           "border-l bg-background flex flex-col min-h-0",
            "hidden md:flex md:w-[280px] lg:w-[320px]",
            mobileTab === "list" && "!flex w-full md:!w-[280px]"
          )}
        >
          {/* List header with pagination */}
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

          {/* Scrollable list */}
          <div className="flex-1 overflow-hidden min-h-0">
            {paginatedSideListings.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Home className="h-10 w-10 text-muted-foreground/30 mb-2" />
                <p className="text-xs text-muted-foreground">Brak ogłoszeń w tym obszarze</p>
              </div>
            ) : (
              <div className="divide-y">
                {paginatedSideListings.map((listing) => (
                  <SideListingCard
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

// === Side listing card (compact) ===
function SideListingCard({
  listing, isSelected, isHovered, onMouseEnter, onMouseLeave, onClick, onView,
}: {
  listing: PropertyListingForMap;
  isSelected: boolean;
  isHovered?: boolean;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  onClick: () => void;
  onView?: () => void;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const transType = listing.transactionType?.toLowerCase() || "";
  const isRent = transType.includes("wynajem") || transType.includes("krótkoterminowy");

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
            <Home className="h-3.5 w-3.5 text-muted-foreground/40" />
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <h4 className="text-xs font-medium leading-snug line-clamp-1">{listing.title}</h4>
        <div className="flex items-center gap-1 mt-0.5">
          <div className={cn("w-1.5 h-1.5 rounded-full shrink-0", isRent ? "bg-blue-500" : "bg-emerald-500")} />
          <span className="text-[11px] text-muted-foreground truncate">{listing.location}</span>
        </div>
        <div className="mt-0.5 flex items-center justify-between gap-1">
          <span className="font-bold text-xs text-primary whitespace-nowrap">
            {listing.price.toLocaleString("pl-PL")}{"\u00A0"}zł
          </span>
          <span className="text-[11px] text-muted-foreground whitespace-nowrap">
            {listing.areaM2}m²
          </span>
        </div>
      </div>
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

// === Utility: Haversine distance in meters ===
function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
