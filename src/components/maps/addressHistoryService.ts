// GetRido Maps - Address History Service (localStorage)

const HISTORY_KEY = 'getrido_address_history';
const MAX_HISTORY = 50;

export interface HistoryEntry {
  displayName: string;
  shortName: string;
  lat: number;
  lng: number;
  type: 'address' | 'my_location';
  timestamp: number;
}

export const addressHistoryService = {
  /**
   * Get address history from localStorage
   * @param limit Optional limit of entries to return
   */
  getHistory(limit?: number): HistoryEntry[] {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      const history: HistoryEntry[] = raw ? JSON.parse(raw) : [];
      return limit ? history.slice(0, limit) : history;
    } catch (error) {
      console.error('[addressHistoryService] Error reading history:', error);
      return [];
    }
  },

  /**
   * Add entry to history (moves duplicate to top)
   */
  addEntry(entry: Omit<HistoryEntry, 'timestamp'>): void {
    try {
      let history = this.getHistory();
      
      // Remove duplicate if exists (compare by lat/lng with tolerance)
      history = history.filter(h => 
        !(Math.abs(h.lat - entry.lat) < 0.0001 && Math.abs(h.lng - entry.lng) < 0.0001)
      );
      
      // Add new entry at the beginning
      history.unshift({ ...entry, timestamp: Date.now() });
      
      // Limit to MAX_HISTORY entries
      if (history.length > MAX_HISTORY) {
        history = history.slice(0, MAX_HISTORY);
      }
      
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    } catch (error) {
      console.error('[addressHistoryService] Error saving entry:', error);
    }
  },

  /**
   * Clear all history
   */
  clearHistory(): void {
    try {
      localStorage.removeItem(HISTORY_KEY);
    } catch (error) {
      console.error('[addressHistoryService] Error clearing history:', error);
    }
  },
};
