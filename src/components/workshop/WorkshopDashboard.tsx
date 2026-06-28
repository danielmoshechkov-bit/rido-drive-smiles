import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
import { WorkshopSettingsStandalone } from './WorkshopSettingsStandalone';
import { WorkshopEmployeesPage } from './WorkshopEmployeesPage';
import { WorkshopStationsManager } from './WorkshopStationsManager';
import { Loader2, ArrowLeft } from 'lucide-react';
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
import tilePracownicy from '@/assets/workshop/tile-pracownicy.jpg';
import tileStanowiska from '@/assets/workshop/tile-stanowiska.jpg';

const modules = [
  { key: 'zlecenia', labelKey: 'workshop.dashboard.tiles.zlecenia', img: tileZlecenia, ready: true },
  { key: 'terminarz', labelKey: 'workshop.dashboard.tiles.terminarz', img: tileTerminarz, ready: true },
  { key: 'sprzedaz', labelKey: 'workshop.dashboard.tiles.sprzedaz', img: tileSprzedaz, ready: true },
  { key: 'klienci', labelKey: 'workshop.dashboard.tiles.klienci', img: tileKlienci, ready: true },
  { key: 'pojazdy', labelKey: 'workshop.dashboard.tiles.pojazdy', img: tilePojazdy, ready: true },
  { key: 'raporty', labelKey: 'workshop.dashboard.tiles.raporty', img: tileRaporty, ready: true },
  { key: 'magazyn', labelKey: 'workshop.dashboard.tiles.magazyn', img: tileMagazyn, ready: true },
  { key: 'przechowalnia', labelKey: 'workshop.dashboard.tiles.przechowalnia', img: tilePrzechodnia, ready: true },
  { key: 'dane-naprawcze', labelKey: 'workshop.dashboard.tiles.daneNaprawcze', img: tileDaneNaprawcze, ready: true },
  { key: 'pracownicy', labelKey: 'workshop.dashboard.tiles.pracownicy', img: tilePracownicy, ready: true },
  { key: 'stanowiska', labelKey: 'workshop.dashboard.tiles.stanowiska', img: tileStanowiska, ready: true },
  { key: 'ustawienia', labelKey: 'workshop.dashboard.tiles.ustawienia', img: tileUstawienia, ready: true },
];

interface WorkshopDashboardProps {
  providerId?: string | null;
}

