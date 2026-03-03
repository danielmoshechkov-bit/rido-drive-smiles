import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useWorkshopProviderId } from '@/hooks/useWorkshop';
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
import { Loader2, Wrench } from 'lucide-react';

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

export function WorkshopDashboard({ providerId: propProviderId }: WorkshopDashboardProps = {}) {
  const { data: hookProviderId, isLoading, error } = useWorkshopProviderId();
  const providerId = propProviderId || hookProviderId;
  const [activeModule, setActiveModule] = useState<string | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [selectedVehicle, setSelectedVehicle] = useState<any>(null);

  if (!providerId && isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!providerId) {
    return (
      <div className="text-center py-20 text-muted-foreground">
        <Wrench className="h-12 w-12 mx-auto mb-4 opacity-50" />
        <p className="text-lg font-medium">Brak konta usługodawcy</p>
        <p className="text-sm mt-2">Skontaktuj się z administratorem portalu.</p>
        {error && <p className="text-xs text-destructive mt-2">Błąd: {(error as Error).message}</p>}
      </div>
    );
  }

  if (selectedOrder) {
    return (
      <WorkshopOrderDetail
        order={selectedOrder}
        providerId={providerId}
        onBack={() => setSelectedOrder(null)}
      />
    );
  }

  if (selectedVehicle) {
    return (
      <WorkshopVehicleDetail
        vehicle={selectedVehicle}
        providerId={providerId}
        onBack={() => setSelectedVehicle(null)}
        onOpenOrder={(order) => {
          setSelectedVehicle(null);
          setSelectedOrder(order);
        }}
      />
    );
  }

  const goHome = () => setActiveModule(null);

  if (activeModule === 'zlecenia') {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <button onClick={goHome} className="text-primary hover:underline text-sm">🏠</button>
          <span className="text-muted-foreground">/</span>
          <h2 className="text-xl font-bold">Zlecenia</h2>
        </div>
        <WorkshopOrdersList providerId={providerId} onSelectOrder={setSelectedOrder} />
      </div>
    );
  }

  if (activeModule === 'klienci') return <WorkshopClientsList providerId={providerId} onBack={goHome} />;
  if (activeModule === 'pojazdy') return <WorkshopVehiclesList providerId={providerId} onBack={goHome} onSelectVehicle={setSelectedVehicle} />;
  if (activeModule === 'terminarz') return <WorkshopScheduler providerId={providerId} onBack={goHome} />;
  if (activeModule === 'sprzedaz') return <WorkshopSales providerId={providerId} onBack={goHome} />;
  if (activeModule === 'raporty') return <WorkshopReports providerId={providerId} onBack={goHome} />;
  if (activeModule === 'magazyn') return <WorkshopWarehouse providerId={providerId} onBack={goHome} />;
  if (activeModule === 'przechowalnia') return <WorkshopTireStorage providerId={providerId} onBack={goHome} />;
  if (activeModule === 'dane-naprawcze') return <WorkshopRepairData providerId={providerId} onBack={goHome} />;
  if (activeModule === 'ustawienia') return <WorkshopSettings providerId={providerId} onBack={goHome} />;

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
              <img
                src={m.img}
                alt={m.label}
                className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
              <div className="absolute bottom-0 left-0 right-0 p-3">
                <span className="font-semibold text-white text-sm drop-shadow-lg">{m.label}</span>
                {!m.ready && (
                  <span className="block text-xs text-white/70 mt-0.5">Wkrótce</span>
                )}
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
