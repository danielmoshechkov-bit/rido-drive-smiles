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
import {
  ClipboardList, CheckSquare, Calendar, ShoppingCart,
  Receipt, Package, Users, Car, BarChart3, Warehouse,
  Archive, Wrench, Loader2, Settings
} from 'lucide-react';

const modules = [
  { key: 'zlecenia', label: 'Zlecenia', icon: ClipboardList, ready: true },
  { key: 'zadania', label: 'Zadania', icon: CheckSquare, ready: false },
  { key: 'terminarz', label: 'Terminarz', icon: Calendar, ready: true },
  { key: 'zakupy', label: 'Zakupy', icon: ShoppingCart, ready: false },
  { key: 'sprzedaz', label: 'Sprzedaż', icon: Receipt, ready: true },
  { key: 'towary', label: 'Towary', icon: Package, ready: false },
  { key: 'klienci', label: 'Klienci', icon: Users, ready: true },
  { key: 'pojazdy', label: 'Pojazdy', icon: Car, ready: true },
  { key: 'raporty', label: 'Raporty', icon: BarChart3, ready: true },
  { key: 'magazyn', label: 'Magazyn', icon: Warehouse, ready: true },
  { key: 'przechowalnia', label: 'Przechowalnia', icon: Archive, ready: true },
  { key: 'dane-naprawcze', label: 'Dane naprawcze', icon: Wrench, ready: true },
  { key: 'ustawienia', label: 'Ustawienia', icon: Settings, ready: true },
];

export function WorkshopDashboard() {
  const { data: providerId, isLoading, error } = useWorkshopProviderId();
  const [activeModule, setActiveModule] = useState<string | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [selectedVehicle, setSelectedVehicle] = useState<any>(null);

  if (isLoading) {
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
        <p className="text-lg font-medium">Ładowanie modułu zarządzania...</p>
        <p className="text-sm mt-2">Jeśli to trwa dłużej, odśwież stronę.</p>
        {error && <p className="text-xs text-destructive mt-2">Błąd: {(error as Error).message}</p>}
        <Button className="mt-4" variant="outline" onClick={() => window.location.reload()}>
          Odśwież stronę
        </Button>
      </div>
    );
  }

  // Order detail view
  if (selectedOrder) {
    return (
      <WorkshopOrderDetail
        order={selectedOrder}
        providerId={providerId}
        onBack={() => setSelectedOrder(null)}
      />
    );
  }

  // Vehicle detail view
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

  // Module views
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
  if (activeModule === 'pojazdy') {
    return <WorkshopVehiclesList providerId={providerId} onBack={goHome} onSelectVehicle={setSelectedVehicle} />;
  }
  if (activeModule === 'terminarz') return <WorkshopScheduler providerId={providerId} onBack={goHome} />;
  if (activeModule === 'sprzedaz') return <WorkshopSales providerId={providerId} onBack={goHome} />;
  if (activeModule === 'raporty') return <WorkshopReports providerId={providerId} onBack={goHome} />;
  if (activeModule === 'magazyn') return <WorkshopWarehouse providerId={providerId} onBack={goHome} />;
  if (activeModule === 'przechowalnia') return <WorkshopTireStorage providerId={providerId} onBack={goHome} />;
  if (activeModule === 'dane-naprawcze') return <WorkshopRepairData providerId={providerId} onBack={goHome} />;
  if (activeModule === 'ustawienia') return <WorkshopSettings providerId={providerId} onBack={goHome} />;

  // Dashboard grid
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {modules.map(m => (
          <Card
            key={m.key}
            className={`cursor-pointer transition-all hover:shadow-md hover:scale-[1.02] ${
              !m.ready ? 'opacity-50' : ''
            }`}
            onClick={() => m.ready && setActiveModule(m.key)}
          >
            <CardContent className="flex flex-col items-center justify-center py-8 gap-3">
              <m.icon className="h-10 w-10 text-primary" strokeWidth={1.5} />
              <span className="font-medium text-sm">{m.label}</span>
              {!m.ready && (
                <span className="text-xs text-muted-foreground">Wkrótce</span>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
