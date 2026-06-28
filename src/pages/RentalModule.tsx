import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRentalCompany } from '@/hooks/useRentalCompany';
import { RentalSubjectsList } from '@/components/rental/RentalSubjectsList';
import { RentalBookingsList } from '@/components/rental/RentalBookingsList';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  ClipboardList, Car, CalendarDays, Tag, Wallet, LayoutGrid, Loader2, Home,
} from 'lucide-react';

type ViewKey = 'pulpit' | 'rezerwacje' | 'pojazdy';

interface Tile {
  key: ViewKey | string;
  label: string;
  desc: string;
  icon: React.ComponentType<{ className?: string }>;
  gradient: string;
  ready: boolean;
}

const TILES: Tile[] = [
  { key: 'rezerwacje', label: 'Zlecenia na wynajem', desc: 'Rezerwacje, najemcy, statusy', icon: ClipboardList, gradient: 'from-blue-500 to-indigo-600', ready: true },
  { key: 'pojazdy', label: 'Pojazdy', desc: 'Flota na wynajem', icon: Car, gradient: 'from-emerald-500 to-teal-600', ready: true },
  { key: 'kalendarz', label: 'Kalendarz', desc: 'Dostępność (wkrótce)', icon: CalendarDays, gradient: 'from-slate-400 to-slate-500', ready: false },
  { key: 'cennik', label: 'Cennik', desc: 'Stawki h/doba/tydzień/mc (wkrótce)', icon: Tag, gradient: 'from-slate-400 to-slate-500', ready: false },
  { key: 'platnosci', label: 'Płatności', desc: 'Linki, kaucje (wkrótce)', icon: Wallet, gradient: 'from-slate-400 to-slate-500', ready: false },
];

const RAIL: { key: ViewKey; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: 'rezerwacje', label: 'Zlecenia na wynajem', icon: ClipboardList },
  { key: 'pojazdy', label: 'Pojazdy', icon: Car },
];

export default function RentalModule() {
  const navigate = useNavigate();
  const { loading, canUse, companyId, error } = useRentalCompany();
  const [view, setView] = useState<ViewKey>('pulpit');

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error === 'not_authenticated') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground">Zaloguj się, aby zobaczyć moduł Wynajem.</p>
        <Button onClick={() => navigate('/auth')}>Przejdź do logowania</Button>
      </div>
    );
  }

  if (!companyId || !canUse) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-muted-foreground">
          Moduł Wynajem nie jest aktywny dla tego konta
          {error === 'no_company' ? ' (brak przypisanej firmy).' : '.'}
        </p>
        <p className="text-xs text-muted-foreground">
          Wymagane: członkostwo w firmie + włączony moduł „rental” (company_modules).
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Nagłówek */}
      <div className="border-b border-border bg-card">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center gap-3">
          <LayoutGrid className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-xl font-bold">Wynajem</h1>
            <p className="text-xs text-muted-foreground">Moduł wynajmu — MVP (paczka 1+2)</p>
          </div>
          <div className="flex-1" />
          <Button variant="outline" size="sm" onClick={() => navigate('/')} className="gap-2">
            <Home className="h-4 w-4" /> Pulpit główny
          </Button>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-6 flex gap-4">
        {/* Boczny rail (jak w Warsztacie) */}
        <div className="hidden md:block w-[200px] flex-shrink-0 space-y-2 pr-3 border-r border-border">
          <button
            onClick={() => setView('pulpit')}
            className={`w-full text-left px-3 py-2 rounded-lg text-sm font-semibold transition-colors ${
              view === 'pulpit' ? 'bg-primary/10 text-primary' : 'text-foreground hover:bg-accent/50'
            }`}
          >
            🏠 Pulpit
          </button>
          {RAIL.map((r) => {
            const Icon = r.icon;
            return (
              <button
                key={r.key}
                onClick={() => setView(r.key)}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors ${
                  view === r.key ? 'bg-primary/10 text-primary ring-1 ring-primary/30' : 'text-foreground hover:bg-accent/50'
                }`}
              >
                <Icon className="h-4 w-4" /> {r.label}
              </button>
            );
          })}
        </div>

        {/* Treść */}
        <div className="flex-1 min-w-0">
          {view === 'pulpit' && (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {TILES.map((tile) => {
                const Icon = tile.icon;
                return (
                  <Card
                    key={tile.key}
                    onClick={() => tile.ready && setView(tile.key as ViewKey)}
                    className={`overflow-hidden transition-all ${
                      tile.ready ? 'cursor-pointer hover:shadow-lg hover:scale-[1.02]' : 'opacity-60 grayscale cursor-not-allowed'
                    }`}
                  >
                    <div className={`h-28 bg-gradient-to-br ${tile.gradient} flex items-center justify-center`}>
                      <Icon className="h-10 w-10 text-white/90" />
                    </div>
                    <div className="p-3">
                      <div className="font-semibold text-sm">{tile.label}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">{tile.desc}</div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}

          {view === 'rezerwacje' && <RentalBookingsList companyId={companyId} />}
          {view === 'pojazdy' && <RentalSubjectsList companyId={companyId} />}
        </div>
      </div>
    </div>
  );
}
