import { useState } from 'react';
import { RentalBookingsList } from '@/components/rental/RentalBookingsList';
import { RentalVehiclesList } from '@/components/rental/RentalVehiclesList';
import { RentalInsurancePanel } from '@/components/rental/RentalInsurancePanel';
import { RentalDocuments } from '@/components/rental/RentalDocuments';
import { RentalProtocol } from '@/components/rental/RentalProtocol';
import { RentalOwnersTab } from '@/components/rental/RentalOwnersTab';
import { RentalPartnerFleets } from '@/components/rental/RentalPartnerFleets';
import { RentalPricing } from '@/components/rental/RentalPricing';
import { RentalCalendar } from '@/components/rental/RentalCalendar';
import { RentalPaymentsPanel } from '@/components/rental/RentalPaymentsPanel';
import { RentalReminders } from '@/components/rental/RentalReminders';
import { RentalInvoices } from '@/components/rental/RentalInvoices';
import { RentalMarketplace } from '@/components/rental/RentalMarketplace';
import { RentalKokpit } from '@/components/rental/RentalKokpit';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  ClipboardList, Car, CalendarDays, Tag, FileSignature, Camera, ShieldCheck,
  Bell, Wallet, Megaphone, LayoutGrid, ArrowLeft, Users, Network, FileText,
} from 'lucide-react';

/**
 * Moduł „Flota & Wynajem". Układ 1:1 jak Warsztat: boczny rail z MINI-KAFELKAMI
 * (grid 2-kol, gradient+ikona, ring na aktywnym) + treść sekcji po prawej.
 * Tła kafelków gradientowe — Lovable podmieni na zdjęcia.
 */
type ViewKey =
  | 'pulpit' | 'rezerwacje' | 'pojazdy' | 'oc' | 'umowy' | 'protokol'
  | 'nasz-wynajem' | 'floty-partnerskie'
  | 'kalendarz' | 'cennik' | 'przypomnienia' | 'platnosci' | 'faktury' | 'gielda';

interface Section {
  key: Exclude<ViewKey, 'pulpit'>;
  label: string; desc: string;
  icon: React.ComponentType<{ className?: string }>;
  gradient: string; ready: boolean; soon?: string;
}

const SECTIONS: Section[] = [
  { key: 'rezerwacje', label: 'Zlecenia na wynajem', desc: 'Rezerwacje, najemcy, statusy', icon: ClipboardList, gradient: 'from-blue-500 to-indigo-600', ready: true },
  { key: 'pojazdy', label: 'Pojazdy', desc: 'Karty aut: dokumenty, serwis, OC, zdjęcia', icon: Car, gradient: 'from-emerald-500 to-teal-600', ready: true },
  { key: 'nasz-wynajem', label: 'Nasz wynajem', desc: 'Właściciele aut i opłaty', icon: Users, gradient: 'from-orange-500 to-amber-600', ready: true },
  { key: 'floty-partnerskie', label: 'Floty partnerskie', desc: 'Partnerzy B2B', icon: Network, gradient: 'from-sky-500 to-blue-600', ready: true },
  { key: 'oc', label: 'OC / Przegląd', desc: 'Daty, polisy, alerty', icon: ShieldCheck, gradient: 'from-green-500 to-emerald-600', ready: true },
  { key: 'umowy', label: 'Umowy', desc: 'Szablony, generowanie, wysyłka', icon: FileSignature, gradient: 'from-rose-500 to-pink-600', ready: true },
  { key: 'protokol', label: 'Protokół', desc: 'Wydanie/zwrot, zdjęcia, szkody', icon: Camera, gradient: 'from-cyan-500 to-blue-600', ready: true },
  { key: 'kalendarz', label: 'Kalendarz', desc: 'Dostępność, anti-double-booking', icon: CalendarDays, gradient: 'from-violet-500 to-purple-600', ready: true },
  { key: 'cennik', label: 'Cennik', desc: 'Stawki h/doba/tydz/mc + rabaty', icon: Tag, gradient: 'from-amber-500 to-orange-600', ready: true },
  { key: 'platnosci', label: 'Płatności + Kaucja', desc: 'Ręczne + link P24', icon: Wallet, gradient: 'from-teal-500 to-cyan-600', ready: true },
  { key: 'faktury', label: 'Faktury', desc: 'Wystaw → PDF/KSeF/e‑mail', icon: FileText, gradient: 'from-indigo-500 to-blue-600', ready: true },
  { key: 'przypomnienia', label: 'Przypomnienia', desc: 'SMS/e‑mail przed zdarzeniem', icon: Bell, gradient: 'from-yellow-500 to-amber-600', ready: true },
  { key: 'gielda', label: 'Giełda', desc: 'Publikacja ofert (wynajem/sprzedaż)', icon: Megaphone, gradient: 'from-fuchsia-500 to-purple-600', ready: true },
];

