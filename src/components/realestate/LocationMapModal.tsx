import { useState, useRef, useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useGoogleMaps } from "@/hooks/useGoogleMaps";
import { LocationSearchInput, LocationSelection, AreaSelection } from "./LocationSearchInput";
import { 
  Circle, Pentagon, Trash2, Check, Loader2, MapPin, RefreshCw, AlertCircle, X
} from "lucide-react";

interface LocationMapModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialCenter?: { lat: number; lng: number };
  initialArea?: AreaSelection | null;
  onConfirm: (area: AreaSelection | null) => void;
}

const DEFAULT_CENTER = { lat: 52.2297, lng: 21.0122 }; // Warsaw
const DEFAULT_RADIUS = 300; // 300m - default for local search
const MIN_RADIUS = 100;
const MAX_RADIUS = 50000;

export function LocationMapModal({
  open,
  onOpenChange,
  initialCenter,
  initialArea,
  onConfirm,
}: LocationMapModalProps) {
  const { isLoaded, error, isTimedOut, retryLoad, google } = useGoogleMaps();
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const circleRef = useRef<google.maps.Circle | null>(null);
  const polygonRef = useRef<google.maps.Polygon | null>(null);
  const markerRef = useRef<google.maps.Marker | null>(null);
  
  // Custom polygon drawing refs (no DrawingManager)
  const tempPolygonRef = useRef<google.maps.Polygon | null>(null);
  const tempMarkersRef = useRef<google.maps.Marker[]>([]);

  const [mode, setMode] = useState<"circle" | "polygon">("circle");
  const [circleCenter, setCircleCenter] = useState<{ lat: number; lng: number } | null>(null);
  const [radius, setRadius] = useState(DEFAULT_RADIUS);
  const [radiusInput, setRadiusInput] = useState(DEFAULT_RADIUS.toString());
  const [polygonPoints, setPolygonPoints] = useState<Array<{ lat: number; lng: number }>>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [searchLocation, setSearchLocation] = useState("");
  
  // Custom drawing state
  const [drawingPoints, setDrawingPoints] = useState<Array<{ lat: number; lng: number }>>([]);

  // Check if the error is a configuration error
  const isConfigError = error && (error as any).isConfigError;

  // Handler for location search selection
  const handleLocationSelect = useCallback((location: LocationSelection) => {
    setSearchLocation(location.text);
    if (location.lat && location.lng && mapInstanceRef.current) {
      const center = { lat: location.lat, lng: location.lng };
      mapInstanceRef.current.setCenter(center);
      mapInstanceRef.current.setZoom(14);
      // In circle mode - automatically set center
      if (mode === "circle") {
        setCircleCenter(center);
      }
    }
  }, [mode]);

  // Initialize map ONLY when modal is open and container has proper dimensions
  useEffect(() => {
    if (!open || !isLoaded || !google) return;

    let initAttempt = 0;
    let initTimeout: ReturnType<typeof setTimeout>;
    let mapCreated = false;

    const tryInitMap = () => {
      console.log('[LocationMapModal] tryInitMap called');
      const container = mapRef.current;
      if (!container || mapCreated) return;

      const width = container.offsetWidth;
      const height = container.offsetHeight;
      console.log(`[LocationMapModal] Init attempt ${initAttempt + 1}: ${width}x${height}px`);

      // Require minimum 100x100px
      if (width < 100 || height < 100) {
        initAttempt++;
        if (initAttempt < 10) {
          initTimeout = setTimeout(tryInitMap, 100 * initAttempt);
        } else {
          console.error("[Map Init] Failed after 10 attempts - container too small");
        }
        return;
      }

      mapCreated = true;
      const center = initialCenter || DEFAULT_CENTER;

      // Create map without mapId to avoid configuration conflicts
      const map = new google.maps.Map(container, {
        center,
        zoom: 12,
        disableDefaultUI: false,
        zoomControl: true,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: true,
        gestureHandling: 'greedy',
        draggable: true,
      });

      mapInstanceRef.current = map;
      console.log("[LocationMapModal] Map created successfully!");

      // Initialize with existing area
      if (initialArea?.type === "circle" && initialArea.circle) {
        setMode("circle");
        setCircleCenter({ lat: initialArea.circle.centerLat, lng: initialArea.circle.centerLng });
        setRadius(initialArea.circle.radiusMeters);
        setRadiusInput(initialArea.circle.radiusMeters.toString());
        map.setCenter({ lat: initialArea.circle.centerLat, lng: initialArea.circle.centerLng });
      } else if (initialArea?.type === "polygon" && initialArea.polygon) {
        setMode("polygon");
        setPolygonPoints(initialArea.polygon.points);
      }

      // Force resize and setCenter after initialization
      setTimeout(() => {
        if (mapInstanceRef.current && google) {
          google.maps.event.trigger(mapInstanceRef.current, 'resize');
          mapInstanceRef.current.setCenter(center);
        }
      }, 100);
    };

    // Start initialization after 50ms (wait for modal to fully open)
    initTimeout = setTimeout(tryInitMap, 50);

    return () => {
      clearTimeout(initTimeout);
      circleRef.current?.setMap(null);
      polygonRef.current?.setMap(null);
      tempPolygonRef.current?.setMap(null);
      tempMarkersRef.current.forEach(m => m.setMap(null));
      markerRef.current = null;
    };
  }, [open, isLoaded, google, initialCenter]);

  // Force resize and setCenter when modal opens - with saved center
  useEffect(() => {
    if (!open || !mapInstanceRef.current || !google) return;

    // Save current center before resize
    const savedCenter = mapInstanceRef.current.getCenter() || new google.maps.LatLng(DEFAULT_CENTER.lat, DEFAULT_CENTER.lng);

    // Force redraw at multiple intervals after modal opens
    const resizes = [50, 100, 200, 400, 800].map(delay =>
      setTimeout(() => {
        if (mapInstanceRef.current) {
          google.maps.event.trigger(mapInstanceRef.current, 'resize');
          mapInstanceRef.current.setCenter(savedCenter);
        }
      }, delay)
    );

    const handleResize = () => {
      if (mapInstanceRef.current) {
        const center = mapInstanceRef.current.getCenter();
        google.maps.event.trigger(mapInstanceRef.current, 'resize');
        if (center) mapInstanceRef.current.setCenter(center);
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      resizes.forEach(clearTimeout);
      window.removeEventListener('resize', handleResize);
    };
  }, [open, google]);

  // Update click listener when mode or drawing state changes
  useEffect(() => {
    if (!mapInstanceRef.current || !google) return;

    const map = mapInstanceRef.current;
    google.maps.event.clearListeners(map, "click");

    map.addListener("click", (e: google.maps.MapMouseEvent) => {
      if (!e.latLng) return;

      // Circle mode - set center on click
      if (mode === "circle") {
        setCircleCenter({ lat: e.latLng.lat(), lng: e.latLng.lng() });
        return;
      }

      // Polygon mode with active drawing
      if (mode === "polygon" && isDrawing) {
        const newPoint = { lat: e.latLng.lat(), lng: e.latLng.lng() };

        // Check if clicking near first point to close polygon (20m tolerance)
        if (drawingPoints.length >= 3) {
          const firstPoint = drawingPoints[0];
          const distance = google.maps.geometry?.spherical?.computeDistanceBetween(
            new google.maps.LatLng(newPoint.lat, newPoint.lng),
            new google.maps.LatLng(firstPoint.lat, firstPoint.lng)
          );
          if (distance && distance < 30) {
            handleFinishDrawing();
            return;
          }
        }

        // Add point to drawing
        setDrawingPoints(prev => {
          const updated = [...prev, newPoint];
          console.log('[LocationMapModal] Point added:', newPoint, 'Total points:', updated.length);
          
          // Update temp polygon visualization
          if (tempPolygonRef.current) {
            tempPolygonRef.current.setPath(updated);
          } else if (updated.length >= 2 && mapInstanceRef.current) {
            tempPolygonRef.current = new google.maps.Polygon({
              map: mapInstanceRef.current,
              paths: updated,
              fillColor: "#3b82f6",
              fillOpacity: 0.15,
              strokeColor: "#3b82f6",
              strokeWeight: 2,
              strokeOpacity: 0.9,
              editable: false,
              draggable: false,
            });
          }

          // Add marker for the point (classic Marker - works without mapId)
          if (mapInstanceRef.current) {
            const marker = new google.maps.Marker({
              map: mapInstanceRef.current,
              position: newPoint,
              title: updated.length === 1 ? "Punkt startowy (kliknij aby zamknąć)" : `Punkt ${updated.length}`,
              icon: {
                path: google.maps.SymbolPath.CIRCLE,
                scale: 8,
                fillColor: "#3b82f6",
                fillOpacity: 1,
                strokeColor: "#ffffff",
                strokeWeight: 2,
              },
              clickable: false,
              optimized: true,
            });
            tempMarkersRef.current.push(marker);
            console.log('[LocationMapModal] Marker created at:', newPoint);
          }

          return updated;
        });
      }
    });
  }, [mode, google, isDrawing, drawingPoints.length]);

  // Draw/update circle
  useEffect(() => {
    if (!mapInstanceRef.current || !google || mode !== "circle") {
      circleRef.current?.setMap(null);
      return;
    }

    if (!circleCenter) return;

    if (circleRef.current) {
      circleRef.current.setCenter(circleCenter);
      circleRef.current.setRadius(radius);
    } else {
      circleRef.current = new google.maps.Circle({
        map: mapInstanceRef.current,
        center: circleCenter,
        radius,
        fillColor: "#3b82f6",
        fillOpacity: 0.2,
        strokeColor: "#3b82f6",
        strokeWeight: 2,
        editable: true,
        draggable: true,
      });

      // Listen for edits
      google.maps.event.addListener(circleRef.current, "center_changed", () => {
        const center = circleRef.current?.getCenter();
        if (center) {
          setCircleCenter({ lat: center.lat(), lng: center.lng() });
        }
      });

      google.maps.event.addListener(circleRef.current, "radius_changed", () => {
        const r = circleRef.current?.getRadius();
        if (r) {
          const rounded = Math.round(r);
          setRadius(rounded);
          setRadiusInput(rounded.toString());
        }
      });
    }
  }, [circleCenter, radius, mode, google]);

  // Handle polygon mode - draw existing polygon
  useEffect(() => {
    if (!google || !mapInstanceRef.current) return;

    if (mode === "polygon") {
      circleRef.current?.setMap(null);
      
      // If we have existing polygon points and not drawing, draw them
      if (polygonPoints.length > 0 && !polygonRef.current && !isDrawing) {
        polygonRef.current = new google.maps.Polygon({
          map: mapInstanceRef.current,
          paths: polygonPoints,
          fillColor: "#3b82f6",
          fillOpacity: 0.2,
          strokeColor: "#3b82f6",
          strokeWeight: 2,
          editable: true,
          draggable: true,
        });

        const path = polygonRef.current.getPath();
        google.maps.event.addListener(path, "set_at", () => updatePolygonPoints(polygonRef.current!));
        google.maps.event.addListener(path, "insert_at", () => updatePolygonPoints(polygonRef.current!));
      }
    } else {
      polygonRef.current?.setMap(null);
      polygonRef.current = null;
      setIsDrawing(false);
      setDrawingPoints([]);
      cleanupTempDrawing();
    }
  }, [mode, google, polygonPoints.length, isDrawing]);

  const updatePolygonPoints = (polygon: google.maps.Polygon) => {
    const path = polygon.getPath();
    const points: Array<{ lat: number; lng: number }> = [];
    for (let i = 0; i < path.getLength(); i++) {
      const point = path.getAt(i);
      points.push({ lat: point.lat(), lng: point.lng() });
    }
    setPolygonPoints(points);
  };

  const cleanupTempDrawing = () => {
    tempPolygonRef.current?.setMap(null);
    tempPolygonRef.current = null;
    // Classic Marker uses setMap(null) method
    tempMarkersRef.current.forEach(m => m.setMap(null));
    tempMarkersRef.current = [];
    console.log('[LocationMapModal] Temp drawing cleaned up');
  };

  // Start drawing - DISABLE map drag
  const handleStartDrawing = () => {
    console.log('[LocationMapModal] handleStartDrawing - disabling map drag');
    if (polygonRef.current) {
      polygonRef.current.setMap(null);
      polygonRef.current = null;
    }
    setPolygonPoints([]);
    setDrawingPoints([]);
    cleanupTempDrawing();
    setIsDrawing(true);

    // DISABLE map dragging during drawing
    if (mapInstanceRef.current) {
      mapInstanceRef.current.setOptions({
        draggable: false,
        gestureHandling: 'none',
        scrollwheel: false,
      });
      console.log('[LocationMapModal] Drawing mode activated, draggable disabled');
    }
  };

  // Finish drawing - RESTORE map drag
  const handleFinishDrawing = useCallback(() => {
    console.log('[LocationMapModal] handleFinishDrawing - restoring map controls');
    if (!google || !mapInstanceRef.current) return;

    // RESTORE normal map controls
    mapInstanceRef.current.setOptions({
      draggable: true,
      gestureHandling: 'greedy',
      scrollwheel: true,
    });

    if (drawingPoints.length >= 3) {
      console.log('[LocationMapModal] Polygon created with', drawingPoints.length, 'points');
      setPolygonPoints([...drawingPoints]);

      // Create final editable polygon
      polygonRef.current = new google.maps.Polygon({
        map: mapInstanceRef.current,
        paths: drawingPoints,
        fillColor: "#3b82f6",
        fillOpacity: 0.2,
        strokeColor: "#3b82f6",
        strokeWeight: 2,
        editable: true,
        draggable: true,
      });

      const path = polygonRef.current.getPath();
      google.maps.event.addListener(path, "set_at", () => updatePolygonPoints(polygonRef.current!));
      google.maps.event.addListener(path, "insert_at", () => updatePolygonPoints(polygonRef.current!));
    }

    // Cleanup temp drawing
    cleanupTempDrawing();
    setDrawingPoints([]);
    setIsDrawing(false);
  }, [google, drawingPoints]);

  // Cancel drawing
  const handleCancelDrawing = () => {
    if (mapInstanceRef.current) {
      mapInstanceRef.current.setOptions({
        draggable: true,
        gestureHandling: 'greedy',
        scrollwheel: true,
      });
    }
    cleanupTempDrawing();
    setDrawingPoints([]);
    setIsDrawing(false);
  };

  const handleClear = () => {
    circleRef.current?.setMap(null);
    circleRef.current = null;
    polygonRef.current?.setMap(null);
    polygonRef.current = null;
    cleanupTempDrawing();
    setCircleCenter(null);
    setPolygonPoints([]);
    setDrawingPoints([]);
    setRadius(DEFAULT_RADIUS);
    setRadiusInput(DEFAULT_RADIUS.toString());
    setIsDrawing(false);
  };

  const handleRadiusInputChange = (value: string) => {
    setRadiusInput(value);
    const num = parseInt(value);
    if (!isNaN(num) && num >= MIN_RADIUS && num <= MAX_RADIUS) {
      setRadius(num);
    }
  };

  const handleConfirm = () => {
    if (mode === "circle" && circleCenter) {
      onConfirm({
        type: "circle",
        circle: {
          centerLat: circleCenter.lat,
          centerLng: circleCenter.lng,
          radiusMeters: radius,
        },
      });
    } else if (mode === "polygon" && polygonPoints.length >= 3) {
      const lats = polygonPoints.map(p => p.lat);
      const lngs = polygonPoints.map(p => p.lng);
      onConfirm({
        type: "polygon",
        polygon: {
          points: polygonPoints,
          boundingBox: {
            north: Math.max(...lats),
            south: Math.min(...lats),
            east: Math.max(...lngs),
            west: Math.min(...lngs),
          },
        },
      });
    } else {
      onConfirm(null);
    }
    onOpenChange(false);
  };

  const hasValidArea = (mode === "circle" && circleCenter) || (mode === "polygon" && polygonPoints.length >= 3);

  const formatRadius = (r: number) => {
    if (r >= 1000) {
      return `${(r / 1000).toFixed(1)} km`;
    }
    return `${r} m`;
  };

  // Render error state
  const renderErrorState = () => {
    if (isConfigError) {
      return (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-muted gap-3 p-4">
          <AlertCircle className="h-10 w-10 text-amber-500" />
          <p className="text-lg font-medium text-center">Google Maps nie jest skonfigurowany</p>
          <p className="text-sm text-muted-foreground text-center max-w-md">
            Aby korzystać z mapy, dodaj klucz API w:
            <br />
            <strong>Admin → Ustawienia → Integracje lokalizacji</strong>
          </p>
        </div>
      );
    }

    if (isTimedOut) {
      return (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-muted gap-3 p-4">
          <AlertCircle className="h-10 w-10 text-destructive" />
          <p className="text-lg font-medium text-center">Nie udało się wczytać mapy</p>
          <p className="text-sm text-muted-foreground text-center max-w-md">
            Przekroczono czas oczekiwania. Sprawdź połączenie internetowe i spróbuj ponownie.
          </p>
          <Button onClick={retryLoad} variant="outline" className="gap-2">
            <RefreshCw className="h-4 w-4" />
            Ponów ładowanie
          </Button>
        </div>
      );
    }

    if (error) {
      return (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-muted gap-3 p-4">
          <AlertCircle className="h-10 w-10 text-destructive" />
          <p className="text-lg font-medium text-center">Błąd ładowania mapy</p>
          <p className="text-sm text-muted-foreground text-center max-w-md">{error.message}</p>
          <Button onClick={retryLoad} variant="outline" className="gap-2">
            <RefreshCw className="h-4 w-4" />
            Ponów ładowanie
          </Button>
        </div>
      );
    }

    return null;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl h-[85vh] flex flex-col p-0">
        <DialogHeader className="p-4 pb-2">
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-primary" />
            Wybierz obszar na mapie
          </DialogTitle>
        </DialogHeader>

        {/* Controls Row - Location + Mode + Radius */}
        <div className="px-4 pb-3">
          <div className="flex flex-wrap items-center gap-3 border rounded-lg p-3 bg-muted/30">
            {/* Location Search */}
            <div className="flex-1 min-w-[200px]">
              <LocationSearchInput
                value={searchLocation}
                onChange={setSearchLocation}
                onLocationSelect={handleLocationSelect}
                placeholder="Wpisz miasto, dzielnicę..."
              />
            </div>
            
            {/* Mode Selector */}
            <Tabs value={mode} onValueChange={(v) => setMode(v as "circle" | "polygon")}>
              <TabsList className="h-9">
                <TabsTrigger value="circle" className="gap-1 px-3 h-8">
                  <Circle className="h-3 w-3" />
                  Okrąg
                </TabsTrigger>
                <TabsTrigger value="polygon" className="gap-1 px-3 h-8">
                  <Pentagon className="h-3 w-3" />
                  Własny obszar
                </TabsTrigger>
              </TabsList>
            </Tabs>
            
            {/* Radius Input (only for circle mode) */}
            {mode === "circle" && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground whitespace-nowrap">Promień:</span>
                <Input
                  type="number"
                  value={radiusInput}
                  onChange={(e) => handleRadiusInputChange(e.target.value)}
                  className="w-20 h-9"
                  min={MIN_RADIUS}
                  max={MAX_RADIUS}
                />
                <span className="text-sm text-muted-foreground">m</span>
              </div>
            )}
            
            {/* Draw/Finish Buttons (only for polygon mode) */}
            {mode === "polygon" && !isDrawing && (
              <Button size="sm" variant="outline" onClick={handleStartDrawing} disabled={!isLoaded} className="h-9">
                <Pentagon className="h-4 w-4 mr-1" />
                Rysuj
              </Button>
            )}
            
            {mode === "polygon" && isDrawing && (
              <div className="flex gap-2">
                <Button 
                  size="sm" 
                  variant="default" 
                  onClick={handleFinishDrawing}
                  disabled={drawingPoints.length < 3}
                  className="h-9"
                >
                  <Check className="h-4 w-4 mr-1" />
                  Zamknij ({drawingPoints.length} pkt)
                </Button>
                <Button 
                  size="sm" 
                  variant="ghost" 
                  onClick={handleCancelDrawing}
                  className="h-9"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Instruction Line */}
        <div className="px-4 pb-2">
          <p className="text-xs text-muted-foreground">
            {mode === "circle" 
              ? (circleCenter 
                  ? `✓ Wybrany obszar: ${formatRadius(radius)}` 
                  : "Kliknij na mapie lub wyszukaj lokalizację aby wybrać środek okręgu")
              : (isDrawing 
                  ? `Kliknij punkty na mapie (${drawingPoints.length}/min.3), zamknij klikając pierwszy punkt lub przycisk "Zamknij"` 
                  : polygonPoints.length >= 3 
                    ? `✓ Obszar narysowany (${polygonPoints.length} punktów)`
                    : "Kliknij 'Rysuj' aby narysować własny obszar")
            }
          </p>
        </div>

        {/* Map - explicit dimensions to ensure proper rendering */}
        <div 
          className="relative mx-4 mb-4 rounded-lg overflow-hidden border flex-1"
          style={{ 
            width: 'calc(100% - 2rem)', 
            minHeight: '460px'
          }}
        >
          {!isLoaded && !error ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-muted gap-2" style={{ minHeight: '460px' }}>
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Ładowanie Google Maps...</p>
            </div>
          ) : error || isTimedOut ? (
            renderErrorState()
          ) : (
            <div 
              ref={mapRef} 
              style={{ width: '100%', height: '100%', minHeight: '460px' }}
            />
          )}
        </div>

        {/* Actions */}
        <div className="p-4 pt-0 flex items-center justify-between border-t bg-muted/50">
          <Button
            variant="outline"
            onClick={handleClear}
            disabled={!hasValidArea && !isDrawing}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Wyczyść obszar
          </Button>

          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Anuluj
            </Button>
            <Button onClick={handleConfirm} disabled={!hasValidArea}>
              <Check className="h-4 w-4 mr-2" />
              Zatwierdź
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
