// GetRido Maps - Routing Hook
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

export function useRouting() {
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
    setState(prev => ({ ...prev, startInput: value, error: null }));
  }, []);

  const setEndInput = useCallback((value: string) => {
    setState(prev => ({ ...prev, endInput: value, error: null }));
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

  const calculateRouteHandler = useCallback(async () => {
    const { startInput, endInput } = state;

    if (!startInput.trim() || !endInput.trim()) {
      setState(prev => ({ ...prev, error: 'Wprowadź punkt początkowy i końcowy' }));
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
      // Resolve start location
      const startLocation = await resolveLocation(startInput);
      if (!startLocation) {
        setState(prev => ({ 
          ...prev, 
          isLoading: false, 
          error: 'Nie znaleziono punktu początkowego' 
        }));
        return;
      }

      // Resolve end location
      const endLocation = await resolveLocation(endInput);
      if (!endLocation) {
        setState(prev => ({ 
          ...prev, 
          isLoading: false, 
          error: 'Nie znaleziono punktu końcowego' 
        }));
        return;
      }

      const startCoords = { lat: startLocation.lat, lng: startLocation.lng };
      const endCoords = { lat: endLocation.lat, lng: endLocation.lng };

      // Calculate route
      const route = await calculateRoute(startCoords, endCoords);
      
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
        startCoords,
        endCoords,
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
  }, [state.startInput, state.endInput, runAiAnalysis]);

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
    calculateRoute: calculateRouteHandler,
    calculateAlternative,
    toggleAlternative,
    clearRoute,
  };
}
