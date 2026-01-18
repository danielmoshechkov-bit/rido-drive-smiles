// Location data logging service for future traffic analysis
// Data is kept locally - not sent to any server at this stage

interface LocationLog {
  timestamp: number;
  lat: number;
  lng: number;
  speed: number | null;
  heading: number | null;
  accuracy: number;
}

const MAX_BUFFER_SIZE = 1000;
const locationBuffer: LocationLog[] = [];

export const locationService = {
  logPosition(log: LocationLog): void {
    locationBuffer.push(log);
    if (locationBuffer.length > MAX_BUFFER_SIZE) {
      locationBuffer.shift(); // FIFO - remove oldest
    }
  },

  getRecentLogs(count: number = 100): LocationLog[] {
    return locationBuffer.slice(-count);
  },

  clearLogs(): void {
    locationBuffer.length = 0;
  },

  getBufferSize(): number {
    return locationBuffer.length;
  },
};
