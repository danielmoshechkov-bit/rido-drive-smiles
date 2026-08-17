import { lazy, Suspense, useMemo, useState } from 'react';
import { lazyNamedWithRetry } from '@/lib/lazyWithRetry';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ModuleLock } from '@/components/billing/ModuleLock';
import { useSubscriptionAccess } from '@/hooks/useSubscriptionAccess';
import { WorkshopPortalBookings } from '@/components/workshop/WorkshopPortalBookings';
import { Card } from '@/components/ui/card';
import { useIsBetaTester } from '@/hooks/useIsBetaTester';
import { useWorkshopOrders, useWorkshopOrder, useWorkshopProviderId } from '@/hooks/useWorkshop';
import { useDisableNumberInputScroll } from '@/hooks/useDisableNumberInputScroll';
import { Loader2, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePublicPricing } from '@/hooks/usePublicPricing';
import { planPriceLabels, trialDaysFor } from '@/lib/pricingCards';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { WorkshopSetupWizard } from '@/components/workshop/onboarding/WorkshopSetupWizard';
import { GuidedTour } from '@/components/onboarding/GuidedTour';
import { TRASA_PIERWSZE_ZLECENIE } from '@/components/onboarding/trasaPierwszeZlecenie';
import { useWprowadzenie } from '@/hooks/useWprowadzenie';
import { TrybProbnyProvider } from '@/components/onboarding/TrybProbny';

// PERF C1: wszystkie podmoduły warsztatu były importowane statycznie — 14
// komponentów (w tym 1890-liniowy Scheduler i Reports→recharts) lądowało w
// initial bundle, mimo że renderuje się tylko aktywny. React.lazy = osobny
// chunk per moduł, ładowany przy pierwszym wejściu w kafelek.
// Ladowanie na zadanie odporne na nieaktualne pliki po wdrozeniu/restarcie —
// bez tego wejscie w kafelek (np. Zlecenia) konczylo sie bialym ekranem.
const lazyNamed = lazyNamedWithRetry;

const WorkshopOrdersList = lazyNamed(() => import('./WorkshopOrdersList'), 'WorkshopOrdersList');
const WorkshopOrderDetail = lazyNamed(() => import('./WorkshopOrderDetail'), 'WorkshopOrderDetail');
const WorkshopClientsList = lazyNamed(() => import('./WorkshopClientsList'), 'WorkshopClientsList');
const WorkshopVehiclesList = lazyNamed(() => import('./WorkshopVehiclesList'), 'WorkshopVehiclesList');
const WorkshopVehicleDetail = lazyNamed(() => import('./WorkshopVehicleDetail'), 'WorkshopVehicleDetail');
const WorkshopScheduler = lazyNamed(() => import('./WorkshopScheduler'), 'WorkshopScheduler');
const WorkshopSales = lazyNamed(() => import('./WorkshopSales'), 'WorkshopSales');
const WorkshopReports = lazyNamed(() => import('./WorkshopReports'), 'WorkshopReports');
const WorkshopWarehouse = lazyNamed(() => import('./WorkshopWarehouse'), 'WorkshopWarehouse');
const WorkshopTireStorage = lazyNamed(() => import('./WorkshopTireStorage'), 'WorkshopTireStorage');
const WorkshopRepairData = lazyNamed(() => import('./WorkshopRepairData'), 'WorkshopRepairData');
const WorkshopSettingsStandalone = lazyNamed(() => import('./WorkshopSettingsStandalone'), 'WorkshopSettingsStandalone');
const MyServicesPanel = lazy(() => import('@/components/services/MyServicesPanel').then(m => ({ default: m.MyServicesPanel })));
const WorkshopEmployeesPage = lazyNamed(() => import('./WorkshopEmployeesPage'), 'WorkshopEmployeesPage');
const WorkshopStationsManager = lazyNamed(() => import('./WorkshopStationsManager'), 'WorkshopStationsManager');