export function RentalDashboard({ companyId }: { companyId: string }) {
  const [view, setView] = useState<ViewKey>('pulpit');
  const current = SECTIONS.find(s => s.key === view);

  const MiniTile = ({ s }: { s: Section }) => {
    const Icon = s.icon;
    const active = view === s.key;
    return (
      <button onClick={() => setView(s.key)}
        className={`relative rounded-lg overflow-hidden h-20 transition-all group ${active ? 'ring-2 ring-primary shadow-md' : 'hover:ring-2 hover:ring-primary/50'}`}>
        <div className={`absolute inset-0 bg-gradient-to-br ${s.gradient}`} />
        <div className="absolute inset-x-0 bottom-0 h-3/5 bg-gradient-to-t from-black/95 via-black/60 to-transparent pointer-events-none" />
        <Icon className="absolute top-2 left-2 h-5 w-5 text-white/90" />
        <span className="absolute bottom-1.5 left-1 right-1 text-[11px] font-semibold text-white leading-tight text-center"
          style={{ textShadow: '0 1px 4px rgba(0,0,0,1)' }}>{s.label}</span>
      </button>
    );
  };

  const Placeholder = ({ section }: { section: Section }) => {
    const Icon = section.icon;
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" className="gap-2" onClick={() => setView('pulpit')}><ArrowLeft className="h-4 w-4" /> Pulpit</Button>
        <Card className="p-10 flex flex-col items-center text-center gap-3">
          <div className={`h-16 w-16 rounded-2xl bg-gradient-to-br ${section.gradient} flex items-center justify-center`}><Icon className="h-8 w-8 text-white/90" /></div>
          <div className="text-lg font-semibold">{section.label}</div>
          <div className="text-sm text-muted-foreground max-w-md">{section.desc}</div>
          <div className="text-xs rounded-full bg-muted px-3 py-1 text-muted-foreground">Sekcja w przygotowaniu{section.soon ? ` · etap: ${section.soon}` : ''}</div>
        </Card>
      </div>
    );
  };

  return (
    <div className="flex gap-4">
      {/* Boczny rail — MINI-KAFELKI 1:1 jak Warsztat */}
      <div className="hidden md:block w-[210px] flex-shrink-0 space-y-2 pr-3 border-r border-border">
        <button onClick={() => setView('pulpit')}
          className={`w-full text-left px-3 py-2 rounded-lg text-sm font-semibold transition-colors ${view === 'pulpit' ? 'bg-primary/10 text-primary' : 'text-primary hover:bg-primary/10'}`}>
          🏠 Pulpit
        </button>
        <div className="grid grid-cols-2 gap-1.5">
          {SECTIONS.map(s => <MiniTile key={s.key} s={s} />)}
        </div>
      </div>

      {/* Mobile: poziomy pasek sekcji */}
      <div className="md:hidden w-full">
        <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1">
          <button onClick={() => setView('pulpit')} className={`px-3 py-1.5 rounded-full text-xs whitespace-nowrap ${view === 'pulpit' ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>Pulpit</button>
          {SECTIONS.map(s => <button key={s.key} onClick={() => setView(s.key)} className={`px-3 py-1.5 rounded-full text-xs whitespace-nowrap ${view === s.key ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>{s.label}</button>)}
        </div>
      </div>

      {/* Treść */}
      <div className="flex-1 min-w-0">
        {view === 'pulpit' && (
          <div className="space-y-5">
            <Card className="bg-primary/5 border-primary/20"><div className="px-4 py-2 text-sm flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="font-semibold text-primary">Jak zacząć:</span>
              <button className="hover:underline" onClick={() => setView('pojazdy')}>1. Dodaj auto</button> →
              <button className="hover:underline" onClick={() => setView('cennik')}>2. Ustaw cennik</button> →
              <button className="hover:underline" onClick={() => setView('rezerwacje')}>3. Wynajmij pojazd</button> →
              <button className="hover:underline" onClick={() => setView('rezerwacje')}>4. Umowa / Faktura / Płatność (w zleceniu)</button>
            </div></Card>
            <RentalKokpit companyId={companyId} onNavigate={(v) => setView(v as ViewKey)} />
            <div className="flex items-center gap-2 text-muted-foreground text-sm"><LayoutGrid className="h-4 w-4" /> Wybierz sekcję</div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {SECTIONS.map((tile) => {
                const Icon = tile.icon;
                return (
                  <Card key={tile.key} onClick={() => setView(tile.key)} className="overflow-hidden cursor-pointer transition-all hover:shadow-lg hover:scale-[1.02]">
                    <div className={`h-24 bg-gradient-to-br ${tile.gradient} flex items-center justify-center`}><Icon className="h-9 w-9 text-white/90" /></div>
                    <div className="p-3"><div className="font-semibold text-sm">{tile.label}</div><div className="text-xs text-muted-foreground mt-0.5">{tile.desc}</div></div>
                  </Card>
                );
              })}
            </div>
          </div>
        )}

        {view === 'rezerwacje' && <RentalBookingsList companyId={companyId} />}
        {view === 'pojazdy' && <RentalVehiclesList companyId={companyId} />}
        {view === 'nasz-wynajem' && <RentalOwnersTab companyId={companyId} />}
        {view === 'floty-partnerskie' && <RentalPartnerFleets companyId={companyId} />}
        {view === 'oc' && <RentalInsurancePanel companyId={companyId} />}
        {view === 'umowy' && <RentalDocuments companyId={companyId} />}
        {view === 'protokol' && <RentalProtocol companyId={companyId} />}
        {view === 'cennik' && <RentalPricing companyId={companyId} />}
        {view === 'kalendarz' && <RentalCalendar companyId={companyId} />}
        {view === 'platnosci' && <RentalPaymentsPanel companyId={companyId} />}
        {view === 'faktury' && <RentalInvoices companyId={companyId} />}
        {view === 'przypomnienia' && <RentalReminders companyId={companyId} />}
        {view === 'gielda' && <RentalMarketplace companyId={companyId} />}
        {current && !current.ready && <Placeholder section={current} />}
      </div>
    </div>
  );
}
