// GetRido Maps - Routing Hook
import { useState, useCallback } from 'react';
import { 
  RouteResult, 
  resolveLocation, 
  calculateRoute,
  Coordinates 
} from './routingService';

export interface RoutingState {
  startInput: string;
  endInput: string;
  startCoords: Coordinates | null;
  endCoords: Coordinates | null;
  route: RouteResult | null;
  isLoading: boolean;
  error: string | null;
}

export function useRouting() {
  const [state, setState] = useState<RoutingState>({
    startInput: '',
    endInput: '',
    startCoords: null,
    endCoords: null,
    route: null,
    isLoading: false,
    error: null,
  });

  const setStartInput = useCallback((value: string) => {
    setState(prev => ({ ...prev, startInput: value, error: null }));
  }, []);

  const setEndInput = useCallback((value: string) => {
    setState(prev => ({ ...prev, endInput: value, error: null }));
  }, []);

  const calculateRouteHandler = useCallback(async () => {
    const { startInput, endInput } = state;

    if (!startInput.trim() || !endInput.trim()) {
      setState(prev => ({ ...prev, error: 'Wprowadź punkt początkowy i końcowy' }));
      return;
    }

    setState(prev => ({ ...prev, isLoading: true, error: null, route: null }));

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

    } catch (error) {
      console.error('[useRouting] Error:', error);
      setState(prev => ({ 
        ...prev, 
        isLoading: false, 
        error: 'Wystąpił błąd podczas wyznaczania trasy' 
      }));
    }
  }, [state.startInput, state.endInput]);

  const clearRoute = useCallback(() => {
    setState({
      startInput: '',
      endInput: '',
      startCoords: null,
      endCoords: null,
      route: null,
      isLoading: false,
      error: null,
    });
  }, []);

  return {
    ...state,
    setStartInput,
    setEndInput,
    calculateRoute: calculateRouteHandler,
    clearRoute,
  };
}