const ModuleFallback = () => (
  <div className="flex items-center justify-center py-20">
    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
  </div>
);

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
  { key: 'sprzedaz', labelKey: 'workshop.dashboard.tiles.sprzedaz', label: 'Kasa', img: tileSprzedaz, ready: true },
  { key: 'klienci', labelKey: 'workshop.dashboard.tiles.klienci', img: tileKlienci, ready: true },
  { key: 'pojazdy', labelKey: 'workshop.dashboard.tiles.pojazdy', img: tilePojazdy, ready: true },
  { key: 'raporty', labelKey: 'workshop.dashboard.tiles.raporty', img: tileRaporty, ready: true },
  { key: 'magazyn', labelKey: 'workshop.dashboard.tiles.magazyn', img: tileMagazyn, ready: true },
  { key: 'przechowalnia', labelKey: 'workshop.dashboard.tiles.przechowalnia', img: tilePrzechodnia, ready: true },
  { key: 'dane-naprawcze', labelKey: 'workshop.dashboard.tiles.daneNaprawcze', img: tileDaneNaprawcze, ready: true },
  { key: 'pracownicy', labelKey: 'workshop.dashboard.tiles.pracownicy', img: tilePracownicy, ready: true },
  { key: 'stanowiska', labelKey: 'workshop.dashboard.tiles.stanowiska', img: tileStanowiska, ready: true },
  // Cennik usług — JEDYNE źródło cen dla agenta głosowego (provider_services).
  // Bez tego ekranu warsztat nie ma jak wpisać usług, a agent na pytanie o cenę
  // odpowiada „wycenimy po obejrzeniu auta" i nic więcej. Ceny NIE pochodzą
  // z historii zleceń ani od innych warsztatów — każdy wpisuje swoje.
  { key: 'cennik', labelKey: 'workshop.dashboard.tiles.cennik', img: tileTowary, ready: true },
  { key: 'ustawienia', labelKey: 'workshop.dashboard.tiles.ustawienia', img: tileUstawienia, ready: true },
];

interface WorkshopDashboardProps {
  providerId?: string | null;
}

// Funkcje jeszcze nie ogłoszone dla klientów — widoczne jako "wkrótce", aktywne tylko
// dla kont testowych (beta_testers). Gating przez useIsBetaTester.
const COMING_SOON_MODULE_KEYS = ['dane-naprawcze'];
const COMING_SOON_MSG = 'Już wkrótce — funkcja w przygotowaniu';

