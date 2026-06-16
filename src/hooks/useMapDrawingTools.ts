// Shared freehand map drawing tools.
//
// Encapsulates the "draw an area" interactions used by the fullscreen map views:
//   - pen: freehand polygon (mouse drag on desktop, touch drag on mobile)
//   - circle: tap to drop an editable, draggable radius circle
// plus the gesture locking needed so a drag draws instead of panning the map.
//
// The hook owns all the imperative Google Maps overlay refs and exposes plain
// state (`drawnArea`, `circleCenter`, `circleRadius`) that callers use both to
// render an inverted selection mask and to filter their own listings. The caller
// keeps the mask rendering, because the visual mask often depends on portal-specific
// settings (e.g. a search-radius buffer) that don't belong in the drawing layer.

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import type { LatLngLiteral } from "@/lib/maps/geometry";

export type DrawingMode = false | "pen" | "circle";

export interface UseMapDrawingToolsParams {
  google: typeof window.google | null;
  mapRef: RefObject<google.maps.Map | null>;
  mapContainerRef: RefObject<HTMLDivElement | null>;
  /** Stroke/fill accent colour for the drawn shapes (default GetRido purple). */
  color?: string;
}

export interface UseMapDrawingTools {
  drawingMode: DrawingMode;
  drawnArea: LatLngLiteral[] | null;
  circleCenter: LatLngLiteral | null;
  circleRadius: number;
  /** True while either a polygon or a circle selection is active. */
  hasActiveDrawing: boolean;
  startPolygonDrawing: () => void;
  startCircleDrawing: () => void;
  clearAllDrawing: () => void;
  lockDrawingInteraction: () => void;
  unlockDrawingInteraction: () => void;
  /** Returns true briefly after a freehand draw ends — guard marker click-through. */
  justFinishedDrawingRef: RefObject<boolean>;
  /** Tear down all overlays + listeners; call from the map's own cleanup. */
  disposeDrawing: () => void;
}

