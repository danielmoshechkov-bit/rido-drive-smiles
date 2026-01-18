// GetRido Maps - Movement Classifier (pieszo vs jazda)
// Klasyfikacja ruchu dla Fleet Live i Traffic Analysis

export type MovementType = 'stationary' | 'walking' | 'driving' | 'unknown';

export interface ClassificationResult {
  type: MovementType;
  isDriving: boolean;
  isLowQuality: boolean;
  speedKmh: number;
}

interface HistoryEntry {
  type: MovementType;
  timestamp: number;
}

// Historia dla wykrywania stabilności (ostatnie 20s)
const movementHistory: HistoryEntry[] = [];
const HISTORY_WINDOW_MS = 20000; // 20 sekund
const MIN_STABLE_SAMPLES = 4; // minimum 4 próbki (co 5s = 20s)

/**
 * Klasyfikuje typ ruchu na podstawie prędkości i dokładności GPS
 * 
 * @param speedMps - prędkość w m/s (może być null)
 * @param accuracy - dokładność GPS w metrach
 * @param timestamp - znacznik czasu (Date.now())
 * @returns wynik klasyfikacji z flagami isDriving i isLowQuality
 */
export function classifyMovement(
  speedMps: number | null,
  accuracy: number,
  timestamp: number = Date.now()
): ClassificationResult {
  const speedKmh = (speedMps ?? 0) * 3.6;
  
  // Low quality check - dokładność > 80m = nie używamy do traffic analysis
  const isLowQuality = accuracy > 80;
  
  // Natychmiastowa klasyfikacja na podstawie prędkości
  let type: MovementType = 'unknown';
  
  if (speedKmh < 2) {
    type = 'stationary';
  } else if (speedKmh >= 2 && speedKmh < 8) {
    type = 'walking';
  } else if (speedKmh >= 8) {
    type = 'driving';
  }
  
  // Dodaj do historii
  movementHistory.push({ type, timestamp });
  
  // Wyczyść stare wpisy (starsze niż 20s)
  const cutoff = timestamp - HISTORY_WINDOW_MS;
  while (movementHistory.length > 0 && movementHistory[0].timestamp < cutoff) {
    movementHistory.shift();
  }
  
  // Sprawdź stabilność (ten sam typ przez 20s = min 4 próbki)
  const isStable = movementHistory.length >= MIN_STABLE_SAMPLES && 
    movementHistory.every(h => h.type === type);
  
  // Klasyfikuj jako driving tylko jeśli:
  // - typ = driving
  // - stabilne przez 20s
  // - dobra jakość GPS (accuracy <= 80m)
  const isDriving = type === 'driving' && isStable && !isLowQuality;
  
  return { 
    type, 
    isDriving, 
    isLowQuality, 
    speedKmh 
  };
}

/**
 * Resetuje historię ruchu (np. przy starcie nowej sesji)
 */
export function resetMovementHistory(): void {
  movementHistory.length = 0;
}

/**
 * Sprawdza czy bieżący ruch można uznać za jazdę samochodem
 * Używane do filtrowania danych do traffic analysis
 */
export function isCurrentlyDriving(): boolean {
  if (movementHistory.length < MIN_STABLE_SAMPLES) return false;
  
  const recentEntries = movementHistory.slice(-MIN_STABLE_SAMPLES);
  return recentEntries.every(h => h.type === 'driving');
}

/**
 * Pobiera aktualną prędkość z ostatniej próbki
 */
export function getLastClassification(): ClassificationResult | null {
  if (movementHistory.length === 0) return null;
  
  const last = movementHistory[movementHistory.length - 1];
  return {
    type: last.type,
    isDriving: last.type === 'driving',
    isLowQuality: false,
    speedKmh: 0,
  };
}
