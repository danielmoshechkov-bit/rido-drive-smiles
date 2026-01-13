import { useState, useRef, useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { useGoogleMaps } from "@/hooks/useGoogleMaps";
import { AreaSelection } from "./LocationSearchInput";
import { 
  Circle, Pentagon, Trash2, Check, Loader2, MapPin, RefreshCw, AlertCircle
} from "lucide-react";

interface LocationMapModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialCenter?: { lat: number; lng: number };
  initialArea?: AreaSelection | null;
  onConfirm: (area: AreaSelection | null) => void;
}

const DEFAULT_CENTER = { lat: 52.2297, lng: 21.0122 }; // Warsaw
const DEFAULT_RADIUS = 3000; // 3km
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
  const drawingManagerRef = useRef<google.maps.drawing.DrawingManager | null>(null);
  const markerRef = useRef<google.maps.marker.AdvancedMarkerElement | null>(null);

  const [mode, setMode] = useState<"circle" | "polygon">("circle");
  const [circleCenter, setCircleCenter] = useState<{ lat: number; lng: number } | null>(null);
  const [radius, setRadius] = useState(DEFAULT_RADIUS);
  const [radiusInput, setRadiusInput] = useState(DEFAULT_RADIUS.toString());
  const [polygonPoints, setPolygonPoints] = useState<Array<{ lat: number; lng: number }>>([]);
  const [isDrawing, setIsDrawing] = useState(false);

  // Check if the error is a configuration error
  const isConfigError = error && (error as any).isConfigError;

  // Initialize map
  useEffect(() => {
    if (!open || !isLoaded || !mapRef.current || !google) return;

    const center = initialCenter || DEFAULT_CENTER;

    const map = new google.maps.Map(mapRef.current, {
      center,
      zoom: 12,
      mapId: "location-picker-map",
      disableDefaultUI: false,
      zoomControl: true,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: true,
    });

    mapInstanceRef.current = map;

    // Initialize DrawingManager for polygon mode
    const drawingManager = new google.maps.drawing.DrawingManager({
      drawingMode: null,
      drawingControl: false,
      polygonOptions: {
        fillColor: "#3b82f6",
        fillOpacity: 0.2,
        strokeColor: "#3b82f6",
        strokeWeight: 2,
        editable: true,
        draggable: true,
      },
    });

    drawingManager.setMap(map);
    drawingManagerRef.current = drawingManager;

    // Handle polygon complete
    google.maps.event.addListener(drawingManager, "polygoncomplete", (polygon: google.maps.Polygon) => {
      // Remove previous polygon
      if (polygonRef.current) {
        polygonRef.current.setMap(null);
      }
      polygonRef.current = polygon;
      setIsDrawing(false);
      drawingManager.setDrawingMode(null);

      // Extract points
      const path = polygon.getPath();
      const points: Array<{ lat: number; lng: number }> = [];
      for (let i = 0; i < path.getLength(); i++) {
        const point = path.getAt(i);
        points.push({ lat: point.lat(), lng: point.lng() });
      }
      setPolygonPoints(points);

      // Update on edit
      google.maps.event.addListener(path, "set_at", () => updatePolygonPoints(polygon));
      google.maps.event.addListener(path, "insert_at", () => updatePolygonPoints(polygon));
    });

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

    // Click to set circle center
    map.addListener("click", (e: google.maps.MapMouseEvent) => {
      if (mode === "circle" && e.latLng) {
        setCircleCenter({ lat: e.latLng.lat(), lng: e.latLng.lng() });
      }
    });

    return () => {
      circleRef.current?.setMap(null);
      polygonRef.current?.setMap(null);
      drawingManagerRef.current?.setMap(null);
      markerRef.current = null;
    };
  }, [open, isLoaded, google, initialCenter]);

  // Update click listener when mode changes
  useEffect(() => {
    if (!mapInstanceRef.current || !google) return;

    const map = mapInstanceRef.current;
    google.maps.event.clearListeners(map, "click");

    map.addListener("click", (e: google.maps.MapMouseEvent) => {
      if (mode === "circle" && e.latLng) {
        setCircleCenter({ lat: e.latLng.lat(), lng: e.latLng.lng() });
      }
    });
  }, [mode, google]);

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

  // Handle polygon mode
  useEffect(() => {
    if (!drawingManagerRef.current || !google) return;

    if (mode === "polygon") {
      circleRef.current?.setMap(null);
      
      // If we have existing polygon points, draw them
      if (polygonPoints.length > 0 && !polygonRef.current) {
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
      drawingManagerRef.current.setDrawingMode(null);
      setIsDrawing(false);
    }
  }, [mode, google, polygonPoints.length]);

  const updatePolygonPoints = (polygon: google.maps.Polygon) => {
    const path = polygon.getPath();
    const points: Array<{ lat: number; lng: number }> = [];
    for (let i = 0; i < path.getLength(); i++) {
      const point = path.getAt(i);
      points.push({ lat: point.lat(), lng: point.lng() });
    }
    setPolygonPoints(points);
  };

  const handleStartDrawing = () => {
    if (polygonRef.current) {
      polygonRef.current.setMap(null);
      polygonRef.current = null;
    }
    setPolygonPoints([]);
    setIsDrawing(true);
    drawingManagerRef.current?.setDrawingMode(google!.maps.drawing.OverlayType.POLYGON);
  };

  const handleClear = () => {
    circleRef.current?.setMap(null);
    circleRef.current = null;
    polygonRef.current?.setMap(null);
    polygonRef.current = null;
    setCircleCenter(null);
    setPolygonPoints([]);
    setRadius(DEFAULT_RADIUS);
    setRadiusInput(DEFAULT_RADIUS.toString());
  };

  const handleRadiusInputChange = (value: string) => {
    setRadiusInput(value);
    const num = parseInt(value);
    if (!isNaN(num) && num >= MIN_RADIUS && num <= MAX_RADIUS) {
      setRadius(num);
    }
  };

  const handleRadiusSliderChange = (value: number[]) => {
    const r = value[0];
    setRadius(r);
    setRadiusInput(r.toString());
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

        {/* Mode Selector */}
        <div className="px-4 pb-2">
          <Tabs value={mode} onValueChange={(v) => setMode(v as "circle" | "polygon")}>
            <TabsList className="grid grid-cols-2 w-full max-w-xs">
              <TabsTrigger value="circle" className="gap-2">
                <Circle className="h-4 w-4" />
                Okrąg
              </TabsTrigger>
              <TabsTrigger value="polygon" className="gap-2">
                <Pentagon className="h-4 w-4" />
                Własny obszar
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* Instructions */}
        <div className="px-4 pb-2">
          {mode === "circle" ? (
            <p className="text-sm text-muted-foreground">
              Kliknij na mapie, aby wybrać środek okręgu, następnie ustaw promień.
            </p>
          ) : (
            <div className="flex items-center gap-2">
              <p className="text-sm text-muted-foreground flex-1">
                {isDrawing 
                  ? "Kliknij na mapie, aby dodać punkty. Zamknij obszar klikając pierwszy punkt."
                  : "Narysuj własny obszar wyszukiwania."
                }
              </p>
              {!isDrawing && (
                <Button size="sm" variant="outline" onClick={handleStartDrawing} disabled={!isLoaded}>
                  <Pentagon className="h-4 w-4 mr-2" />
                  Rysuj obszar
                </Button>
              )}
            </div>
          )}
        </div>

        {/* Circle Radius Controls */}
        {mode === "circle" && circleCenter && (
          <div className="px-4 pb-2 space-y-2">
            <div className="flex items-center gap-4">
              <Label className="text-sm whitespace-nowrap">Promień:</Label>
              <Slider
                value={[radius]}
                onValueChange={handleRadiusSliderChange}
                min={MIN_RADIUS}
                max={MAX_RADIUS}
                step={100}
                className="flex-1"
              />
              <div className="flex items-center gap-1">
                <Input
                  type="number"
                  value={radiusInput}
                  onChange={(e) => handleRadiusInputChange(e.target.value)}
                  className="w-24 h-8"
                  min={MIN_RADIUS}
                  max={MAX_RADIUS}
                />
                <span className="text-sm text-muted-foreground">m</span>
              </div>
            </div>
            <Badge variant="secondary" className="gap-1">
              <Circle className="h-3 w-3" />
              {formatRadius(radius)}
            </Badge>
          </div>
        )}

        {/* Map */}
        <div className="flex-1 relative mx-4 mb-4 rounded-lg overflow-hidden border">
          {!isLoaded && !error ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-muted gap-2">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Ładowanie Google Maps...</p>
            </div>
          ) : error || isTimedOut ? (
            renderErrorState()
          ) : (
            <div ref={mapRef} className="absolute inset-0" />
          )}
        </div>

        {/* Actions */}
        <div className="p-4 pt-0 flex items-center justify-between border-t bg-muted/50">
          <Button
            variant="outline"
            onClick={handleClear}
            disabled={!hasValidArea}
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