export function useMapDrawingTools({
  google,
  mapRef,
  mapContainerRef,
  color = "#7c3aed",
}: UseMapDrawingToolsParams): UseMapDrawingTools {
  const drawingPolygonRef = useRef<google.maps.Polygon | null>(null);
  const drawingPolylineRef = useRef<google.maps.Polyline | null>(null);
  const circleRef = useRef<google.maps.Circle | null>(null);
  const drawingCleanupRef = useRef<(() => void) | null>(null);
  const isBrushDrawingRef = useRef(false);
  const justFinishedDrawingRef = useRef(false);

  const [drawingMode, setDrawingMode] = useState<DrawingMode>(false);
  const [drawnArea, setDrawnArea] = useState<LatLngLiteral[] | null>(null);
  const [circleCenter, setCircleCenter] = useState<LatLngLiteral | null>(null);
  const [circleRadius, setCircleRadius] = useState(1000);

  const lockDrawingInteraction = useCallback(() => {
    mapRef.current?.setOptions({ draggable: false, gestureHandling: "none" });
    if (mapContainerRef.current) {
      mapContainerRef.current.style.touchAction = "none";
    }
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    document.body.style.touchAction = "none";
  }, [mapRef, mapContainerRef]);

  const unlockDrawingInteraction = useCallback(() => {
    mapRef.current?.setOptions({ draggable: true, gestureHandling: "cooperative" });
    if (mapContainerRef.current) {
      mapContainerRef.current.style.touchAction = "auto";
    }
    document.body.style.overflow = "";
    document.documentElement.style.overflow = "";
    document.body.style.touchAction = "";
  }, [mapRef, mapContainerRef]);

  // === Polygon (freehand) drawing ===
  const startPolygonDrawing = useCallback(() => {
    if (!mapRef.current || !google) return;
    drawingCleanupRef.current?.();
    drawingCleanupRef.current = null;
    setDrawingMode("pen");
    setDrawnArea(null);
    setCircleCenter(null);
    circleRef.current?.setMap(null);
    drawingPolygonRef.current?.setMap(null);
    const map = mapRef.current;
    lockDrawingInteraction();
    const path: google.maps.LatLng[] = [];
    const polyline = new google.maps.Polyline({ map, path, strokeColor: color, strokeWeight: 3, strokeOpacity: 0.8 });
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
      unlockDrawingInteraction();
      polyline.setMap(null);
      if (path.length < 3) { setDrawingMode(false); return; }
      const points = path.map((p) => ({ lat: p.lat(), lng: p.lng() }));
      const polygon = new google.maps.Polygon({
        map, paths: points,
        strokeColor: color, strokeWeight: 2, strokeOpacity: 0.9,
        fillColor: "#ffffff", fillOpacity: 0.02,
      });
      drawingPolygonRef.current = polygon;
      setDrawnArea(points);
      setDrawingMode(false);
      // Block marker clicks for a moment after drawing
      justFinishedDrawingRef.current = true;
      setTimeout(() => { justFinishedDrawingRef.current = false; }, 500);
    };

    // Mouse events (desktop)
    const mouseDownListener = map.addListener("mousedown", (e: google.maps.MapMouseEvent) => {
      if (e.latLng) startDraw(e.latLng);
    });
    const mouseMoveListener = map.addListener("mousemove", (e: google.maps.MapMouseEvent) => {
      if (e.latLng) continueDraw(e.latLng);
    });
    const mouseUpListener = map.addListener("mouseup", endDraw);
    const handleWindowMouseUp = () => endDraw();
    window.addEventListener("mouseup", handleWindowMouseUp);

    // Touch events on map container (mobile)
    const container = mapContainerRef.current;
    const getLatLngFromTouch = (touch: Touch): google.maps.LatLng | null => {
      if (!container || !map.getProjection()) return null;
      const rect = container.getBoundingClientRect();
      const x = touch.clientX - rect.left;
      const y = touch.clientY - rect.top;
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
    }
    window.addEventListener("touchmove", handleTouchMove, { passive: false });
    window.addEventListener("touchend", handleTouchEnd, { passive: false });
    window.addEventListener("touchcancel", handleTouchEnd, { passive: false });

    const cleanup = () => {
      google.maps.event.removeListener(mouseDownListener);
      google.maps.event.removeListener(mouseMoveListener);
      google.maps.event.removeListener(mouseUpListener);
      window.removeEventListener("mouseup", handleWindowMouseUp);
      if (container) {
        container.removeEventListener("touchstart", handleTouchStart);
      }
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleTouchEnd);
      window.removeEventListener("touchcancel", handleTouchEnd);
      drawingCleanupRef.current = null;
    };
    drawingCleanupRef.current = cleanup;
  }, [google, mapRef, mapContainerRef, color, lockDrawingInteraction, unlockDrawingInteraction]);

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
        strokeColor: color, strokeWeight: 2, strokeOpacity: 0.8,
        fillColor: color, fillOpacity: 0.1, editable: true,
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
  }, [google, mapRef, color, circleRadius]);

  const clearAllDrawing = useCallback(() => {
    drawingCleanupRef.current?.();
    drawingCleanupRef.current = null;
    unlockDrawingInteraction();
    drawingPolygonRef.current?.setMap(null);
    drawingPolygonRef.current = null;
    drawingPolylineRef.current?.setMap(null);
    drawingPolylineRef.current = null;
    circleRef.current?.setMap(null);
    circleRef.current = null;
    isBrushDrawingRef.current = false;
    setDrawnArea(null);
    setCircleCenter(null);
    setDrawingMode(false);
  }, [unlockDrawingInteraction]);

  const disposeDrawing = useCallback(() => {
    drawingPolygonRef.current?.setMap(null);
    drawingPolygonRef.current = null;
    drawingPolylineRef.current?.setMap(null);
    drawingPolylineRef.current = null;
    circleRef.current?.setMap(null);
    circleRef.current = null;
    drawingCleanupRef.current?.();
    drawingCleanupRef.current = null;
    isBrushDrawingRef.current = false;
    unlockDrawingInteraction();
  }, [unlockDrawingInteraction]);

  // Safety net: tear everything down if the consumer unmounts mid-draw.
  useEffect(() => disposeDrawing, [disposeDrawing]);

  return {
    drawingMode,
    drawnArea,
    circleCenter,
    circleRadius,
    hasActiveDrawing: !!(drawnArea || circleCenter),
    startPolygonDrawing,
    startCircleDrawing,
    clearAllDrawing,
    lockDrawingInteraction,
    unlockDrawingInteraction,
    justFinishedDrawingRef,
    disposeDrawing,
  };
}
