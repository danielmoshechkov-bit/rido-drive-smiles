// Pen (freehand polygon) + circle drawing tools for a Google Map.
// Extracted from src/components/realestate/FullscreenMapView.tsx so the vehicle
// (giełda aut) map view gets the same "draw an area to filter" behaviour.
//
// Owns: drawing state, the freehand/circle gesture handlers (mouse + touch),
// the inverted "spotlight" mask overlay, and a predicate that tells the caller
// whether a coordinate falls inside the active selection. It does NOT own the
// map instance — pass in refs to the map and its container.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  WORLD_MASK_PATH,
  createCirclePolygon,
  ensureClockwise,
  ensureCounterClockwise,
  haversineDistance,
  isPointInPolygon,
  type LatLng,
} from "@/lib/maps/geometry";

export type DrawingMode = false | "pen" | "circle";

export interface UseMapDrawingToolsArgs {
  google: typeof google | null;
  mapRef: React.MutableRefObject<google.maps.Map | null>;
  mapContainerRef: React.RefObject<HTMLElement>;
  /** Stroke/fill colour for drawn shapes + mask. Defaults to the brand violet. */
  color?: string;
}

export interface UseMapDrawingTools {
  drawingMode: DrawingMode;
  drawnArea: LatLng[] | null;
  circleCenter: LatLng | null;
  circleRadius: number;
  bufferDistance: number;
  setBufferDistance: (m: number) => void;
  useBuffer: boolean;
  setUseBuffer: (v: boolean) => void;
  hasActiveDrawing: boolean;
  startPolygonDrawing: () => void;
  startCircleDrawing: () => void;
  clearAllDrawing: () => void;
  /** True if (lat,lng) is inside the active polygon/circle (always true when nothing is drawn). */
  matchesDrawnFilter: (lat: number, lng: number) => boolean;
  /** True briefly after a freehand draw finishes — use to swallow stray marker clicks. */
  justFinishedDrawingRef: React.MutableRefObject<boolean>;
}

