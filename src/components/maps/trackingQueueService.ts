// GetRido Maps - Tracking Queue Service (offline queue)
// Kolejka wysyłek lokalizacji dla trybu offline

import { MovementType } from './movementClassifier';

export interface QueuedLocation {
  userId: string;
  lat: number;
  lng: number;
  speed: number | null;
  heading: number | null;
  accuracy: number;
  timestamp: string;
  mode: 'work' | 'navigation';
  source: 'pwa';
  isDriving: boolean;
  movementType: MovementType;
}

const QUEUE_KEY = 'getrido_location_queue';
const MAX_QUEUE_SIZE = 300;

export const trackingQueueService = {
  /**
   * Dodaje punkt do kolejki (localStorage)
   * Jeśli kolejka przekroczy limit, usuwa najstarsze wpisy
   */
  enqueue(location: QueuedLocation): void {
    const queue = this.getQueue();
    queue.push(location);
    
    // FIFO - usuń najstarsze jeśli > MAX_QUEUE_SIZE
    while (queue.length > MAX_QUEUE_SIZE) {
      queue.shift();
    }
    
    try {
      localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
      console.log(`[TrackingQueue] Enqueued point. Queue size: ${queue.length}`);
    } catch (error) {
      console.error('[TrackingQueue] Failed to save queue:', error);
    }
  },

  /**
   * Pobiera całą kolejkę z localStorage
   */
  getQueue(): QueuedLocation[] {
    try {
      const data = localStorage.getItem(QUEUE_KEY);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  },

  /**
   * Czyści kolejkę
   */
  clearQueue(): void {
    try {
      localStorage.removeItem(QUEUE_KEY);
      console.log('[TrackingQueue] Queue cleared');
    } catch (error) {
      console.error('[TrackingQueue] Failed to clear queue:', error);
    }
  },

  /**
   * Zwraca liczbę punktów w kolejce
   */
  getQueueSize(): number {
    return this.getQueue().length;
  },

  /**
   * Sprawdza czy kolejka jest pusta
   */
  isEmpty(): boolean {
    return this.getQueueSize() === 0;
  },

  /**
   * Pobiera punkty z kolejki bez ich usuwania
   * (do przetwarzania przed wysyłką)
   */
  peek(count?: number): QueuedLocation[] {
    const queue = this.getQueue();
    return count ? queue.slice(0, count) : queue;
  },

  /**
   * Usuwa określoną liczbę punktów z początku kolejki
   * (po pomyślnej wysyłce)
   */
  dequeue(count: number): void {
    const queue = this.getQueue();
    const remaining = queue.slice(count);
    
    try {
      if (remaining.length > 0) {
        localStorage.setItem(QUEUE_KEY, JSON.stringify(remaining));
      } else {
        localStorage.removeItem(QUEUE_KEY);
      }
      console.log(`[TrackingQueue] Dequeued ${count} points. Remaining: ${remaining.length}`);
    } catch (error) {
      console.error('[TrackingQueue] Failed to dequeue:', error);
    }
  },

  /**
   * Pobiera statystyki kolejki
   */
  getStats(): { size: number; oldestTimestamp: string | null; newestTimestamp: string | null } {
    const queue = this.getQueue();
    return {
      size: queue.length,
      oldestTimestamp: queue.length > 0 ? queue[0].timestamp : null,
      newestTimestamp: queue.length > 0 ? queue[queue.length - 1].timestamp : null,
    };
  },
};
