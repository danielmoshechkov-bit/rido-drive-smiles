// GetRido Maps - Routing Hook with GPS Fallback
import { useState, useCallback } from 'react';
import { 
  RouteResult, 
  resolveLocation, 
  calculateRoute,
  calculateAlternativeRoute,
  Coordinates 
} from './routingService';
import { analyzeRouteFree, AiAnalysisResult } from './freeAiAnalysis';

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

  const calculateRouteHandler = useCallback(async (gpsLocationOverride?: GpsLocation | null) => {
    const { startInput, endInput } = state;
    const effectiveGpsLocation = gpsLocationOverride ?? gpsLocation;

    // Validate: endInput is required
    if (!endInput.trim()) {
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
    }));

    try {
      // Użyj zapisanych współrzędnych z autocomplete lub rozwiąż adres
      let resolvedStartCoords = state.startCoords;
      let resolvedEndCoords = state.endCoords;
      let usedGpsFallback = false;

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
          usedGpsFallback = true;
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
        const endLocation = await resolveLocation(endInput);
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

      // Calculate route
      const route = await calculateRoute(resolvedStartCoords, resolvedEndCoords);
      
      if (!route) {
        setState(prev => ({ 
          ...prev, 
          isLoading: false, 
          error: 'Nie można wyznaczyć trasy' 
        }));
        return;
      }

      setState(prev => ({
        ...prev,
        startCoords: resolvedStartCoords,
        endCoords: resolvedEndCoords,
        route,
        isLoading: false,
        error: null,
      }));

      // Run AI analysis asynchronously (non-blocking)
      runAiAnalysis(route);

    } catch (error) {
      console.error('[useRouting] Error:', error);
      setState(prev => ({ 
        ...prev, 
        isLoading: false, 
        error: 'Wystąpił błąd podczas wyznaczania trasy' 
      }));
    }
  }, [state.startInput, state.endInput, state.startCoords, state.endCoords, gpsLocation, runAiAnalysis]);

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
    });
  }, []);

  return {
    ...state,
    setStartInput,
    setEndInput,
    setStartCoords,
    setEndCoords,
    calculateRoute: calculateRouteHandler,
    calculateAlternative,
    toggleAlternative,
    clearRoute,
  };
}
