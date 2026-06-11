// Centralized colour mapping for workshop order statuses.
// Distinct tones so admin/employees recognise the phase at a glance.
export type StatusTone =
  | 'blue'      // Nowe zlecenie
  | 'gray'      // Przyjęcie / Przydzielone / Diagnoza
  | 'red'       // Do wyceny — rzuca się w oczy, wymaga reakcji admina
  | 'yellow'    // Oczekuje na akceptację klienta
  | 'purple'    // Wycena wysłana / gotowa
  | 'amber'     // Dodatek do naprawy
  | 'green'     // Zaakceptowano / Zgoda / W trakcie
  | 'emerald'   // Gotowy do odbioru / Zadania wykonane
  | 'violet'    // Naprawione (brand GetRido)
  | 'slate';    // Zakończone

const TONE_MAP: Record<string, StatusTone> = {
  'Nowe zlecenie': 'gray',

  'Przyjęcie do serwisu': 'blue',
  'Przydzielone': 'blue',
  'Diagnoza': 'blue',

  'Do wyceny': 'red',
  'Oczekuje na akceptację': 'yellow',

  'Wycena gotowa': 'purple',
  'Wycena wysłana': 'purple',

  'Dodatek do naprawy': 'amber',

  'Akceptacja klienta': 'green',
  'Zaakceptowano': 'green',
  'Zgoda na naprawę': 'green',
  'W trakcie naprawy': 'green',

  'Zadania wykonane': 'emerald',
  'Gotowy do odbioru': 'emerald',

  'Naprawione': 'violet',

  'Zakończone': 'slate',
};

export function getStatusTone(name?: string | null): StatusTone {
  if (!name) return 'gray';
  return TONE_MAP[name] || 'gray';
}

export function getStatusStyle(name?: string | null) {
  const tone = getStatusTone(name);
  switch (tone) {
    case 'blue':
      return { tone, badge: 'bg-blue-500 text-white hover:bg-blue-600',
        row: 'bg-blue-50/70 hover:bg-blue-100/70', border: 'border-l-4 border-l-blue-500', dot: 'bg-blue-500' };
    case 'red':
      return { tone, badge: 'bg-red-500 text-white hover:bg-red-600 animate-pulse',
        row: 'bg-red-50/70 hover:bg-red-100/70', border: 'border-l-4 border-l-red-500', dot: 'bg-red-500' };
    case 'yellow':
      return { tone, badge: 'bg-yellow-400 text-yellow-950 hover:bg-yellow-500',
        row: 'bg-yellow-50/70 hover:bg-yellow-100/70', border: 'border-l-4 border-l-yellow-400', dot: 'bg-yellow-400' };
    case 'purple':
      return { tone, badge: 'bg-purple-500 text-white hover:bg-purple-600',
        row: 'bg-purple-50/70 hover:bg-purple-100/70', border: 'border-l-4 border-l-purple-500', dot: 'bg-purple-500' };
    case 'amber':
      return { tone, badge: 'bg-orange-500 text-white hover:bg-orange-600',
        row: 'bg-orange-50/70 hover:bg-orange-100/70', border: 'border-l-4 border-l-orange-500', dot: 'bg-orange-500' };
    case 'green':
      return { tone, badge: 'bg-green-500 text-white hover:bg-green-600',
        row: 'bg-green-50/70 hover:bg-green-100/70', border: 'border-l-4 border-l-green-500', dot: 'bg-green-500' };
    case 'emerald':
      return { tone, badge: 'bg-emerald-600 text-white hover:bg-emerald-700',
        row: 'bg-emerald-50/70 hover:bg-emerald-100/70', border: 'border-l-4 border-l-emerald-600', dot: 'bg-emerald-600' };
    case 'violet':
      return { tone, badge: 'bg-violet-600 text-white hover:bg-violet-700',
        row: 'bg-violet-50/70 hover:bg-violet-100/70', border: 'border-l-4 border-l-violet-600', dot: 'bg-violet-600' };
    case 'slate':
      return { tone, badge: 'bg-slate-700 text-white hover:bg-slate-800',
        row: 'bg-slate-100/70 hover:bg-slate-200/70', border: 'border-l-4 border-l-slate-700', dot: 'bg-slate-700' };
    default:
      return { tone: 'gray' as StatusTone, badge: 'bg-gray-200 text-gray-800 hover:bg-gray-300',
        row: 'hover:bg-accent/50', border: 'border-l-4 border-l-gray-300', dot: 'bg-gray-300' };
  }
}