function WorkshopSidebar({ activeModule, onNavigate }: { activeModule: string; onNavigate: (key: string | null) => void }) {
  const { t } = useTranslation();
  return (
    <div className="hidden md:block w-[200px] flex-shrink-0 pr-3 border-r border-border">
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
            <img src={m.img} alt={t(m.labelKey)} className="w-full h-full object-cover" />
            {/* Readable label overlay (tile size unchanged): strong dark gradient
                anchored to the bottom of the tile + a heavy text-shadow, so the white
                caption stays legible over any photo. */}
            <div className="absolute inset-x-0 bottom-0 h-3/5 bg-gradient-to-t from-black/95 via-black/65 to-transparent pointer-events-none" />
            <span
              className="absolute bottom-1.5 left-1 right-1 text-xs font-semibold text-white leading-tight text-center"
              style={{ textShadow: '0 1px 4px rgba(0,0,0,1), 0 0 3px rgba(0,0,0,0.9)' }}
            >
              {t(m.labelKey)}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function MobileBackButton({ onBack, label }: { onBack: () => void; label?: string }) {
  const { t } = useTranslation();
  return (
    <button
      onClick={onBack}
      className="md:hidden flex items-center gap-1.5 text-sm text-primary font-medium mb-3 hover:underline"
    >
      <ArrowLeft className="h-4 w-4" /> {label ?? t('workshop.dashboard.home')}
    </button>
  );
}

export function WorkshopDashboard({ providerId: propProviderId }: WorkshopDashboardProps = {}) {
  const { t } = useTranslation();
  const { data: hookProviderId, isLoading, error } = useWorkshopProviderId();
  const providerId = propProviderId || hookProviderId;
  const { data: workshopOrders = [] } = useWorkshopOrders(providerId);
  const [activeModule, setActiveModule] = useState<string | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [selectedVehicle, setSelectedVehicle] = useState<any>(null);
  // Memoized: recompute only when the selection or the fetched orders change, so the
  // detail card receives a stable `order`/`items` identity instead of a brand-new
  // object on every render (which re-rendered the whole card on each keystroke).
  const currentSelectedOrder = useMemo(() => {
    if (!selectedOrder) return null;
    const live = workshopOrders.find((order: any) => order.id === selectedOrder.id);
    if (!live) return selectedOrder;
    return {
      ...selectedOrder,
      ...live,
      items: live.items || selectedOrder.items || [],
      client: live.client || selectedOrder.client,
      vehicle: live.vehicle || selectedOrder.vehicle,
    };
  }, [selectedOrder, workshopOrders]);

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
            🚀 {t('workshop.dashboard.freeTrialBadge')}
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-foreground">
            {t('workshop.dashboard.heroTitle')}
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            {t('workshop.dashboard.heroSubtitle')}
          </p>
        </div>

        {/* Features */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            { icon: '🔧', title: t('workshop.dashboard.features.orders.title'), desc: t('workshop.dashboard.features.orders.desc') },
            { icon: '📦', title: t('workshop.dashboard.features.warehouse.title'), desc: t('workshop.dashboard.features.warehouse.desc') },
            { icon: '📄', title: t('workshop.dashboard.features.invoices.title'), desc: t('workshop.dashboard.features.invoices.desc') },
            { icon: '👥', title: t('workshop.dashboard.features.clients.title'), desc: t('workshop.dashboard.features.clients.desc') },
            { icon: '📊', title: t('workshop.dashboard.features.reports.title'), desc: t('workshop.dashboard.features.reports.desc') },
            { icon: '🤖', title: t('workshop.dashboard.features.ai.title'), desc: t('workshop.dashboard.features.ai.desc') },
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
          <h2 className="text-2xl font-bold text-center text-foreground mb-6">{t('workshop.dashboard.pricing.title')}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { name: 'Start', price: '0 zł', period: '/mies.', badge: t('workshop.dashboard.pricing.plans.start.badge'), badgeColor: 'bg-muted text-muted-foreground', border: '', features: [t('workshop.dashboard.pricing.plans.start.f1'), t('workshop.dashboard.pricing.plans.start.f2'), t('workshop.dashboard.pricing.plans.start.f3'), t('workshop.dashboard.pricing.plans.start.f4'), t('workshop.dashboard.pricing.plans.start.f5'), t('workshop.dashboard.pricing.plans.start.f6')] },
              { name: 'Warsztat', price: '99 zł', period: 'netto/mies.', badge: t('workshop.dashboard.pricing.plans.warsztat.badge'), badgeColor: 'bg-primary text-primary-foreground', border: 'ring-2 ring-primary', features: [t('workshop.dashboard.pricing.plans.warsztat.f1'), t('workshop.dashboard.pricing.plans.warsztat.f2'), t('workshop.dashboard.pricing.plans.warsztat.f3'), t('workshop.dashboard.pricing.plans.warsztat.f4'), t('workshop.dashboard.pricing.plans.warsztat.f5'), t('workshop.dashboard.pricing.plans.warsztat.f6')] },
              { name: 'Warsztat Pro', price: '175 zł', period: 'netto/mies.', badge: t('workshop.dashboard.pricing.plans.pro.badge'), badgeColor: 'bg-orange-100 text-orange-700', border: '', features: [t('workshop.dashboard.pricing.plans.pro.f1'), t('workshop.dashboard.pricing.plans.pro.f2'), t('workshop.dashboard.pricing.plans.pro.f3'), t('workshop.dashboard.pricing.plans.pro.f4'), t('workshop.dashboard.pricing.plans.pro.f5'), t('workshop.dashboard.pricing.plans.pro.f6')] },
              { name: 'GetRido AI', price: '249 zł', period: 'netto/mies.', badge: t('workshop.dashboard.pricing.plans.ai.badge'), badgeColor: 'bg-green-100 text-green-700', border: 'ring-2 ring-green-500', features: [t('workshop.dashboard.pricing.plans.ai.f1'), t('workshop.dashboard.pricing.plans.ai.f2'), t('workshop.dashboard.pricing.plans.ai.f3'), t('workshop.dashboard.pricing.plans.ai.f4'), t('workshop.dashboard.pricing.plans.ai.f5'), t('workshop.dashboard.pricing.plans.ai.f6')] },
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
                  {i === 0 ? t('workshop.dashboard.pricing.startFree') : t('workshop.dashboard.pricing.choosePlan')}
                </Button>
              </div>
            ))}
          </div>
        </div>

        {error && <p className="text-xs text-destructive text-center">{t('workshop.dashboard.error', { message: (error as Error).message })}</p>}
      </div>
    );
  }

  if (currentSelectedOrder) {
    return (
      <div className="flex gap-0 min-h-[calc(100vh-200px)]">
        <WorkshopSidebar activeModule="zlecenia" onNavigate={(key) => { setSelectedOrder(null); setActiveModule(key); }} />
        <div className="flex-1 md:pl-3 min-w-0">
          <MobileBackButton onBack={() => setSelectedOrder(null)} label={t('workshop.dashboard.tiles.zlecenia')} />
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
        <div className="flex-1 md:pl-3 min-w-0">
          <MobileBackButton onBack={() => setSelectedVehicle(null)} label={t('workshop.dashboard.tiles.pojazdy')} />
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
  const isSchedulerModule = activeModule === 'terminarz';

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
      case 'pracownicy':
        return <WorkshopEmployeesPage providerId={providerId} />;
      case 'stanowiska':
        return (
          <div className="max-w-3xl mx-auto py-2">
            <h2 className="text-xl font-semibold mb-3">{t('workshop.dashboard.stations.title')}</h2>
            <p className="text-sm text-muted-foreground mb-4">
              {t('workshop.dashboard.stations.desc')}
            </p>
            <WorkshopStationsManager providerId={providerId} />
          </div>
        );
      case 'ustawienia':
        return <WorkshopSettingsStandalone providerId={providerId} onBack={() => goTo(null)} />;
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
                <img src={m.img} alt={t(m.labelKey)} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
                <div className="absolute bottom-0 left-0 right-0 p-3">
                  <span className="font-semibold text-white text-sm drop-shadow-lg">{t(m.labelKey)}</span>
                  {!m.ready && <span className="block text-xs text-white/70 mt-0.5">{t('workshop.dashboard.comingSoon')}</span>}
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
    <div className={isSchedulerModule ? 'flex h-full min-h-0 gap-0 overflow-hidden' : 'flex gap-0 min-h-[calc(100dvh-120px)]'}>
      <WorkshopSidebar activeModule={activeModule} onNavigate={goTo} />
      <div className={isSchedulerModule ? 'flex-1 md:pl-3 min-w-0 flex h-full min-h-0 flex-col overflow-hidden' : 'flex-1 md:pl-3 min-w-0 flex flex-col'}>
        <MobileBackButton onBack={() => goTo(null)} />
        {renderModuleContent()}
      </div>
    </div>
  );
}
