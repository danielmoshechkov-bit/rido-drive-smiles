import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { useWorkshopOrders, useWorkshopProviderId } from '@/hooks/useWorkshop';
import { WorkshopOrdersList } from './WorkshopOrdersList';
import { WorkshopOrderDetail } from './WorkshopOrderDetail';
import { WorkshopClientsList } from './WorkshopClientsList';
import { WorkshopVehiclesList } from './WorkshopVehiclesList';
import { WorkshopVehicleDetail } from './WorkshopVehicleDetail';
import { WorkshopScheduler } from './WorkshopScheduler';
import { WorkshopSales } from './WorkshopSales';
import { WorkshopReports } from './WorkshopReports';
import { WorkshopWarehouse } from './WorkshopWarehouse';
import { WorkshopTireStorage } from './WorkshopTireStorage';
import { WorkshopRepairData } from './WorkshopRepairData';
import { WorkshopSettings } from './WorkshopSettings';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

import tileZlecenia from '@/assets/workshop/tile-zlecenia.jpg';
import tileZadania from '@/assets/workshop/tile-zadania.jpg';
import tileTerminarz from '@/assets/workshop/tile-terminarz.jpg';
import tileZakupy from '@/assets/workshop/tile-zakupy.jpg';
import tileSprzedaz from '@/assets/workshop/tile-sprzedaz.jpg';
import tileTowary from '@/assets/workshop/tile-towary.jpg';
import tileKlienci from '@/assets/workshop/tile-klienci.jpg';
import tilePojazdy from '@/assets/workshop/tile-pojazdy.jpg';
import tileRaporty from '@/assets/workshop/tile-raporty.jpg';
import tileMagazyn from '@/assets/workshop/tile-magazyn.jpg';
import tilePrzechodnia from '@/assets/workshop/tile-przechowalnia.jpg';
import tileDaneNaprawcze from '@/assets/workshop/tile-dane-naprawcze.jpg';
import tileUstawienia from '@/assets/workshop/tile-ustawienia.jpg';

const modules = [
  { key: 'zlecenia', label: 'Zlecenia', img: tileZlecenia, ready: true },
  { key: 'zadania', label: 'Zadania', img: tileZadania, ready: false },
  { key: 'terminarz', label: 'Terminarz', img: tileTerminarz, ready: true },
  { key: 'zakupy', label: 'Zakupy', img: tileZakupy, ready: false },
  { key: 'sprzedaz', label: 'Sprzedaż', img: tileSprzedaz, ready: true },
  { key: 'towary', label: 'Towary', img: tileTowary, ready: false },
  { key: 'klienci', label: 'Klienci', img: tileKlienci, ready: true },
  { key: 'pojazdy', label: 'Pojazdy', img: tilePojazdy, ready: true },
  { key: 'raporty', label: 'Raporty', img: tileRaporty, ready: true },
  { key: 'magazyn', label: 'Magazyn', img: tileMagazyn, ready: true },
  { key: 'przechowalnia', label: 'Przechowalnia', img: tilePrzechodnia, ready: true },
  { key: 'dane-naprawcze', label: 'Dane naprawcze', img: tileDaneNaprawcze, ready: true },
  { key: 'ustawienia', label: 'Ustawienia', img: tileUstawienia, ready: true },
];

interface WorkshopDashboardProps {
  providerId?: string | null;
}