function WorkshopSidebar({ activeModule, onNavigate, lockedKeys = [] }: { activeModule: string; onNavigate: (key: string | null) => void; lockedKeys?: string[] }) {
  const { t } = useTranslation();
  return (
    <div className="hidden md:block w-[200px] flex-shrink-0 pr-3 border-r border-border">
      <div className="grid grid-cols-2 gap-1.5">
        {modules.filter(m => m.ready && !lockedKeys.includes(m.key)).map(m => (
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
              {(m as any).label ?? t(m.labelKey)}
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
  useDisableNumberInputScroll(); // scroll nad polem ceny/kwoty nie zmienia wartości (cały moduł)
  const { data: hookProviderId, isLoading, error } = useWorkshopProviderId();
  const providerId = propProviderId || hookProviderId;
  const { data: workshopOrders = [] } = useWorkshopOrders(providerId);
  // Cennik dla konta bez warsztatu — te same dane co /cennik i /warsztat-info.
  // Zapytanie jest współdzielone przez TanStack Query, więc nie kosztuje
  // dodatkowego round-tripu, jeśli któraś z tych stron była już otwarta.
  const { plans: pricingPlans, loading: pricingLoading, error: pricingError } = usePublicPricing();
  const offeredPlans = pricingPlans.filter((p) => p.product_line === 'warsztat');
  const trialDays = trialDaysFor(pricingPlans, 'warsztat');
  const [activeModule, setActiveModule] = useState<string | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [selectedVehicle, setSelectedVehicle] = useState<any>(null);
  // PERF C2/pkt 2: lista jest przycięta (bez ciężkich pól tekstowych), więc
  // karta dociąga PEŁNY wiersz w tle. Karta renderuje się od razu z danych
  // listy; na pełny wiersz czeka tylko zakładka "Dane podstawowe"
  // (fullOrderLoaded) — jej formularz kopiuje pola do stanu przy mount.
  const { data: singleOrderArr } = useWorkshopOrder(selectedOrder?.id);
  const fullOrder = singleOrderArr?.[0] ?? null;
  // Memoized: recompute only when the selection or the fetched orders change, so the
  // detail card receives a stable `order`/`items` identity instead of a brand-new
  // object on every render (which re-rendered the whole card on each keystroke).
  const currentSelectedOrder = useMemo(() => {
    if (!selectedOrder) return null;
    const live = fullOrder || workshopOrders.find((order: any) => order.id === selectedOrder.id);
    if (!live) return selectedOrder;
    return {
      ...selectedOrder,
      ...live,
      items: live.items || selectedOrder.items || [],
      client: live.client || selectedOrder.client,
      vehicle: live.vehicle || selectedOrder.vehicle,
    };
  }, [selectedOrder, fullOrder, workshopOrders]);

  // PIERWSZE URUCHOMIENIE. Nowe konto wchodzi tu po potwierdzeniu maila i widzi
  // kafelki, którymi nie ma czym pracować: faktura wyszłaby bez sprzedawcy,
  // a SMS do klienta bez nazwy warsztatu. Dlatego zanim cokolwiek pokażemy,
  // pytamy o dane firmy.
  //
  // O tym, czy okno ma się pokazać, decydują DANE, a nie osobna flaga
  // „onboarding zrobiony": flaga potrafi zostać ustawiona przy przerwanym
  // zapisie i wtedy warsztat pracuje z pustymi danymi, nie wiedząc o tym.
  const { data: daneFirmy, isLoading: ladujeDaneFirmy, refetch: odswiezDaneFirmy } = useQuery({
    queryKey: ['workshop-onboarding-status'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const { data } = await (supabase as any)
        .from('workshop_settings')
        .select('firm_name, nip, address, city, phone')
        .eq('user_id', user.id)
        .maybeSingle();
      return data ?? {};
    },
  });
  const [kreatorZamkniety, setKreatorZamkniety] = useState(false);
  // Wprowadzenie „pierwsze zlecenie" rusza zaraz po kreatorze danych firmy —
  // warsztat ma już czym pracować, więc pokazujemy, jak.
  const wprowadzenie = useWprowadzenie(TRASA_PIERWSZE_ZLECENIE.length);
  const brakujeDanychFirmy = !!daneFirmy && !(
    daneFirmy.firm_name && daneFirmy.nip && daneFirmy.address && daneFirmy.city && daneFirmy.phone
  );
  const pokazKreator = !ladujeDaneFirmy && brakujeDanychFirmy && !kreatorZamkniety && !!providerId;

  // Gating funkcji "wkrótce" — musi być przed jakimkolwiek warunkowym return (Rules of Hooks).
  const { isBetaTester } = useIsBetaTester();
  const lockedKeys = isBetaTester ? [] : COMING_SOON_MODULE_KEYS;

  // Bramka płatności. Świadomie NIE jest jedną nakładką na cały moduł: Terminarz
  // i Rezerwacje muszą zostać używalne, bo klient, który umówił się przed
  // blokadą, ma zostać obsłużony — potwierdzony, odwołany albo przełożony.
  // Czego warsztat nie zrobi, rozstrzyga baza (G4), nie ten ekran: nie założy
  // zlecenia z rezerwacji, nie doda klienta ani pojazdu, nie wystawi kosztorysu.
  const dostep = useSubscriptionAccess(providerId, 'warsztat');
  const zablokowany = !!providerId && !dostep.loading && !dostep.moznaPracowac;
  // Terminarz zostaje w pełni otwarty — to kalendarz cudzych wizyt, nie warsztatu.
  const MODULY_POZA_BRAMKA = ['terminarz'];
  const goTo = (key: string | null) => {
    if (key && lockedKeys.includes(key)) { toast.info(COMING_SOON_MSG); return; }
    setActiveModule(key);
  };

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
          {trialDays > 0 && (
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-medium">
              🚀 {t('workshop.dashboard.freeTrialBadge', { days: trialDays })}
            </div>
          )}
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
          {pricingLoading && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="rounded-xl border bg-muted/40 p-5 h-72 animate-pulse" />
              ))}
            </div>
          )}

          {/* Bez zapasowych kwot: zla cena pokazana zalogowanemu klientowi
              wraca potem jako spor o fakture. */}
          {!pricingLoading && (pricingError || offeredPlans.length === 0) && (
            <div className="rounded-xl border bg-card p-6 text-center">
              <p className="text-sm text-muted-foreground">
                {t('workshop.dashboard.pricing.unavailable')}
              </p>
            </div>
          )}

          {!pricingLoading && !pricingError && offeredPlans.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {offeredPlans.map((plan) => {
                const price = planPriceLabels(plan);
                const popular = plan.code === 'warsztat_standard';
                return (
                  <div
                    key={plan.code}
                    className={`rounded-xl border bg-card p-5 flex flex-col ${popular ? 'ring-2 ring-primary' : ''}`}
                  >
                    {popular && (
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full w-fit mb-3 bg-primary text-primary-foreground">
                        {t('workshop.dashboard.pricing.popular')}
                      </span>
                    )}
                    <h3 className="font-bold text-lg text-foreground">{plan.name}</h3>
                    <div className="mt-1 mb-4">
                      <span className="text-2xl font-bold text-foreground">{price.price}</span>
                      <span className="text-sm text-muted-foreground ml-1">{price.period}</span>
                      {price.target && (
                        <span className="text-sm text-muted-foreground line-through ml-2">{price.target}</span>
                      )}
                    </div>
                    <ul className="space-y-1.5 text-sm flex-1">
                      {plan.features.map((f, j) => (
                        <li key={j} className="flex items-start gap-1.5">
                          <span className="text-green-500 mt-0.5">✓</span>
                          <span className="text-muted-foreground">{f}</span>
                        </li>
                      ))}
                    </ul>
                    {/* CTA z tlumaczen, nie z planCtaLabel: panel dziala w 7 jezykach,
                        a helper zwraca polskie napisy pod strony ofertowe. */}
                    <Button
                      className="mt-4 w-full"
                      variant={popular ? 'default' : 'outline'}
                      onClick={() => (window.location.href = plan.is_custom ? '/kontakt' : '/auth')}
                    >
                      {plan.is_custom
                        ? t('workshop.dashboard.pricing.contact')
                        : Number(plan.price_net) === 0
                        ? t('workshop.dashboard.pricing.startFree')
                        : t('workshop.dashboard.pricing.choosePlan')}
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {error && <p className="text-xs text-destructive text-center">{t('workshop.dashboard.error', { message: (error as Error).message })}</p>}
      </div>
    );
  }

  // WPROWADZENIE MUSI TOWARZYSZYC WSZEDZIE.
  //
  // Karta zlecenia i karta pojazdu to osobne galezie tego komponentu (wczesny
  // return), a wprowadzenie bylo dorysowywane tylko w galezi z lista. Efekt byl
  // taki, ze prowadzilo za reke az do utworzenia zlecenia, a po wejsciu w nie
  // znikalo bez sladu — dokladnie w miejscu, gdzie zaczyna sie wycena.
  const zOpieka = (widok: JSX.Element) => (
    <TrybProbnyProvider aktywny={wprowadzenie.aktywne}>
      {widok}
      {wprowadzenie.aktywne && (
        <GuidedTour
          kroki={TRASA_PIERWSZE_ZLECENIE}
          krok={wprowadzenie.krok}
          onDalej={wprowadzenie.dalej}
          onKrok={wprowadzenie.ustawKrok}
          onZamknij={wprowadzenie.zamknij}
          // Kroki o dokumentach i zamknięciu dzieją się na LIŚCIE — wprowadzenie
          // zamyka otwartą kartę samo, zamiast kazać szukać strzałki powrotu.
          onWrocNaListe={() => setSelectedOrder(null)}
          // Telefon klienta próbnego = telefon warsztatu, żeby SMS-y z tego
          // przejścia przyszły do właściciela, a nie do obcej osoby.
          wartosci={{ 'telefon-warsztatu': (daneFirmy as any)?.phone || '' }}
        />
      )}
    </TrybProbnyProvider>
  );

  if (currentSelectedOrder) {
    return zOpieka(
      <div className="flex gap-0 min-h-[calc(100vh-200px)]">
        <WorkshopSidebar activeModule="zlecenia" lockedKeys={lockedKeys} onNavigate={(key) => { setSelectedOrder(null); goTo(key); }} />
        <div className="flex-1 md:pl-3 min-w-0">
          <MobileBackButton onBack={() => setSelectedOrder(null)} label={t('workshop.dashboard.tiles.zlecenia')} />
          {/* PERF pkt 2: karta renderuje się OD RAZU z danych listy (wiersz bez
              ciężkich pól tekstowych); pełny wiersz dociąga się w tle i tylko
              zakładka "Dane podstawowe" (kopiuje pola do stanu formularza)
              czeka na niego — patrz fullOrderLoaded w WorkshopOrderDetail. */}
          <Suspense fallback={<ModuleFallback />}>
            <ModuleLock zablokowane={zablokowany} powod={dostep.powod} linia="warsztat">
              <WorkshopOrderDetail
                order={currentSelectedOrder}
                providerId={providerId}
                fullOrderLoaded={!!fullOrder}
                onBack={() => setSelectedOrder(null)}
              />
            </ModuleLock>
          </Suspense>
        </div>
      </div>,
    );
  }

  if (selectedVehicle) {
    return zOpieka(
      <div className="flex gap-0 min-h-[calc(100vh-200px)]">
        <WorkshopSidebar activeModule="pojazdy" lockedKeys={lockedKeys} onNavigate={(key) => { setSelectedVehicle(null); goTo(key); }} />
        <div className="flex-1 md:pl-3 min-w-0">
          <MobileBackButton onBack={() => setSelectedVehicle(null)} label={t('workshop.dashboard.tiles.pojazdy')} />
          <Suspense fallback={<ModuleFallback />}>
            <ModuleLock zablokowane={zablokowany} powod={dostep.powod} linia="warsztat">
              <WorkshopVehicleDetail
                vehicle={selectedVehicle}
                providerId={providerId}
                onBack={() => setSelectedVehicle(null)}
                onOpenOrder={(order) => {
                  setSelectedVehicle(null);
                  setSelectedOrder(order);
                }}
              />
            </ModuleLock>
          </Suspense>
        </div>
      </div>,
    );
  }

  const isSchedulerModule = activeModule === 'terminarz';

  const renderModuleContent = () => {
    switch (activeModule) {
      case 'zlecenia':
        // Przy blokadzie rozdzielamy ekran: lista zleceń idzie pod nakładkę,
        // rezerwacje zostają nad nią i w pełni używalne.
        return (
          <WorkshopOrdersList
            providerId={providerId}
            onSelectOrder={setSelectedOrder}
            ukryjRezerwacje={zablokowany}
          />
        );
      case 'klienci':
        return (
          <WorkshopClientsList
            providerId={providerId}
            onBack={() => goTo(null)}
            onOpenVehicle={(vehicle) => setSelectedVehicle(vehicle)}
          />
        );
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
      case 'cennik':
        return (
          <div className="max-w-5xl mx-auto py-2">
            <h2 className="text-xl font-semibold mb-1">{t('workshop.dashboard.tiles.cennik')}</h2>
            <p className="text-sm text-muted-foreground mb-4">
              {t('workshop.dashboard.cennik.desc')}
            </p>
            <MyServicesPanel providerId={providerId} />
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
      // Wariant „baner", nie nakładka: kafelki to NAWIGACJA, nie praca. Pod nimi
      // nie ma czego zapisać, a przyciemnienie odcięłoby jedyną drogę do
      // Terminarza i Rezerwacji, które mają zostać dostępne. Jednocześnie to
      // pierwszy ekran modułu, więc karta sprzedażowa trafia tam, gdzie widać ją
      // najczęściej.
      <ModuleLock
        zablokowane={zablokowany}
        powod={dostep.powod}
        linia="warsztat"
        wariant="baner"
      >
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {modules.map(m => {
            const locked = lockedKeys.includes(m.key);
            const usable = m.ready && !locked;
            return (
            <Card
              key={m.key}
              className={`cursor-pointer transition-all hover:shadow-lg hover:scale-[1.03] overflow-hidden group ${
                !usable ? 'opacity-60 grayscale' : ''
              }`}
              onClick={() => {
                if (locked) { toast.info(COMING_SOON_MSG); return; }
                if (m.ready) setActiveModule(m.key);
              }}
            >
              <div className="relative h-32 overflow-hidden">
                <img src={m.img} alt={t(m.labelKey)} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
                <div className="absolute bottom-0 left-0 right-0 p-3">
                  <span className="font-semibold text-white text-sm drop-shadow-lg">{(m as any).label ?? t(m.labelKey)}</span>
                  {!usable && <span className="block text-xs text-white/70 mt-0.5">{locked ? 'Wkrótce' : t('workshop.dashboard.comingSoon')}</span>}
                </div>
              </div>
            </Card>
            );
          })}
        </div>
      </div>
      </ModuleLock>
    );
  }

  // Module view with sidebar
  return zOpieka(
    <div className={isSchedulerModule ? 'flex h-full min-h-0 gap-0 overflow-hidden' : 'flex gap-0 min-h-[calc(100dvh-120px)]'}>
      {/* Pierwsze uruchomienie: dane firmy, godziny, stanowiska, KSeF. */}
      <WorkshopSetupWizard
        open={pokazKreator}
        onZamknij={() => {
          setKreatorZamkniety(true);
          void odswiezDaneFirmy();
          // Prosto z ustawień do pierwszego zlecenia — bez wracania do pustego ekranu.
          //
          // Bez warunku „czy wprowadzenie nie było zamykane": kreator pokazuje się
          // WYŁĄCZNIE warsztatowi bez danych firmy, czyli przy pierwszym uruchomieniu.
          // Ktoś, kto zamknął wprowadzenie na innym warsztacie albo przed
          // wyczyszczeniem danych, i tak zaczyna od zera i ma prawo je zobaczyć.
          setActiveModule('zlecenia');
          wprowadzenie.zacznij();
        }}
      />
      <WorkshopSidebar activeModule={activeModule} lockedKeys={lockedKeys} onNavigate={goTo} />
      <div className={isSchedulerModule ? 'flex-1 md:pl-3 min-w-0 flex h-full min-h-0 flex-col overflow-hidden' : 'flex-1 md:pl-3 min-w-0 flex flex-col'}>
        <MobileBackButton onBack={() => goTo(null)} />
        <Suspense fallback={<ModuleFallback />}>
          {zablokowany && activeModule === 'zlecenia' && (
            <div className="mb-4">
              <WorkshopPortalBookings
                providerId={providerId}
                onSelectOrder={setSelectedOrder}
                mozeZakladacZlecenia={false}
              />
            </div>
          )}
          <ModuleLock
            zablokowane={zablokowany && !MODULY_POZA_BRAMKA.includes(activeModule)}
            powod={dostep.powod}
            linia="warsztat"
          >
            {renderModuleContent()}
          </ModuleLock>
        </Suspense>
      </div>
    </div>,
  );
}
