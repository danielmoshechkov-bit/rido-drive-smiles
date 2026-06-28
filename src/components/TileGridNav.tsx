import type { LucideIcon } from 'lucide-react';
import { Card } from '@/components/ui/card';

export interface TileNavItem {
  value: string;
  label: string;
  icon: LucideIcon;
  img?: string;        // prawdziwe zdjęcie (gdy dojdzie); brak = gradient-placeholder
  visible?: boolean;
  badge?: number;
}

interface TileGridNavProps {
  tabs: TileNavItem[];
  activeTab: string;
  onTabChange: (value: string) => void;
  className?: string;
}

// Placeholdery: gradienty (cyklicznie) — fioletowo-pochodne + akcenty. Podmień na zdjęcia przez `img`.
const GRADIENTS = [
  'from-violet-500 to-purple-700',
  'from-sky-500 to-blue-700',
  'from-emerald-500 to-teal-700',
  'from-amber-500 to-orange-600',
  'from-rose-500 to-pink-700',
  'from-indigo-500 to-violet-700',
  'from-cyan-500 to-sky-700',
  'from-fuchsia-500 to-purple-700',
  'from-lime-500 to-emerald-700',
  'from-slate-500 to-slate-700',
];

// Siatka dużych kafli-zdjęć jako nawigacja (wzór Warsztat & Auto). Przenośny.
export function TileGridNav({ tabs, activeTab, onTabChange, className }: TileGridNavProps) {
  const visible = tabs.filter((t) => t.visible !== false);
  return (
    <div className={`grid grid-cols-2 gap-4 md:grid-cols-4 ${className || ''}`}>
      {visible.map((tab, i) => {
        const Icon = tab.icon;
        const active = tab.value === activeTab;
        return (
          <Card
            key={tab.value}
            onClick={() => onTabChange(tab.value)}
            className={`relative cursor-pointer overflow-hidden transition-all hover:scale-[1.03] hover:shadow-lg ${active ? 'ring-2 ring-primary shadow-md' : ''}`}
          >
            <div className="relative h-28">
              {tab.img ? (
                <img src={tab.img} alt={tab.label} className="h-full w-full object-cover" />
              ) : (
                <div className={`h-full w-full bg-gradient-to-br ${GRADIENTS[i % GRADIENTS.length]}`} />
              )}
              {/* ikona w tle (tylko placeholder) */}
              {!tab.img && <Icon className="absolute right-2 top-2 h-8 w-8 text-white/30" />}
              {/* przyciemnienie + napis na dole (jak Warsztat) */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/15 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 p-3">
                <span className="text-sm font-semibold text-white drop-shadow-lg">{tab.label}</span>
              </div>
              {tab.badge ? (
                <span className="absolute left-2 top-2 rounded-full bg-white/90 px-1.5 text-xs font-semibold text-primary">{tab.badge}</span>
              ) : null}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
