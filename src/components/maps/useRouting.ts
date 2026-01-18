// GetRido Maps - Routing Hook with GPS Fallback and Route Options
import { useState, useCallback } from 'react';
import { 
  RouteResult, 
  RouteOption,
  resolveLocation, 
  calculateRoute,
  calculateAlternativeRoute,
  calculateRoutesWithOptions,
  selectBestRoute,
  Coordinates 
} from './routingService';
import { analyzeRouteFree, AiAnalysisResult } from './freeAiAnalysis';

export type RouteMode = 'fastest' | 'simplest';

export interface RoutingState {
  startInput: string;
  endInput: string;
  startCoords: Coordinates | null;
  endCoords: Coordinates | null;
  route: RouteResult | null;
  alternativeRoute: RouteResult | null;
  showAlternative: boolean;
  isLoading: boolean;
  error: string | null;
  // AI FREE state
  aiAnalysis: AiAnalysisResult | null;
  isAnalyzing: boolean;
  // Route options state
  routeOptions: RouteOption[];
  selectedRouteMode: RouteMode;
  activeRouteId: string | null;
}

// Interface for GPS location fallback
interface GpsLocation {
  latitude: number;
  longitude: number;
}

export function useRouting(gpsLocation?: GpsLocation | null) {
  const [state, setState] = useState<RoutingState>({
    startInput: '',
    endInput: '',
    startCoords: null,
    endCoords: null,
    route: null,
    alternativeRoute: null,
    showAlternative: false,
    isLoading: false,
    error: null,
    aiAnalysis: null,
    isAnalyzing: false,
    routeOptions: [],
    selectedRouteMode: 'fastest',
    activeRouteId: null,
  });

  const setStartInput = useCallback((value: string) => {
    setState(prev => ({ ...prev, startInput: value, startCoords: null, error: null }));
  }, []);

  const setEndInput = useCallback((value: string) => {
    setState(prev => ({ ...prev, endInput: value, endCoords: null, error: null }));
  }, []);

  const setStartCoords = useCallback((coords: Coordinates | null) => {
    setState(prev => ({ ...prev, startCoords: coords }));
  }, []);

  const setEndCoords = useCallback((coords: Coordinates | null) => {
    setState(prev => ({ ...prev, endCoords: coords }));
  }, []);

  const setRouteMode = useCallback((mode: RouteMode) => {
    setState(prev => {
      if (prev.routeOptions.length === 0) {
        return { ...prev, selectedRouteMode: mode };
      }
      
      const bestRoute = selectBestRoute(prev.routeOptions, mode);
      if (!bestRoute) {
        return { ...prev, selectedRouteMode: mode };
      }

      return {
        ...prev,
        selectedRouteMode: mode,
        activeRouteId: bestRoute.id,
        route: {
          coordinates: bestRoute.coordinates,
          distance: bestRoute.distance,
          duration: bestRoute.duration,
          startPoint: prev.startCoords!,
          endPoint: prev.endCoords!,
          isAlternative: false,
          routeType: 'standard',
        },
      };
    });
  }, []);

  const runAiAnalysis = useCallback(async (route: RouteResult) => {
    setState(prev => ({ ...prev, isAnalyzing: true }));
    
    try {
      const analysis = await analyzeRouteFree(route);
      setState(prev => ({ 
        ...prev, 
        aiAnalysis: analysis, 
        isAnalyzing: false 
      }));
    } catch (error) {
      console.error('[useRouting] AI analysis error:', error);
      setState(prev => ({ ...prev, isAnalyzing: false }));
    }
  }, []);

  const calculateRouteHandler = useCallback(async (
    gpsLocationOverride?: GpsLocation | null,
    endCoordsOverride?: Coordinates | null,
    endInputOverride?: string
  ) => {
    // Allow passing coords directly to avoid React state timing issues
    const effectiveEndCoords = endCoordsOverride ?? state.endCoords;
    const effectiveEndInput = endInputOverride ?? state.endInput;
    const { startInput, selectedRouteMode } = state;
    const effectiveGpsLocation = gpsLocationOverride ?? gpsLocation;

    // Validate: need end coords or end input
    if (!effectiveEndCoords && !effectiveEndInput.trim()) {
      setState(prev => ({ ...prev, error: 'Wprowadź punkt końcowy' }));
      return;
    }

    setState(prev => ({ 
      ...prev, 
      isLoading: true, 
      error: null, 
      route: null,
      alternativeRoute: null,
      showAlternative: false,
      aiAnalysis: null,
      routeOptions: [],
      activeRouteId: null,
    }));

    try {
      // Użyj zapisanych współrzędnych z autocomplete lub rozwiąż adres
      let resolvedStartCoords = state.startCoords;
      let resolvedEndCoords = effectiveEndCoords;

      // Resolve start location
      if (!resolvedStartCoords) {
        if (startInput.trim()) {
          // User typed something - resolve it
          const startLocation = await resolveLocation(startInput);
          if (!startLocation) {
            setState(prev => ({ 
              ...prev, 
              isLoading: false, 
              error: 'Nie znaleziono punktu początkowego' 
            }));
            return;
          }
          resolvedStartCoords = { lat: startLocation.lat, lng: startLocation.lng };
        } else if (effectiveGpsLocation) {
          // No input - use GPS fallback
          resolvedStartCoords = { 
            lat: effectiveGpsLocation.latitude, 
            lng: effectiveGpsLocation.longitude 
          };
          // Update the input to show we're using GPS
          setState(prev => ({ ...prev, startInput: 'Twoja lokalizacja' }));
        } else {
          // No input and no GPS
          setState(prev => ({ 
            ...prev, 
            isLoading: false, 
            error: 'Wprowadź punkt początkowy lub włącz GPS' 
          }));
          return;
        }
      }

      // Resolve end location jeśli nie mamy współrzędnych
      if (!resolvedEndCoords) {
        const endLocation = await resolveLocation(effectiveEndInput);
        if (!endLocation) {
          setState(prev => ({ 
            ...prev, 
            isLoading: false, 
            error: 'Nie znaleziono punktu końcowego' 
          }));
          return;
        }
        resolvedEndCoords = { lat: endLocation.lat, lng: endLocation.lng };
      }

      console.log('[useRouting] Calculating route:', { from: resolvedStartCoords, to: resolvedEndCoords });

      // Calculate routes with options (for fastest/simplest selection)
      const routeOptions = await calculateRoutesWithOptions(resolvedStartCoords, resolvedEndCoords);
      
      let selectedRoute: RouteResult | null = null;
      let activeRouteId: string | null = null;

      if (routeOptions.length > 0) {
        const bestOption = selectBestRoute(routeOptions, selectedRouteMode);
        if (bestOption) {
          activeRouteId = bestOption.id;
          selectedRoute = {
            coordinates: bestOption.coordinates,
            distance: bestOption.distance,
            duration: bestOption.duration,
            startPoint: resolvedStartCoords,
            endPoint: resolvedEndCoords,
            isAlternative: false,
            routeType: 'standard',
            steps: bestOption.steps, // Include steps for voice navigation
          };
        }
      }

      // Fallback to simple route calculation if options failed
      if (!selectedRoute) {
        selectedRoute = await calculateRoute(resolvedStartCoords, resolvedEndCoords);
      }
      
      if (!selectedRoute) {
        setState(prev => ({ 
          ...prev, 
          isLoading: false, 
          error: 'Nie można wyznaczyć trasy' 
        }));
        return;
      }

      console.log('[useRouting] Route calculated:', { distance: selectedRoute.distance, duration: selectedRoute.duration });

      setState(prev => ({
        ...prev,
        startCoords: resolvedStartCoords,
        endCoords: resolvedEndCoords,
        endInput: effectiveEndInput || prev.endInput,
        route: selectedRoute,
        routeOptions,
        activeRouteId,
        isLoading: false,
        error: null,
      }));

      // Run AI analysis asynchronously (non-blocking)
      runAiAnalysis(selectedRoute);

    } catch (error) {
      console.error('[useRouting] Error:', error);
      setState(prev => ({ 
        ...prev, 
        isLoading: false, 
        error: 'Wystąpił błąd podczas wyznaczania trasy' 
      }));
    }
  }, [state.startInput, state.endInput, state.startCoords, state.endCoords, state.selectedRouteMode, gpsLocation, runAiAnalysis]);

  const calculateAlternative = useCallback(async () => {
    const { startCoords, endCoords } = state;
    
    if (!startCoords || !endCoords) return;

    setState(prev => ({ ...prev, isLoading: true }));

    try {
      const altRoute = await calculateAlternativeRoute(startCoords, endCoords);
      
      if (altRoute) {
        setState(prev => ({
          ...prev,
          alternativeRoute: altRoute,
          showAlternative: true,
          isLoading: false,
        }));
      } else {
        // If no alternative found, show a message
        setState(prev => ({
          ...prev,
          isLoading: false,
          error: 'Brak dostępnej alternatywnej trasy dla tej lokalizacji',
        }));
      }
    } catch (error) {
      console.error('[useRouting] Alternative route error:', error);
      setState(prev => ({ 
        ...prev, 
        isLoading: false,
        error: 'Nie można wyznaczyć alternatywnej trasy',
      }));
    }
  }, [state.startCoords, state.endCoords]);

  const toggleAlternative = useCallback(() => {
    setState(prev => ({ ...prev, showAlternative: !prev.showAlternative }));
  }, []);

  const clearRoute = useCallback(() => {
    setState({
      startInput: '',
      endInput: '',
      startCoords: null,
      endCoords: null,
      route: null,
      alternativeRoute: null,
      showAlternative: false,
      isLoading: false,
      error: null,
      aiAnalysis: null,
      isAnalyzing: false,
      routeOptions: [],
      selectedRouteMode: 'fastest',
      activeRouteId: null,
    });
  }, []);

  return {
    ...state,
    setStartInput,
    setEndInput,
    setStartCoords,
    setEndCoords,
    setRouteMode,
    calculateRoute: calculateRouteHandler,
    calculateAlternative,
    toggleAlternative,
    clearRoute,
  };
}