function WorkshopSidebar({ activeModule, onNavigate }: { activeModule: string; onNavigate: (key: string | null) => void }) {
  return (
    <div className="hidden md:block w-[200px] flex-shrink-0 space-y-2 pr-3 border-r border-border">
      <button
        onClick={() => onNavigate(null)}
        className="w-full text-left px-3 py-2 rounded-lg text-sm font-semibold text-primary hover:bg-primary/10 transition-colors"
      >
        🏠 Pulpit
      </button>
      <div className="grid grid-cols-2 gap-1.5">
        {modules.filter(m => m.ready).map(m => (
          <button
            key={m.key}
            onClick={() => onNavigate(m.key)}
            className={`relative rounded-lg overflow-hidden h-20 transition-all group ${
              activeModule === m.key
                ? 'ring-2 ring-[hsl(45,100%,50%)] shadow-md shadow-[hsl(45,100%,50%)]/30'
                : 'hover:ring-2 hover:ring-[hsl(45,100%,70%)] hover:shadow-sm'
            }`}
          >
            <img src={m.img} alt={m.label} className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
            <span className="absolute bottom-1 left-1 right-1 text-[11px] font-bold text-white leading-tight text-center drop-shadow-lg">
              {m.label}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function MobileBackButton({ onBack, label = 'Pulpit' }: { onBack: () => void; label?: string }) {
  return (
    <button
      onClick={onBack}
      className="md:hidden flex items-center gap-1.5 text-sm text-primary font-medium mb-3 hover:underline"
    >
      <ArrowLeft className="h-4 w-4" /> {label}
    </button>
  );
}

export function WorkshopDashboard({ providerId: propProviderId }: WorkshopDashboardProps = {}) {
  const { data: hookProviderId, isLoading, error } = useWorkshopProviderId();
  const providerId = propProviderId || hookProviderId;
  const { data: workshopOrders = [] } = useWorkshopOrders(providerId);
  const [activeModule, setActiveModule] = useState<string | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [selectedVehicle, setSelectedVehicle] = useState<any>(null);
  const currentSelectedOrder = selectedOrder
    ? workshopOrders.find((order: any) => order.id === selectedOrder.id)
      ? {
          ...selectedOrder,
          ...workshopOrders.find((order: any) => order.id === selectedOrder.id),
          items: workshopOrders.find((order: any) => order.id === selectedOrder.id)?.items || selectedOrder.items || [],
          client: workshopOrders.find((order: any) => order.id === selectedOrder.id)?.client || selectedOrder.client,
          vehicle: workshopOrders.find((order: any) => order.id === selectedOrder.id)?.vehicle || selectedOrder.vehicle,
        }
      : selectedOrder
    : null;

  if (!providerId && isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!providerId) {
    return (
      <div className="max-w-5xl mx-auto py-12 px-4 space-y-10">
        {/* Hero */}
        <div className="text-center space-y-4">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-medium">
            🚀 14 dni za darmo — bez zobowiązań
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-foreground">
            Warsztat & Auto — wszystko w jednym miejscu
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Zarządzaj zleceniami, klientami, pojazdami, magazynem i fakturami. 
            Oszczędzaj czas i zwiększ zyski dzięki automatyzacji i AI.
          </p>
        </div>

        {/* Features */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            { icon: '🔧', title: 'Zlecenia i harmonogram', desc: 'Twórz zlecenia, przypisuj mechaników, śledź postęp napraw w czasie rzeczywistym.' },
            { icon: '📦', title: 'Magazyn i zakupy', desc: 'Kontroluj stany magazynowe, zamawiaj części, automatycznie aktualizuj ilości z faktur.' },
            { icon: '📄', title: 'Faktury i KSeF', desc: 'Wystawiaj faktury VAT, wysyłaj do KSeF, automatyczny odczyt faktur zakupowych AI.' },
            { icon: '👥', title: 'Klienci i pojazdy', desc: 'Baza klientów z historią napraw i powiązanymi pojazdami. Szybkie wyszukiwanie.' },
            { icon: '📊', title: 'Raporty i marża', desc: 'Analiza przychodów, kosztów i marży na żywo. Wykresy i eksport do PDF.' },
            { icon: '🤖', title: 'AI doradca', desc: 'Sztuczna inteligencja pomaga w wycenach, odczytuje faktury i sugeruje optymalizacje.' },
          ].map((f, i) => (
            <div key={i} className="p-5 rounded-xl border bg-card hover:shadow-md transition-shadow">
              <div className="text-2xl mb-3">{f.icon}</div>
              <h3 className="font-semibold text-foreground mb-1">{f.title}</h3>
              <p className="text-sm text-muted-foreground">{f.desc}</p>
            </div>
          ))}
        </div>

        {/* Pricing */}
        <div>
          <h2 className="text-2xl font-bold text-center text-foreground mb-6">Wybierz plan dla siebie</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { name: 'Start', price: '0 zł', period: '/mies.', badge: 'Darmowy', badgeColor: 'bg-muted text-muted-foreground', border: '', features: ['20 zleceń/mc', 'Klienci + pojazdy', 'Terminarz', 'Zdjęcia przy przyjęciu', '10 sprawdzeń VIN', '3 pytania AI/mc'] },
              { name: 'Warsztat', price: '99 zł', period: 'netto/mies.', badge: 'Najpopularniejszy', badgeColor: 'bg-primary text-primary-foreground', border: 'ring-2 ring-primary', features: ['Zlecenia bez limitu', 'Magazyn + przechowalnia', 'Sprzedaż + faktury', 'Raporty + marża live', 'KSeF basic', '20 pytań AI/mc'] },
              { name: 'Warsztat Pro', price: '175 zł', period: 'netto/mies.', badge: 'Pro', badgeColor: 'bg-orange-100 text-orange-700', border: '', features: ['Dane naprawcze (TecRMI)', 'Czas pracy mechanika', '50 pytań AI/mc', 'KSeF pełny + wysyłka', 'Zaawansowane raporty', 'Priorytetowy support'] },
              { name: 'GetRido AI', price: '249 zł', period: 'netto/mies.', badge: 'AI Business', badgeColor: 'bg-green-100 text-green-700', border: 'ring-2 ring-green-500', features: ['Księgowość AI', '30 faktur/mc auto-odczyt', 'Doradca podatkowy AI', 'Nieograniczone AI', 'KSeF monitor + alerty', 'Dedykowany opiekun'] },
            ].map((plan, i) => (
              <div key={i} className={`rounded-xl border bg-card p-5 flex flex-col ${plan.border}`}>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full w-fit mb-3 ${plan.badgeColor}`}>{plan.badge}</span>
                <h3 className="font-bold text-lg text-foreground">{plan.name}</h3>
                <div className="mt-1 mb-4">
                  <span className="text-2xl font-bold text-foreground">{plan.price}</span>
                  <span className="text-sm text-muted-foreground ml-1">{plan.period}</span>
                </div>
                <ul className="space-y-1.5 text-sm flex-1">
                  {plan.features.map((f, j) => (
                    <li key={j} className="flex items-start gap-1.5">
                      <span className="text-green-500 mt-0.5">✓</span>
                      <span className="text-muted-foreground">{f}</span>
                    </li>
                  ))}
                </ul>
                <Button className="mt-4 w-full" variant={i === 1 ? 'default' : 'outline'} onClick={() => window.location.href = '/auth'}>
                  {i === 0 ? 'Zacznij za darmo' : 'Wybierz plan'}
                </Button>
              </div>
            ))}
          </div>
        </div>

        {error && <p className="text-xs text-destructive text-center">Błąd: {(error as Error).message}</p>}
      </div>
    );
  }

  if (currentSelectedOrder) {
    return (
      <div className="flex gap-0 min-h-[calc(100vh-200px)]">
        <WorkshopSidebar activeModule="zlecenia" onNavigate={(key) => { setSelectedOrder(null); setActiveModule(key); }} />
        <div className="flex-1 pl-3 min-w-0">
          <WorkshopOrderDetail
            order={currentSelectedOrder}
            providerId={providerId}
            onBack={() => setSelectedOrder(null)}
          />
        </div>
      </div>
    );
  }

  if (selectedVehicle) {
    return (
      <div className="flex gap-0 min-h-[calc(100vh-200px)]">
        <WorkshopSidebar activeModule="pojazdy" onNavigate={(key) => { setSelectedVehicle(null); goTo(key); }} />
        <div className="flex-1 pl-3 min-w-0">
          <WorkshopVehicleDetail
            vehicle={selectedVehicle}
            providerId={providerId}
            onBack={() => setSelectedVehicle(null)}
            onOpenOrder={(order) => {
              setSelectedVehicle(null);
              setSelectedOrder(order);
            }}
          />
        </div>
      </div>
    );
  }

  const goTo = (key: string | null) => setActiveModule(key);

  const renderModuleContent = () => {
    switch (activeModule) {
      case 'zlecenia':
        return <WorkshopOrdersList providerId={providerId} onSelectOrder={setSelectedOrder} />;
      case 'klienci':
        return <WorkshopClientsList providerId={providerId} onBack={() => goTo(null)} />;
      case 'pojazdy':
        return <WorkshopVehiclesList providerId={providerId} onBack={() => goTo(null)} onSelectVehicle={setSelectedVehicle} />;
      case 'terminarz':
        return <WorkshopScheduler providerId={providerId} onBack={() => goTo(null)} />;
      case 'sprzedaz':
        return <WorkshopSales providerId={providerId} onBack={() => goTo(null)} />;
      case 'raporty':
        return <WorkshopReports providerId={providerId} onBack={() => goTo(null)} />;
      case 'magazyn':
        return <WorkshopWarehouse providerId={providerId} onBack={() => goTo(null)} />;
      case 'przechowalnia':
        return <WorkshopTireStorage providerId={providerId} onBack={() => goTo(null)} />;
      case 'dane-naprawcze':
        return <WorkshopRepairData providerId={providerId} onBack={() => goTo(null)} />;
      case 'ustawienia':
        return <WorkshopSettings providerId={providerId} onBack={() => goTo(null)} />;
      default:
        return null;
    }
  };

  // Main dashboard tiles
  if (!activeModule) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {modules.map(m => (
            <Card
              key={m.key}
              className={`cursor-pointer transition-all hover:shadow-lg hover:scale-[1.03] overflow-hidden group ${
                !m.ready ? 'opacity-60 grayscale' : ''
              }`}
              onClick={() => m.ready && setActiveModule(m.key)}
            >
              <div className="relative h-32 overflow-hidden">
                <img src={m.img} alt={m.label} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
                <div className="absolute bottom-0 left-0 right-0 p-3">
                  <span className="font-semibold text-white text-sm drop-shadow-lg">{m.label}</span>
                  {!m.ready && <span className="block text-xs text-white/70 mt-0.5">Wkrótce</span>}
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  // Module view with sidebar
  return (
    <div className="flex gap-0 min-h-[calc(100vh-200px)]">
      <WorkshopSidebar activeModule={activeModule} onNavigate={goTo} />
      <div className="flex-1 pl-3 min-w-0">
        {renderModuleContent()}
      </div>
    </div>
  );
}
