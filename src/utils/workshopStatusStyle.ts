// Centralized colour mapping for workshop order statuses.
// Tones: gray (new / received) → yellow (quoting / waiting client) → green (approved / in-repair) → red (done).
export type StatusTone = 'gray' | 'yellow' | 'green' | 'red';

const TONE_MAP: Record<string, StatusTone> = {
  'Nowe zlecenie': 'gray',
  'Przyjęcie do serwisu': 'gray',
  'Przydzielone': 'gray',
  'Diagnoza': 'gray',

  'Do wyceny': 'yellow',
  'Oczekuje na akceptację': 'yellow',
  'Wycena gotowa': 'yellow',
  'Wycena wysłana': 'yellow',
  'Dodatek do naprawy': 'yellow',

  'Akceptacja klienta': 'green',
  'Zaakceptowano': 'green',
  'Zgoda na naprawę': 'green',
  'W trakcie naprawy': 'green',
  'Zadania wykonane': 'green',
  'Gotowy do odbioru': 'green',

  'Naprawione': 'red',
  'Zakończone': 'red',
};

export function getStatusTone(name?: string | null): StatusTone {
  if (!name) return 'gray';
  return TONE_MAP[name] || 'gray';
}

export function getStatusStyle(name?: string | null) {
  const tone = getStatusTone(name);
  switch (tone) {
    case 'yellow':
      return {
        tone,
        badge: 'bg-yellow-400 text-yellow-950 hover:bg-yellow-500',
        row: 'bg-yellow-50/70 hover:bg-yellow-100/70',
        border: 'border-l-4 border-l-yellow-400',
        dot: 'bg-yellow-400',
      };
    case 'green':
      return {
        tone,
        badge: 'bg-green-500 text-white hover:bg-green-600',
        row: 'bg-green-50/70 hover:bg-green-100/70',
        border: 'border-l-4 border-l-green-500',
        dot: 'bg-green-500',
      };
    case 'red':
      return {
        tone,
        badge: 'bg-red-500 text-white hover:bg-red-600',
        row: 'bg-red-50/70 hover:bg-red-100/70',
        border: 'border-l-4 border-l-red-500',
        dot: 'bg-red-500',
      };
    default:
      return {
        tone,
        badge: 'bg-gray-200 text-gray-800 hover:bg-gray-300',
        row: 'hover:bg-accent/50',
        border: 'border-l-4 border-l-gray-300',
        dot: 'bg-gray-300',
      };
  }
}
