// GetRido Maps - Address History Service (localStorage)
// Osobne historie dla start/end

const START_HISTORY_KEY = 'getrido_address_history_start';
const END_HISTORY_KEY = 'getrido_address_history_end';
const LEGACY_HISTORY_KEY = 'getrido_address_history'; // Stary klucz dla kompatybilności
const MAX_HISTORY = 50;

export interface HistoryEntry {
  displayName: string;
  shortName: string;
  lat: number;
  lng: number;
  type: 'address' | 'my_location';
  timestamp: number;
}

/**
 * Pobierz historię z localStorage
 */
function getHistoryFromStorage(key: string): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch (error) {
    console.error('[addressHistoryService] Error reading history:', error);
    return [];
  }
}

/**
 * Zapisz historię do localStorage
 */
function saveHistoryToStorage(key: string, history: HistoryEntry[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(history));
  } catch (error) {
    console.error('[addressHistoryService] Error saving history:', error);
  }
}

/**
 * Dodaj wpis do historii (przesuwa duplikat na górę)
 */
function addEntryToHistory(key: string, entry: Omit<HistoryEntry, 'timestamp'>): void {
  let history = getHistoryFromStorage(key);
  
  // Usuń duplikat jeśli istnieje (porównaj po lat/lng z tolerancją)
  history = history.filter(h => 
    !(Math.abs(h.lat - entry.lat) < 0.0001 && Math.abs(h.lng - entry.lng) < 0.0001)
  );
  
  // Dodaj nowy wpis na początek
  history.unshift({ ...entry, timestamp: Date.now() });
  
  // Ogranicz do MAX_HISTORY wpisów
  if (history.length > MAX_HISTORY) {
    history = history.slice(0, MAX_HISTORY);
  }
  
  saveHistoryToStorage(key, history);
}

export const addressHistoryService = {
  /**
   * Pobierz historię dla pola START
   * @param limit Opcjonalny limit wpisów
   */
  getStartHistory(limit?: number): HistoryEntry[] {
    const history = getHistoryFromStorage(START_HISTORY_KEY);
    // Fallback: migracja ze starego klucza
    if (history.length === 0) {
      const legacy = getHistoryFromStorage(LEGACY_HISTORY_KEY);
      if (legacy.length > 0) {
        saveHistoryToStorage(START_HISTORY_KEY, legacy);
        return limit ? legacy.slice(0, limit) : legacy;
      }
    }
    return limit ? history.slice(0, limit) : history;
  },

  /**
   * Pobierz historię dla pola END (bez "my_location")
   * @param limit Opcjonalny limit wpisów
   */
  getEndHistory(limit?: number): HistoryEntry[] {
    const history = getHistoryFromStorage(END_HISTORY_KEY);
    // Filtruj "my_location" dla pola end
    const filtered = history.filter(h => h.type !== 'my_location');
    return limit ? filtered.slice(0, limit) : filtered;
  },

  /**
   * Dodaj wpis do historii START
   */
  addStartEntry(entry: Omit<HistoryEntry, 'timestamp'>): void {
    addEntryToHistory(START_HISTORY_KEY, entry);
  },

  /**
   * Dodaj wpis do historii END
   * UWAGA: Nigdy nie zapisuje 'my_location' w historii end
   */
  addEndEntry(entry: Omit<HistoryEntry, 'timestamp'>): void {
    // Nie zapisuj "Twoja lokalizacja" w historii end
    if (entry.type === 'my_location') {
      console.log('[addressHistoryService] Skipping my_location for end history');
      return;
    }
    addEntryToHistory(END_HISTORY_KEY, entry);
  },

  /**
   * Wyczyść historię START
   */
  clearStartHistory(): void {
    try {
      localStorage.removeItem(START_HISTORY_KEY);
    } catch (error) {
      console.error('[addressHistoryService] Error clearing start history:', error);
    }
  },

  /**
   * Wyczyść historię END
   */
  clearEndHistory(): void {
    try {
      localStorage.removeItem(END_HISTORY_KEY);
    } catch (error) {
      console.error('[addressHistoryService] Error clearing end history:', error);
    }
  },

  /**
   * Wyczyść całą historię (oba pola)
   */
  clearAllHistory(): void {
    this.clearStartHistory();
    this.clearEndHistory();
  },

  // === Backward compatibility ===
  
  /**
   * @deprecated Użyj getStartHistory lub getEndHistory
   */
  getHistory(limit?: number): HistoryEntry[] {
    return this.getStartHistory(limit);
  },

  /**
   * @deprecated Użyj addStartEntry lub addEndEntry
   */
  addEntry(entry: Omit<HistoryEntry, 'timestamp'>): void {
    this.addStartEntry(entry);
  },

  /**
   * @deprecated Użyj clearStartHistory lub clearEndHistory
   */
  clearHistory(): void {
    this.clearAllHistory();
  },
};
