import type { LucideIcon } from 'lucide-react';

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

// Placeholdery: gradienty (cyklicznie). Podmień na zdjęcia przez `img`.
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

// Małe kafle-miniaturki 2-w-rzędzie (wzór bocznych kafli Warsztat & Auto). Przenośny.
export function TileGridNav({ tabs, activeTab, onTabChange, className }: TileGridNavProps) {
  const visible = tabs.filter((t) => t.visible !== false);
  return (
    <div className={`grid grid-cols-2 gap-1.5 ${className || ''}`}>
      {visible.map((tab, i) => {
        const Icon = tab.icon;
        const active = tab.value === activeTab;
        return (
          <button
            key={tab.value}
            onClick={() => onTabChange(tab.value)}
            className={`relative h-20 overflow-hidden rounded-lg transition-all ${active ? 'ring-2 ring-primary shadow-md' : 'hover:ring-2 hover:ring-primary/50 hover:shadow-sm'}`}
          >
            {tab.img ? (
              <img src={tab.img} alt={tab.label} className="h-full w-full object-cover" />
            ) : (
              <div className={`h-full w-full bg-gradient-to-br ${GRADIENTS[i % GRADIENTS.length]}`} />
            )}
            {!tab.img && <Icon className="absolute right-1.5 top-1.5 h-5 w-5 text-white/30" />}
            {/* ciemny gradient u dołu + napis (jak Warsztat) */}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-3/5 bg-gradient-to-t from-black/95 via-black/65 to-transparent" />
            <span
              className="absolute inset-x-1 bottom-1.5 text-center text-xs font-semibold leading-tight text-white"
              style={{ textShadow: '0 1px 4px rgba(0,0,0,1)' }}
            >
              {tab.label}
            </span>
            {tab.badge ? (
              <span className="absolute left-1 top-1 rounded-full bg-white/90 px-1.5 text-[10px] font-semibold text-primary">{tab.badge}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
