// GetRido Maps - Address Autocomplete Hook
import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchAddressSuggestions, AddressSuggestion } from './autocompleteService';

interface AutocompleteState {
  suggestions: AddressSuggestion[];
  isLoading: boolean;
  isOpen: boolean;
  highlightedIndex: number;
}

interface UseAddressAutocompleteReturn extends AutocompleteState {
  handleSelect: (suggestion: AddressSuggestion) => void;
  handleKeyDown: (e: React.KeyboardEvent) => void;
  closeSuggestions: () => void;
  openIfHasSuggestions: () => void;
}

const DEBOUNCE_MS = 350;
const MIN_QUERY_LENGTH = 2;

export function useAddressAutocomplete(
  inputValue: string,
  onSelect: (suggestion: AddressSuggestion) => void
): UseAddressAutocompleteReturn {
  const [state, setState] = useState<AutocompleteState>({
    suggestions: [],
    isLoading: false,
    isOpen: false,
    highlightedIndex: 0,
  });

  const abortControllerRef = useRef<AbortController | null>(null);
  const isSelectingRef = useRef(false);

  // Debounced search
  useEffect(() => {
    // Jeśli właśnie wybrano sugestię, nie szukaj ponownie
    if (isSelectingRef.current) {
      isSelectingRef.current = false;
      return;
    }

    // Anuluj poprzednie zapytanie
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Za krótkie zapytanie
    if (inputValue.trim().length < MIN_QUERY_LENGTH) {
      setState(prev => ({
        ...prev,
        suggestions: [],
        isOpen: false,
        isLoading: false,
        highlightedIndex: 0,
      }));
      return;
    }

    setState(prev => ({ ...prev, isLoading: true }));

    const timeoutId = setTimeout(async () => {
      abortControllerRef.current = new AbortController();

      try {
        const results = await fetchAddressSuggestions(
          inputValue,
          abortControllerRef.current.signal
        );

        setState(prev => ({
          ...prev,
          suggestions: results,
          isOpen: results.length > 0,
          isLoading: false,
          highlightedIndex: 0,
        }));
      } catch (error) {
        // Błąd obsłużony w serwisie
        setState(prev => ({ ...prev, isLoading: false }));
      }
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [inputValue]);

  // Cleanup przy unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const handleSelect = useCallback((suggestion: AddressSuggestion) => {
    isSelectingRef.current = true;
    setState(prev => ({
      ...prev,
      isOpen: false,
      suggestions: [],
      highlightedIndex: 0,
    }));
    onSelect(suggestion);
  }, [onSelect]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!state.isOpen || state.suggestions.length === 0) {
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setState(prev => ({
          ...prev,
          highlightedIndex: Math.min(
            prev.highlightedIndex + 1,
            prev.suggestions.length - 1
          ),
        }));
        break;

      case 'ArrowUp':
        e.preventDefault();
        setState(prev => ({
          ...prev,
          highlightedIndex: Math.max(prev.highlightedIndex - 1, 0),
        }));
        break;

      case 'Enter':
        e.preventDefault();
        if (state.suggestions[state.highlightedIndex]) {
          handleSelect(state.suggestions[state.highlightedIndex]);
        }
        break;

      case 'Escape':
        e.preventDefault();
        setState(prev => ({ ...prev, isOpen: false }));
        break;

      case 'Tab':
        // Zamknij dropdown przy Tab
        setState(prev => ({ ...prev, isOpen: false }));
        break;
    }
  }, [state.isOpen, state.suggestions, state.highlightedIndex, handleSelect]);

  const closeSuggestions = useCallback(() => {
    setState(prev => ({ ...prev, isOpen: false }));
  }, []);

  const openIfHasSuggestions = useCallback(() => {
    setState(prev => ({
      ...prev,
      isOpen: prev.suggestions.length > 0,
    }));
  }, []);

  return {
    ...state,
    handleSelect,
    handleKeyDown,
    closeSuggestions,
    openIfHasSuggestions,
  };
}