export function useMapDrawingTools({
  google,
  mapRef,
  mapContainerRef,
  color = "#7c3aed",
}: UseMapDrawingToolsArgs): UseMapDrawingTools {
  const [drawingMode, setDrawingMode] = useState<DrawingMode>(false);
  const [drawnArea, setDrawnArea] = useState<LatLng[] | null>(null);
  const [circleCenter, setCircleCenter] = useState<LatLng | null>(null);
  const [circleRadius, setCircleRadius] = useState(1000);
  const [bufferDistance, setBufferDistance] = useState(0);
  const [useBuffer, setUseBuffer] = useState(false);

  const drawingPolygonRef = useRef<google.maps.Polygon | null>(null);
  const drawingPolylineRef = useRef<google.maps.Polyline | null>(null);
  const circleRef = useRef<google.maps.Circle | null>(null);
  const selectionMaskRef = useRef<google.maps.Polygon | null>(null);
  const drawingCleanupRef = useRef<(() => void) | null>(null);
  const isBrushDrawingRef = useRef(false);
  const justFinishedDrawingRef = useRef(false);

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

  // === Inverted "spotlight" mask: dim everything outside the active selection ===
  useEffect(() => {
    if (!mapRef.current || !google) return;

    selectionMaskRef.current?.setMap(null);
    selectionMaskRef.current = null;

    const maskStyle = {
      strokeColor: color,
      strokeWeight: 2,
      strokeOpacity: 0.8,
      fillColor: color,
      fillOpacity: 0.2,
      clickable: false,
      zIndex: 1,
    } as const;

    if (drawnArea && drawnArea.length >= 3) {
      selectionMaskRef.current = new google.maps.Polygon({
        map: mapRef.current,
        paths: [ensureClockwise(WORLD_MASK_PATH), ensureCounterClockwise(drawnArea)],
        ...maskStyle,
      });
      drawingPolygonRef.current?.setMap(null);
      return;
    }

    if (circleCenter) {
      const effectiveRadius = circleRadius + (useBuffer ? bufferDistance : 0);
      const circlePath = ensureCounterClockwise(createCirclePolygon(circleCenter, effectiveRadius));
      selectionMaskRef.current = new google.maps.Polygon({
        map: mapRef.current,
        paths: [ensureClockwise(WORLD_MASK_PATH), circlePath],
        ...maskStyle,
      });
    }
  }, [google, mapRef, color, drawnArea, circleCenter, circleRadius, bufferDistance, useBuffer]);

  // === Freehand polygon (pen) ===
  const startPolygonDrawing = useCallback(() => {
    if (!mapRef.current || !google) return;
    drawingCleanupRef.current?.();
    drawingCleanupRef.current = null;
    setDrawingMode("pen");
    setDrawnArea(null);
    setCircleCenter(null);
    circleRef.current?.setMap(null);
    drawingPolygonRef.current?.setMap(null);
    selectionMaskRef.current?.setMap(null);
    const map = mapRef.current;
    lockDrawingInteraction();
    const path: google.maps.LatLng[] = [];
    const polyline = new google.maps.Polyline({
      map, path, strokeColor: color, strokeWeight: 3, strokeOpacity: 0.8,
    });
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
      justFinishedDrawingRef.current = true;
      setTimeout(() => { justFinishedDrawingRef.current = false; }, 500);
    };

    // Mouse (desktop)
    const mouseDownListener = map.addListener("mousedown", (e: google.maps.MapMouseEvent) => {
      if (e.latLng) startDraw(e.latLng);
    });
    const mouseMoveListener = map.addListener("mousemove", (e: google.maps.MapMouseEvent) => {
      if (e.latLng) continueDraw(e.latLng);
    });
    const mouseUpListener = map.addListener("mouseup", endDraw);
    const handleWindowMouseUp = () => endDraw();
    window.addEventListener("mouseup", handleWindowMouseUp);

    // Touch (mobile) — project screen coords back to lat/lng
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
        nw.y + (y / rect.height) * (sw.y - nw.y),
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
      if (container) container.removeEventListener("touchstart", handleTouchStart);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleTouchEnd);
      window.removeEventListener("touchcancel", handleTouchEnd);
      drawingCleanupRef.current = null;
    };
    drawingCleanupRef.current = cleanup;
  }, [google, mapRef, mapContainerRef, color, lockDrawingInteraction, unlockDrawingInteraction]);

  // === Circle ===
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
    selectionMaskRef.current?.setMap(null);
    selectionMaskRef.current = null;
    isBrushDrawingRef.current = false;
    setDrawnArea(null);
    setCircleCenter(null);
    setDrawingMode(false);
  }, [unlockDrawingInteraction]);

  const matchesDrawnFilter = useCallback((lat: number, lng: number): boolean => {
    if (drawnArea && drawnArea.length >= 3) {
      if (!isPointInPolygon(lat, lng, drawnArea)) return false;
    }
    if (circleCenter) {
      const effectiveRadius = circleRadius + (useBuffer ? bufferDistance : 0);
      if (haversineDistance(circleCenter.lat, circleCenter.lng, lat, lng) > effectiveRadius) {
        return false;
      }
    }
    return true;
  }, [drawnArea, circleCenter, circleRadius, useBuffer, bufferDistance]);

  // Tear down stray overlays/listeners on unmount.
  useEffect(() => () => {
    drawingCleanupRef.current?.();
    drawingCleanupRef.current = null;
    drawingPolygonRef.current?.setMap(null);
    drawingPolylineRef.current?.setMap(null);
    circleRef.current?.setMap(null);
    selectionMaskRef.current?.setMap(null);
    unlockDrawingInteraction();
  }, [unlockDrawingInteraction]);

  return {
    drawingMode,
    drawnArea,
    circleCenter,
    circleRadius,
    bufferDistance,
    setBufferDistance,
    useBuffer,
    setUseBuffer,
    hasActiveDrawing: !!(drawnArea || circleCenter),
    startPolygonDrawing,
    startCircleDrawing,
    clearAllDrawing,
    matchesDrawnFilter,
    justFinishedDrawingRef,
  };
}
