import { useState, useRef, useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { useGoogleMaps } from "@/hooks/useGoogleMaps";
import { LocationSearchInput, LocationSelection, AreaSelection } from "./LocationSearchInput";
import { 
  Circle, PenTool, Trash2, Check, Loader2, MapPin, RefreshCw, AlertCircle, X, Paintbrush
} from "lucide-react";

interface PropertyListingForMap {
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

interface LocationMapModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialCenter?: { lat: number; lng: number };
  initialArea?: AreaSelection | null;
  onConfirm: (area: AreaSelection | null) => void;
  listings?: PropertyListingForMap[];
  onViewListing?: (id: string) => void;
}

type DrawingMode = "points" | "brush";

const DEFAULT_CENTER = { lat: 52.2297, lng: 21.0122 }; // Warsaw - fallback only
const DEFAULT_RADIUS = 1000; // 1000m - default for local search
const MIN_RADIUS = 100;
const MAX_RADIUS = 50000;

// Douglas-Peucker algorithm for polygon simplification
function simplifyPolygon(points: Array<{ lat: number; lng: number }>, tolerance: number): Array<{ lat: number; lng: number }> {
  if (points.length <= 2) return points;

  // Find the point with the maximum distance
  let maxDist = 0;
  let maxIndex = 0;
  const end = points.length - 1;

  for (let i = 1; i < end; i++) {
    const dist = perpendicularDistance(points[i], points[0], points[end]);
    if (dist > maxDist) {
      maxDist = dist;
      maxIndex = i;
    }
  }

  // If max distance is greater than tolerance, recursively simplify
  if (maxDist > tolerance) {
    const left = simplifyPolygon(points.slice(0, maxIndex + 1), tolerance);
    const right = simplifyPolygon(points.slice(maxIndex), tolerance);
    return [...left.slice(0, -1), ...right];
  }

  return [points[0], points[end]];
}

function perpendicularDistance(point: { lat: number; lng: number }, lineStart: { lat: number; lng: number }, lineEnd: { lat: number; lng: number }): number {
  const dx = lineEnd.lng - lineStart.lng;
  const dy = lineEnd.lat - lineStart.lat;

  if (dx === 0 && dy === 0) {
    return Math.sqrt(Math.pow(point.lng - lineStart.lng, 2) + Math.pow(point.lat - lineStart.lat, 2));
  }

  const t = ((point.lng - lineStart.lng) * dx + (point.lat - lineStart.lat) * dy) / (dx * dx + dy * dy);
  const nearestLng = lineStart.lng + t * dx;
  const nearestLat = lineStart.lat + t * dy;

  return Math.sqrt(Math.pow(point.lng - nearestLng, 2) + Math.pow(point.lat - nearestLat, 2));
}

// Chaikin's smoothing algorithm - makes polygon edges rounder
function smoothPolygon(points: Array<{ lat: number; lng: number }>, iterations: number = 2): Array<{ lat: number; lng: number }> {
  if (points.length < 3) return points;
  
  let result = [...points];
  
  for (let iter = 0; iter < iterations; iter++) {
    const smoothed: Array<{ lat: number; lng: number }> = [];
    
    for (let i = 0; i < result.length; i++) {
      const p0 = result[i];
      const p1 = result[(i + 1) % result.length];
      
      // Q = 3/4 * P0 + 1/4 * P1
      smoothed.push({
        lat: 0.75 * p0.lat + 0.25 * p1.lat,
        lng: 0.75 * p0.lng + 0.25 * p1.lng,
      });
      
      // R = 1/4 * P0 + 3/4 * P1
      smoothed.push({
        lat: 0.25 * p0.lat + 0.75 * p1.lat,
        lng: 0.25 * p0.lng + 0.75 * p1.lng,
      });
    }
    
    result = smoothed;
  }
  
  return result;
}

export function LocationMapModal({
  open,
  onOpenChange,
  initialCenter,
  initialArea,
  onConfirm,
  listings = [],
  onViewListing,
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
  
  // Brush drawing refs
  const isBrushDrawingRef = useRef(false);
  const tempPolylineRef = useRef<google.maps.Polyline | null>(null);
  const lastBrushPointRef = useRef<{ x: number; y: number; time: number } | null>(null);

  const [mode, setMode] = useState<"circle" | "polygon">("circle");
  const [mapPropertyType, setMapPropertyType] = useState("");
  const [showSale, setShowSale] = useState(true);
  const [showRent, setShowRent] = useState(true);
  const [drawingMode, setDrawingMode] = useState<DrawingMode>("brush"); // Default to brush
  const [circleCenter, setCircleCenter] = useState<{ lat: number; lng: number } | null>(null);
  const [radius, setRadius] = useState(DEFAULT_RADIUS);
  const [radiusInput, setRadiusInput] = useState(DEFAULT_RADIUS.toString());
  const [polygonPoints, setPolygonPoints] = useState<Array<{ lat: number; lng: number }>>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [searchLocation, setSearchLocation] = useState("");
  
  // Custom drawing state
  const [drawingPoints, setDrawingPoints] = useState<Array<{ lat: number; lng: number }>>([]);
  
  // Buffer radius for polygon mode
  const [bufferRadius, setBufferRadius] = useState(0);
  const [bufferRadiusInput, setBufferRadiusInput] = useState("0");

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

  // Auto-start brush drawing when switching to polygon mode
  useEffect(() => {
    if (mode === "polygon" && !isDrawing && polygonPoints.length === 0 && mapInstanceRef.current && isLoaded) {
      // Small delay to ensure mode change is processed
      const timer = setTimeout(() => {
        setDrawingMode("brush");
        handleStartDrawing();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [mode, isDrawing, polygonPoints.length, isLoaded]);

  // Handle buffer radius input change
  const handleBufferRadiusChange = (value: string) => {
    setBufferRadiusInput(value);
    const num = parseInt(value, 10);
    if (!isNaN(num) && num >= 0 && num <= 10000) {
      setBufferRadius(num);
    }
  };

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
      
      // Use initialCenter if provided, otherwise try geolocation, fallback to DEFAULT_CENTER
      const createMap = (center: { lat: number; lng: number }, zoom: number = 12) => {
        // Create map without mapId to avoid configuration conflicts
        const map = new google.maps.Map(container, {
          center,
          zoom,
          disableDefaultUI: false,
          zoomControl: true,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: true,
          gestureHandling: 'greedy',
          draggable: true,
        });

        mapInstanceRef.current = map;
        console.log("[LocationMapModal] Map created successfully at:", center);

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
            mapInstanceRef.current.setCenter(map.getCenter()!);
          }
        }, 100);
      };

      // If initialCenter is provided, use it directly
      if (initialCenter) {
        createMap(initialCenter);
        return;
      }

      // Try to get user's location via geolocation
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            const userLocation = {
              lat: position.coords.latitude,
              lng: position.coords.longitude
            };
            console.log('[LocationMapModal] Using user geolocation:', userLocation);
            createMap(userLocation, 13); // Closer zoom for user location
          },
          (error) => {
            console.warn('[LocationMapModal] Geolocation error, using default:', error.message);
            createMap(DEFAULT_CENTER);
          },
          {
            enableHighAccuracy: false,
            timeout: 5000,
            maximumAge: 300000 // 5 minutes cache
          }
        );
      } else {
        // No geolocation support, use default
        createMap(DEFAULT_CENTER);
      }
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

  // Update click listener when mode or drawing state changes (POINTS mode only)
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

      // Polygon mode with active drawing - POINTS mode only
      if (mode === "polygon" && isDrawing && drawingMode === "points") {
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
        addPointToDrawing(newPoint);
      }
    });
  }, [mode, google, isDrawing, drawingMode, drawingPoints.length]);

  // BRUSH mode: mousedown, mousemove, mouseup handlers + TOUCH support
  useEffect(() => {
    if (!mapInstanceRef.current || !google || mode !== "polygon" || !isDrawing || drawingMode !== "brush") {
      return;
    }

    const map = mapInstanceRef.current;
    const mapDiv = map.getDiv();

    // Convert pixel to lat/lng
    const pixelToLatLng = (clientX: number, clientY: number): { lat: number; lng: number } | null => {
      const bounds = mapDiv.getBoundingClientRect();
      const x = clientX - bounds.left;
      const y = clientY - bounds.top;
      
      const mapBounds = map.getBounds();
      if (!mapBounds) return null;
      
      const ne = mapBounds.getNorthEast();
      const sw = mapBounds.getSouthWest();
      
      const lat = sw.lat() + (1 - y / bounds.height) * (ne.lat() - sw.lat());
      const lng = sw.lng() + (x / bounds.width) * (ne.lng() - sw.lng());
      
      return { lat, lng };
    };

    // Unified start handler
    const handleStart = (clientX: number, clientY: number) => {
      console.log('[LocationMapModal] BRUSH: start');
      isBrushDrawingRef.current = true;
      lastBrushPointRef.current = { x: clientX, y: clientY, time: Date.now() };
      
      cleanupTempDrawing();
      setDrawingPoints([]);
      
      const point = pixelToLatLng(clientX, clientY);
      if (point) {
        setDrawingPoints([point]);
        console.log('[LocationMapModal] BRUSH: first point', point);
      }
    };

    // Unified move handler
    const handleMove = (clientX: number, clientY: number) => {
      if (!isBrushDrawingRef.current) return;
      
      const now = Date.now();
      const last = lastBrushPointRef.current;
      
      // Throttle: min 8px distance OR 30ms since last point
      if (last) {
        const dx = clientX - last.x;
        const dy = clientY - last.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const timeDiff = now - last.time;
        
        if (dist < 8 && timeDiff < 30) {
          return;
        }
      }
      
      lastBrushPointRef.current = { x: clientX, y: clientY, time: now };
      
      const point = pixelToLatLng(clientX, clientY);
      if (point) {
        setDrawingPoints(prev => {
          const updated = [...prev, point];
          updateBrushPolyline(updated);
          return updated;
        });
      }
    };

    // Unified end handler
    const handleEnd = () => {
      if (!isBrushDrawingRef.current) return;
      console.log('[LocationMapModal] BRUSH: end');
      isBrushDrawingRef.current = false;
      lastBrushPointRef.current = null;
      
      setDrawingPoints(prev => {
        if (prev.length >= 3) {
          let simplified = simplifyPolygonToMaxPoints(prev, 150);
          const smoothed = smoothPolygon(simplified, 2);
          const final = simplifyPolygonToMaxPoints(smoothed, 200);
          
          console.log('[LocationMapModal] BRUSH: original', prev.length, '-> final', final.length);
          
          setTimeout(() => {
            finishBrushDrawing(final);
          }, 50);
          
          return final;
        }
        return prev;
      });
    };

    // Mouse event handlers
    const handleMouseDown = (e: MouseEvent) => handleStart(e.clientX, e.clientY);
    const handleMouseMove = (e: MouseEvent) => handleMove(e.clientX, e.clientY);
    const handleMouseUp = () => handleEnd();
    const handleMouseLeave = () => handleEnd();

    // Touch event handlers
    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      e.preventDefault(); // Prevent scroll/zoom during drawing
      handleStart(e.touches[0].clientX, e.touches[0].clientY);
    };
    
    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      e.preventDefault(); // Prevent scroll/zoom during drawing
      handleMove(e.touches[0].clientX, e.touches[0].clientY);
    };
    
    const handleTouchEnd = (e: TouchEvent) => {
      e.preventDefault();
      handleEnd();
    };

    // Add mouse listeners
    mapDiv.addEventListener('mousedown', handleMouseDown);
    mapDiv.addEventListener('mousemove', handleMouseMove);
    mapDiv.addEventListener('mouseup', handleMouseUp);
    mapDiv.addEventListener('mouseleave', handleMouseUp);
    
    // Add touch listeners with passive: false to allow preventDefault
    mapDiv.addEventListener('touchstart', handleTouchStart, { passive: false });
    mapDiv.addEventListener('touchmove', handleTouchMove, { passive: false });
    mapDiv.addEventListener('touchend', handleTouchEnd, { passive: false });
    mapDiv.addEventListener('touchcancel', handleTouchEnd, { passive: false });

    return () => {
      mapDiv.removeEventListener('mousedown', handleMouseDown);
      mapDiv.removeEventListener('mousemove', handleMouseMove);
      mapDiv.removeEventListener('mouseup', handleMouseUp);
      mapDiv.removeEventListener('mouseleave', handleMouseUp);
      mapDiv.removeEventListener('touchstart', handleTouchStart);
      mapDiv.removeEventListener('touchmove', handleTouchMove);
      mapDiv.removeEventListener('touchend', handleTouchEnd);
      mapDiv.removeEventListener('touchcancel', handleTouchEnd);
    };
  }, [mode, google, isDrawing, drawingMode]);

  // Helper to add point and update visualization - with draggable markers
  const addPointToDrawing = useCallback((newPoint: { lat: number; lng: number }) => {
    setDrawingPoints(prev => {
      const updated = [...prev, newPoint];
      const pointIndex = updated.length - 1;
      console.log('[LocationMapModal] Point added:', newPoint, 'Total points:', updated.length);
      
      updateTempPolygon(updated);
      
      // Add DRAGGABLE marker for the point (with drag support)
      if (mapInstanceRef.current && google) {
        const marker = new google.maps.Marker({
          map: mapInstanceRef.current,
          position: newPoint,
          title: updated.length === 1 ? "Punkt startowy (kliknij na pierwszy aby zamknąć)" : `Punkt ${updated.length} - przeciągnij aby przesunąć, PPM aby usunąć`,
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 10,
            fillColor: updated.length === 1 ? "#22c55e" : "#3b82f6", // Green for first point
            fillOpacity: 1,
            strokeColor: "#ffffff",
            strokeWeight: 2,
          },
          draggable: true, // ENABLE DRAG
          clickable: true,
          cursor: 'grab',
        });
        
        // Drag listener - update point position
        marker.addListener('dragend', () => {
          const newPos = marker.getPosition();
          if (newPos) {
            setDrawingPoints(currentPoints => {
              const markerIndex = tempMarkersRef.current.indexOf(marker);
              if (markerIndex >= 0 && markerIndex < currentPoints.length) {
                const updatedPoints = [...currentPoints];
                updatedPoints[markerIndex] = { lat: newPos.lat(), lng: newPos.lng() };
                updateTempPolygon(updatedPoints);
                return updatedPoints;
              }
              return currentPoints;
            });
          }
        });
        
        // Right-click listener - remove point
        marker.addListener('rightclick', () => {
          const markerIndex = tempMarkersRef.current.indexOf(marker);
          if (markerIndex >= 0) {
            marker.setMap(null);
            tempMarkersRef.current.splice(markerIndex, 1);
            setDrawingPoints(currentPoints => {
              const updatedPoints = currentPoints.filter((_, i) => i !== markerIndex);
              updateTempPolygon(updatedPoints);
              return updatedPoints;
            });
          }
        });
        
        // Prevent map click when clicking on marker
        marker.addListener('click', (e: google.maps.MapMouseEvent) => {
          // Just stop propagation - don't add new point
          if (e.stop) e.stop();
        });
        
        tempMarkersRef.current.push(marker);
        console.log('[LocationMapModal] Draggable marker created at:', newPoint);
      }

      return updated;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [google]);

  // Helper to update temp polygon visualization
  const updateTempPolygon = useCallback((points: Array<{ lat: number; lng: number }>) => {
    if (!google || !mapInstanceRef.current) return;
    
    if (tempPolygonRef.current) {
      tempPolygonRef.current.setPath(points);
    } else if (points.length >= 2) {
      tempPolygonRef.current = new google.maps.Polygon({
        map: mapInstanceRef.current,
        paths: points,
        fillColor: "#3b82f6",
        fillOpacity: 0.15,
        strokeColor: "#3b82f6",
        strokeWeight: 2,
        strokeOpacity: 0.9,
        editable: false,
        draggable: false,
      });
    }
  }, [google]);

  // Helper to update brush mode polyline (line only, no fill) - for smooth Paint-like drawing
  const updateBrushPolyline = useCallback((points: Array<{ lat: number; lng: number }>) => {
    if (!google || !mapInstanceRef.current) return;
    
    if (tempPolylineRef.current) {
      tempPolylineRef.current.setPath(points);
    } else if (points.length >= 2) {
      tempPolylineRef.current = new google.maps.Polyline({
        map: mapInstanceRef.current,
        path: points,
        strokeColor: "#3b82f6",
        strokeWeight: 3,
        strokeOpacity: 0.9,
      });
      console.log('[LocationMapModal] BRUSH: Polyline created');
    }
  }, [google]);

  // Helper to simplify polygon to max N points
  const simplifyPolygonToMaxPoints = (points: Array<{ lat: number; lng: number }>, maxPoints: number): Array<{ lat: number; lng: number }> => {
    if (points.length <= maxPoints) return points;
    
    // Calculate initial tolerance based on bounding box
    let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
    points.forEach(p => {
      minLat = Math.min(minLat, p.lat);
      maxLat = Math.max(maxLat, p.lat);
      minLng = Math.min(minLng, p.lng);
      maxLng = Math.max(maxLng, p.lng);
    });
    
    const diagonal = Math.sqrt(Math.pow(maxLat - minLat, 2) + Math.pow(maxLng - minLng, 2));
    let tolerance = diagonal * 0.001; // Start with small tolerance
    let simplified = simplifyPolygon(points, tolerance);
    
    // Iteratively increase tolerance until we have <= maxPoints
    let iterations = 0;
    while (simplified.length > maxPoints && iterations < 20) {
      tolerance *= 1.5;
      simplified = simplifyPolygon(points, tolerance);
      iterations++;
    }
    
    console.log('[LocationMapModal] Simplified from', points.length, 'to', simplified.length, 'points');
    return simplified;
  };

  // Finish brush drawing
  const finishBrushDrawing = useCallback((points: Array<{ lat: number; lng: number }>) => {
    if (!google || !mapInstanceRef.current) return;
    
    console.log('[LocationMapModal] finishBrushDrawing with', points.length, 'points');
    
    // RESTORE normal map controls
    mapInstanceRef.current.setOptions({
      draggable: true,
      gestureHandling: 'greedy',
      scrollwheel: true,
    });

    // Cleanup brush polyline first
    tempPolylineRef.current?.setMap(null);
    tempPolylineRef.current = null;

    if (points.length >= 3) {
      setPolygonPoints([...points]);

      // Create final CLEAN polygon (no visible nodes - editable: false)
      polygonRef.current = new google.maps.Polygon({
        map: mapInstanceRef.current,
        paths: points,
        fillColor: "#3b82f6",
        fillOpacity: 0.25,
        strokeColor: "#3b82f6",
        strokeWeight: 2.5,
        editable: false,  // NO visible nodes for clean look
        draggable: false, // Cannot drag for stability
      });
    }

    // Cleanup temp drawing
    cleanupTempDrawing();
    setDrawingPoints([]);
    setIsDrawing(false);
  }, [google]);

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

  // Handle polygon mode - draw existing polygon (LOCKED - no editable handles)
  useEffect(() => {
    if (!google || !mapInstanceRef.current) return;

    if (mode === "polygon") {
      circleRef.current?.setMap(null);
      
      // If we have existing polygon points and not drawing, draw them LOCKED
      if (polygonPoints.length > 0 && !polygonRef.current && !isDrawing) {
        polygonRef.current = new google.maps.Polygon({
          map: mapInstanceRef.current,
          paths: polygonPoints,
          fillColor: "#3b82f6",
          fillOpacity: 0.25,
          strokeColor: "#3b82f6",
          strokeWeight: 2.5,
          editable: false,   // LOCKED - no visible vertex handles
          draggable: false,  // LOCKED - cannot drag
          clickable: true,   // Allow click for info
        });
        // NO path listeners - polygon is locked
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
    tempPolylineRef.current?.setMap(null);
    tempPolylineRef.current = null;
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

      // Create final LOCKED polygon (no visible vertex handles)
      polygonRef.current = new google.maps.Polygon({
        map: mapInstanceRef.current,
        paths: drawingPoints,
        fillColor: "#3b82f6",
        fillOpacity: 0.25,
        strokeColor: "#3b82f6",
        strokeWeight: 2.5,
        editable: false,   // LOCKED - no visible vertex handles
        draggable: false,  // LOCKED - cannot drag
        clickable: true,   // Allow click for info
      });
      // NO path listeners - polygon is locked after drawing
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
          bufferMeters: bufferRadius > 0 ? bufferRadius : undefined,
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
      <DialogContent 
        className="max-w-4xl h-[95vh] sm:h-[85vh] flex flex-col p-0 overflow-hidden" 
        aria-describedby="location-modal-description"
      >
        <span id="location-modal-description" className="sr-only">
          Modal do wyboru obszaru na mapie - rysuj okrąg lub własny kształt
        </span>
        <DialogHeader className="p-3 sm:p-4 pb-2">
          <DialogTitle className="flex items-center gap-2 text-sm sm:text-base">
            <MapPin className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
            Wybierz obszar na mapie
          </DialogTitle>
        </DialogHeader>

        {/* Controls Row - Location + Mode + Radius */}
        <div className="px-2 sm:px-4 pb-2 sm:pb-3 space-y-2">
          {/* Property type & transaction pills */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-muted-foreground mr-1">Typ:</span>
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
            <div className="h-5 w-px bg-border mx-1" />
            
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
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:gap-3 border rounded-lg p-2 sm:p-3 bg-muted/30">
            {/* Location Search - Compact */}
            <div className="w-40 sm:w-56 max-w-[160px] sm:max-w-[220px]">
              <LocationSearchInput
                value={searchLocation}
                onChange={setSearchLocation}
                onLocationSelect={handleLocationSelect}
                placeholder="Szukaj..."
                className="h-8 sm:h-9 text-xs"
              />
            </div>
            
            {/* Mode Selector */}
            <Tabs value={mode} onValueChange={(v) => setMode(v as "circle" | "polygon")}>
              <TabsList className="h-8 sm:h-9">
                <TabsTrigger value="circle" className="gap-1 px-2 sm:px-3 h-7 sm:h-8 text-xs">
                  <Circle className="h-3 w-3" />
                  Okrąg
                </TabsTrigger>
                <TabsTrigger value="polygon" className="gap-1 px-2 sm:px-3 h-7 sm:h-8 text-xs">
                  <PenTool className="h-3 w-3" />
                  Zaznacz
                </TabsTrigger>
              </TabsList>
            </Tabs>
            
            {/* Radius Input (only for circle mode) */}
            {mode === "circle" && (
              <div className="flex items-center gap-1.5 sm:gap-2">
                <span className="text-xs sm:text-sm text-muted-foreground whitespace-nowrap hidden sm:inline">Promień:</span>
                <Input
                  type="number"
                  value={radiusInput}
                  onChange={(e) => handleRadiusInputChange(e.target.value)}
                  className="w-16 sm:w-20 h-8 sm:h-9 text-xs sm:text-sm"
                  min={MIN_RADIUS}
                  max={MAX_RADIUS}
                />
                <span className="text-xs sm:text-sm text-muted-foreground">m</span>
              </div>
            )}
            
            {/* Polygon mode controls */}
            {mode === "polygon" && (
              <div className="flex gap-1.5 sm:gap-2 items-center flex-wrap">
                {/* Drawing mode indicator and switch to points */}
                {isDrawing && (
                  <>
                    {/* Brush mode button */}
                    <Button 
                      size="sm" 
                      variant={drawingMode === "brush" ? "secondary" : "ghost"}
                      onClick={() => {
                        if (drawingMode !== "brush") {
                          handleCancelDrawing();
                          setDrawingMode("brush");
                          setTimeout(() => handleStartDrawing(), 50);
                        }
                      }}
                    className="h-7 sm:h-8 text-xs gap-1 px-2"
                    >
                      <Paintbrush className="h-3 w-3" />
                      Pędzel
                    </Button>
                    
                    {/* Points mode button */}
                    <Button 
                      size="sm" 
                      variant={drawingMode === "points" ? "secondary" : "ghost"}
                      onClick={() => {
                        if (drawingMode !== "points") {
                          handleCancelDrawing();
                          setDrawingMode("points");
                          setTimeout(() => handleStartDrawing(), 50);
                        }
                      }}
                      className="h-7 sm:h-8 text-xs gap-1 px-2"
                    >
                      <MapPin className="h-3 w-3" />
                      Punkty
                    </Button>
                    
                    {drawingMode === "points" && drawingPoints.length >= 3 && (
                      <Button 
                        size="sm" 
                        variant="default" 
                        onClick={handleFinishDrawing}
                        className="h-7 sm:h-8 text-xs px-2"
                      >
                        <Check className="h-3.5 w-3.5 mr-1" />
                        OK
                      </Button>
                    )}
                    <Button 
                      size="sm" 
                      variant="ghost" 
                      onClick={handleCancelDrawing}
                      className="h-7 sm:h-8 px-2"
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </>
                )}
                
                {/* Buffer radius - show when polygon is drawn */}
                {!isDrawing && polygonPoints.length >= 3 && (
                  <div className="flex items-center gap-1.5 sm:gap-2">
                    <span className="text-xs sm:text-sm text-muted-foreground whitespace-nowrap hidden sm:inline">Bufor:</span>
                    <Input
                      type="number"
                      value={bufferRadiusInput}
                      onChange={(e) => handleBufferRadiusChange(e.target.value)}
                      className="w-14 sm:w-20 h-8 sm:h-9 text-xs"
                      min={0}
                      max={10000}
                      placeholder="0"
                    />
                    <span className="text-xs sm:text-sm text-muted-foreground">m</span>
                    <Button 
                      size="sm" 
                      variant="outline"
                      onClick={() => {
                        cleanupTempDrawing();
                        setPolygonPoints([]);
                        setDrawingMode("brush");
                        setTimeout(() => handleStartDrawing(), 50);
                      }}
                      className="h-7 sm:h-8 text-xs px-2"
                    >
                      <Paintbrush className="h-3 w-3 mr-1" />
                      <span className="hidden xs:inline">Nowy</span>
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Instruction Line */}
        <div className="px-2 sm:px-4 pb-1 sm:pb-2">
          <p className="text-xs text-muted-foreground">
            {mode === "circle" 
              ? (circleCenter 
                  ? `✓ Wybrany obszar: okrąg ${formatRadius(radius)}` 
                  : "Dotknij mapę lub wyszukaj lokalizację")
              : (isDrawing 
                  ? (drawingMode === "points"
                      ? `Dotknij punkty (${drawingPoints.length}/min.3)`
                      : `🎨 Rysuj palcem po mapie...`)
                  : polygonPoints.length >= 3 
                    ? `✓ Obszar narysowany${bufferRadius > 0 ? ` + bufor ${bufferRadius}m` : ""}`
                    : "Narysuj obszar na mapie")
            }
          </p>
        </div>

        {/* Map - responsive dimensions */}
        <div 
          className="relative mx-2 sm:mx-4 mb-2 sm:mb-4 rounded-lg overflow-hidden border flex-1"
          style={{ 
            width: 'calc(100% - 1rem)', 
            minHeight: '280px'
          }}
        >
          {!isLoaded && !error ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-muted gap-2">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Ładowanie mapy...</p>
            </div>
          ) : error || isTimedOut ? (
            renderErrorState()
          ) : (
            <div 
              ref={mapRef} 
              className="w-full h-full min-h-[280px] sm:min-h-[400px]"
              style={{ touchAction: isDrawing ? 'none' : 'auto' }}
            />
          )}
        </div>

        {/* Actions */}
        <div className="p-2 sm:p-4 pt-0 flex items-center justify-between border-t bg-muted/50">
          <Button
            variant="outline"
            size="sm"
            onClick={handleClear}
            disabled={!hasValidArea && !isDrawing}
            className="h-8 sm:h-9 text-xs sm:text-sm"
          >
            <Trash2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
            <span className="hidden xs:inline">Wyczyść</span>
          </Button>

          <div className="flex gap-2">
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => onOpenChange(false)}
              className="h-8 sm:h-9 text-xs sm:text-sm"
            >
              Anuluj
            </Button>
            <Button 
              onClick={handleConfirm} 
              disabled={!hasValidArea}
              size="sm"
              className="h-8 sm:h-9 text-xs sm:text-sm"
            >
              <Check className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
              Zatwierdź
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
