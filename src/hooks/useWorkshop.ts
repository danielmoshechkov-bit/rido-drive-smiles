import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { pretranslateContent, type ContentItem } from '@/lib/contentTranslation';
import { computeOrderTotals } from '@/utils/workshopOrderTotals';
import { consumeStock, returnStock, adjustStock } from '@/utils/workshopStock';

// B: keep workshop_orders.total_gross/total_net authoritative at write time, so
// every consumer (orders list, estimate preview, SMS) sees the correct amount even
// when the order card was never opened to run its client-side totals effect.
// Best-effort: on a read/write hiccup we silently bail and the card-side effect
// stays as a backstop — we never block the item mutation on this.
async function recomputeOrderTotals(orderId?: string | null) {
  if (!orderId) return;
  const { data: items, error } = await (supabase as any)
    .from('workshop_order_items')
    .select('total_gross, total_net, quantity, unit_price_gross, unit_price_net, discount_percent')
    .eq('order_id', orderId);
  if (error) return;
  const { total_gross, total_net } = computeOrderTotals(items || []);
  await (supabase as any)
    .from('workshop_orders')
    .update({ total_gross, total_net })
    .eq('id', orderId);
}

// Translate-on-write: pola tekstowe zlecenia, które warto pre-tłumaczyć na języki
// bazowe od razu przy zapisie (admin/klient widzą je potem natychmiast z cache).
const ORDER_TEXT_FIELDS = ['description', 'damage_description', 'mechanic_notes', 'post_completion_notes', 'internal_notes'] as const;

function pretranslateOrderFields(orderId: string, src: Record<string, any>) {
  if (!orderId) return;
  const items: ContentItem[] = [];
  for (const f of ORDER_TEXT_FIELDS) {
    const text = src?.[f];
    if (typeof text === 'string' && text.trim().length > 1) {
      items.push({ entity_type: 'order', entity_id: String(orderId), field: f, text, source_lang: 'auto' });
    }
  }
  if (items.length) void pretranslateContent(items);
}

function pretranslateItem(item: any) {
  if (!item?.id) return;
  const items: ContentItem[] = [];
  if (typeof item.name === 'string' && item.name.trim().length > 1) {
    items.push({ entity_type: 'item', entity_id: String(item.id), field: 'name', text: item.name, source_lang: 'auto' });
  }
  if (typeof item.description === 'string' && item.description.trim().length > 1) {
    items.push({ entity_type: 'item', entity_id: String(item.id), field: 'description', text: item.description, source_lang: 'auto' });
  }
  if (items.length) void pretranslateContent(items);
}

export const sortWorkshopOrderItems = (items: any[] | null | undefined) => {
  if (!Array.isArray(items)) return [];

  return [...items].sort((a, b) => {
    const aSortOrder = typeof a?.sort_order === 'number' ? a.sort_order : Number.MAX_SAFE_INTEGER;
    const bSortOrder = typeof b?.sort_order === 'number' ? b.sort_order : Number.MAX_SAFE_INTEGER;

    if (aSortOrder !== bSortOrder) return aSortOrder - bSortOrder;

    const aCreatedAt = a?.created_at ? new Date(a.created_at).getTime() : 0;
    const bCreatedAt = b?.created_at ? new Date(b.created_at).getTime() : 0;
    return aCreatedAt - bCreatedAt;
  });
};

// ---- Provider ID helper ----
export function useWorkshopProviderId() {
  return useQuery({
    queryKey: ['workshop-provider-id'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      // status 401 -> globalny retry tego nie ponawia (brak sesji jest
      // deterministyczny; ponawianie tylko opóźniało ekran logowania)
      if (!user) throw Object.assign(new Error('Not authenticated'), { status: 401 });
      const { data, error } = await supabase
        .from('service_providers')
        .select('id')
        .eq('user_id', user.id)
        // Konto może mieć więcej niż jeden warsztat (plan Sieci). `maybeSingle`
        // zwraca wtedy BŁĄD, nie pierwszy wiersz — ekran się wywala. Bierzemy
        // najstarszy i tak samo we wszystkich miejscach, żeby różne ekrany
        // nie pokazywały różnych firm.
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return data.id as string;
    },
    // PERF P3: było jawne retry:3/retryDelay:1000 — to pierwsze ogniwo łańcucha
    // (auth -> providerId -> lista zleceń), więc najbardziej wydłużało spinner
    // przy burście 500. Teraz dziedziczy globalny limit (2 próby, 0,5/1 s,
    // bez ponawiania 4xx) z App.tsx.
  });
}

// ---- Orders ----
// PERF C2: lista NIE ściąga ciężkich pól tekstowych (internal_notes,
// mechanic_notes, post_completion_notes, damage_description, mechanic_parts) —
// te dociąga useWorkshopOrder przy otwarciu karty zlecenia. Jeśli dodajesz
// kolumnę używaną na liście/terminarzu, dopisz ją tutaj.
const ORDER_LIST_COLUMNS = [
  'id', 'provider_id', 'order_number', 'status_id', 'status_name', 'station_id',
  'client_id', 'vehicle_id', 'created_at', 'updated_at', 'completed_at',
  'acceptance_date', 'scheduled_date', 'scheduled_start', 'scheduled_end',
  'scheduled_station', 'scheduled_station_id', 'workstation_id',
  'start_date', 'pickup_date', 'description', 'mileage', 'fuel_level', 'worker',
  'total_net', 'total_gross', 'price_mode', 'has_unread_notes',
  'client_acceptance_confirmed', 'client_code', 'booking_id',
  'quote_accepted', 'quote_done_at', 'quote_done_by_user_id',
  'estimate_sent_to_client', 'estimate_changed_after_send',
  'repaired_at', 'repair_started_at', 'repaired_by_user_id', 'mechanic_id',
  'assigned_employee_id',
  'sms_confirmed', 'sms_sent_count', 'last_sms_sent_at', 'ready_notification_sent',
  'sms_reminder_24h', 'sms_reminder_2h',
  'reception_protocol', 'return_parts_to_client', 'registration_document',
  'test_drive_consent', 'top_up_fluids', 'top_up_lights',
].join(', ');

// PERF P3: joiny LISTY bez pól-tapet (description klienta/pojazdu = wolny tekst,
// created/updated_at, provider_id) — wymienione kolumny są realnie czytane
// z wiersza listy (karta zlecenia zanim dociągnie pełny wiersz, prefill faktury,
// SMS-y, hover-cardy, terminarz, raporty). items celowo zostaje (*): tabela
// pozycji używa niemal wszystkich kolumn, a wagę payloadu robi LICZBA wierszy,
// nie ich szerokość. Jeśli nowy widok listy czyta nową kolumnę joina — dopisz ją.
const ORDER_LIST_JOINS = [
  'client:workshop_clients(id, client_type, first_name, last_name, company_name, phone, email, nip, street, city, postal_code, country, payment_method, payment_term, goods_discount_percent, product_discount_percent, service_discount_percent)',
  'vehicle:workshop_vehicles(id, brand, model, plate, vin, year, fuel_type, color, engine_capacity_cm3, engine_power_kw, engine_number, first_registration_date, mileage_unit, owner_client_id)',
  'items:workshop_order_items(*)',
].join(', ');

// Pełne joiny — używa ich TYLKO useWorkshopOrder (pojedynczy wiersz karty;
// payload jednego zlecenia jest pomijalny, a BasicTab/kosztorysy potrzebują
// kompletu pól klienta i pojazdu).
const ORDER_JOINS = 'client:workshop_clients(*), vehicle:workshop_vehicles(*), items:workshop_order_items(*)';

export type WorkshopOrdersView = 'active' | 'completed' | 'all';

/** „WY 996EU", „wy996eu", „WY-996EU" to ten sam numer — porównujemy bez ozdobników. */
const squash = (text: unknown) => String(text ?? '').toLowerCase().replace(/[\s-]/g, '');

/**
 * Zamienia frazę na identyfikatory pojazdów i klientów, po których można filtrować zlecenia.
 *
 * Dopasowujemy po stronie przeglądarki, a nie zapytaniem `ilike`, bo numery rejestracyjne
 * i telefony bywają zapisane ze spacjami albo myślnikami — „WY 996EU" nie znalazłoby się
 * po wpisaniu „wy996eu", a to najczęstszy sposób szukania w warsztacie.
 */
async function resolveSearchTargets(
  providerId: string | undefined,
  phrase: string,
): Promise<{ vehicleIds: string[]; clientIds: string[] }> {
  const needle = squash(phrase);
  if (!providerId || !needle) return { vehicleIds: [], clientIds: [] };

  const [vehicles, clients] = await Promise.all([
    (supabase as any)
      .from('workshop_vehicles')
      .select('id, plate, vin, brand, model')
      .eq('provider_id', providerId)
      .limit(5000),
    (supabase as any)
      .from('workshop_clients')
      .select('id, first_name, last_name, company_name, phone, email, nip')
      .eq('provider_id', providerId)
      .limit(5000),
  ]);

  const vehicleIds = ((vehicles.data as any[]) ?? [])
    .filter((v) =>
      [v.plate, v.vin, `${v.brand ?? ''} ${v.model ?? ''}`].some((field) => squash(field).includes(needle)),
    )
    .map((v) => v.id);

  const clientIds = ((clients.data as any[]) ?? [])
    .filter((c) =>
      [
        c.first_name,
        c.last_name,
        `${c.first_name ?? ''} ${c.last_name ?? ''}`,
        c.company_name,
        c.phone,
        c.email,
        c.nip,
      ].some((field) => squash(field).includes(needle)),
    )
    .map((c) => c.id);

  return { vehicleIds, clientIds };
}

export function useWorkshopOrders(providerId: string | undefined, filters?: {
  status?: string;
  search?: string;
  completedOnly?: boolean;
  /** 'active' (domyślnie) = bez zakończonych; 'completed' = tylko zakończone; 'all' = terminarz/raporty */
  view?: WorkshopOrdersView;
  /** zakres dat dla widoku 'completed' (yyyy-mm-dd), filtrowany serwerowo */
  dateFrom?: string;
  dateTo?: string;
  /** limit wierszy dla widoku 'completed' (paginacja "Załaduj więcej") */
  limit?: number;
}) {
  // PERF C2: znormalizowany klucz — useWorkshopOrders(id) i
  // useWorkshopOrders(id, { view: 'active' }) współdzielą cache.
  const view: WorkshopOrdersView = filters?.view ?? 'active';
  const keyFilters = {
    view,
    status: filters?.status ?? null,
    search: filters?.search ?? null,
    completedOnly: filters?.completedOnly ?? false,
    dateFrom: view === 'completed' ? (filters?.dateFrom ?? null) : null,
    dateTo: view === 'completed' ? (filters?.dateTo ?? null) : null,
    limit: view === 'completed' ? (filters?.limit ?? 100) : null,
  };
  return useQuery({
    queryKey: ['workshop-orders', providerId, keyFilters],
    enabled: !!providerId,
    // FIX P1: NIE refetchOnWindowFocus na liście — to ciężkie zapytanie (500
    // zleceń + joiny), refetch na każdy focus mulił. Świeżość zapewnia realtime
    // (lista subskrybuje gdy zamontowana) + realtime karty detalu (patrz
    // WorkshopOrderDetail) mergujący do wspólnego cache ['workshop-orders'].
    queryFn: async () => {
      let query = (supabase as any)
        .from('workshop_orders')
        .select(`${ORDER_LIST_COLUMNS}, ${ORDER_LIST_JOINS}`)
        .eq('provider_id', providerId)
        .order('created_at', { ascending: false });

      // PERF C2: filtr widoku serwerowo — archiwum zakończonych nie schodzi
      // przy każdym wejściu na listę aktywnych.
      if (view === 'active') {
        query = query.neq('status_name', 'Zakończone').limit(500);
      } else if (view === 'completed') {
        query = query.eq('status_name', 'Zakończone');
        if (keyFilters.dateFrom || keyFilters.dateTo) {
          // Podstawą daty jest completed_at, z fallbackiem na created_at dla
          // starych rekordów bez znacznika zakończenia.
          const from = keyFilters.dateFrom || '1970-01-01';
          const to = (keyFilters.dateTo || '2999-12-31') + 'T23:59:59';
          query = query.or(
            `and(completed_at.gte.${from},completed_at.lte.${to}),and(completed_at.is.null,created_at.gte.${from},created_at.lte.${to})`
          );
        }
        query = query.limit(keyFilters.limit as number);
      } else {
        // 'all' — terminarz/raporty; bezpiecznik zamiast całego archiwum bez granic
        query = query.limit(1000);
      }

      if (filters?.status) {
        query = query.eq('status_name', filters.status);
      }
      if (filters?.completedOnly) {
        query = query.eq('status_name', 'Zakończone');
      }
      // Szukanie po tym, co użytkownik ma przed oczami na liście: numer zlecenia, opis,
      // NUMER REJESTRACYJNY, VIN oraz dane klienta. Rejestracja i klient leżą w tabelach
      // powiązanych, więc najpierw rozwiązujemy je na identyfikatory — filtr PostgREST na
      // zagnieżdżonym zasobie przycina bowiem tylko sam join, a nie listę zleceń.
      if (filters?.search) {
        const phrase = filters.search.trim();
        const { vehicleIds, clientIds } = await resolveSearchTargets(providerId, phrase);
        const conditions = [
          `order_number.ilike.%${phrase}%`,
          `description.ilike.%${phrase}%`,
          vehicleIds.length ? `vehicle_id.in.(${vehicleIds.join(',')})` : null,
          clientIds.length ? `client_id.in.(${clientIds.join(',')})` : null,
        ].filter(Boolean);
        query = query.or(conditions.join(','));
      }
      const { data, error } = await query;
      if (error) throw error;
      return (data || []).map((order: any) => ({
        ...order,
        items: sortWorkshopOrderItems(order.items),
      }));
    },
  });
}

// PERF C2: pełny wiersz zlecenia (wszystkie kolumny) dociągany przy otwarciu
// karty. Zwraca TABLICĘ jednoelementową pod kluczem 'workshop-orders', dzięki
// czemu istniejące realtime-merge i punktowe patche cache (setQueriesData po
// prefiksie ['workshop-orders']) aktualizują też ten wpis bez dodatkowego kodu.
export function useWorkshopOrder(orderId: string | undefined) {
  return useQuery({
    queryKey: ['workshop-orders', 'single', orderId],
    enabled: !!orderId,
    // PERF pkt 2: domyślne retry TanStack (3× z backoffem 1s/2s/4s) potrafiło
    // trzymać kartę na spinnerze ~10 s przy jednym padniętym requeście.
    retry: 1,
    retryDelay: 500,
    // FIX P1: LEKKI refetch (jedno zlecenie) po powrocie na kartę — dogania
    // zmianę, którą realtime backgroundowanej karty mógł zgubić (scenariusz
    // dev: klient i panel w dwóch kartach jednej przeglądarki). W realnym
    // przypadku (panel na wierzchu) status wchodzi realtimem, ten refetch
    // to tylko bezpiecznik — tani, bo to pojedynczy wiersz.
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('workshop_orders')
        .select(`*, ${ORDER_JOINS}`)
        .eq('id', orderId)
        .maybeSingle();
      if (error) throw error;
      return data ? [{ ...data, items: sortWorkshopOrderItems(data.items) }] : [];
    },
  });
}

export function useCreateWorkshopOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (order: any) => {
      const { data, error } = await (supabase as any)
        .from('workshop_orders')
        .insert(order)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ['workshop-orders'] });
      if (data?.id) pretranslateOrderFields(data.id, data);
      toast.success('Zlecenie utworzone');
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useUpdateWorkshopOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: any) => {
      const { error } = await (supabase as any)
        .from('workshop_orders')
        .update(updates)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_data, variables: any) => {
      // PERF A2: zamiast pełnej invalidacji (refetch całej listy z joinami)
      // wmerguj zapisane pola punktowo do wiersza w cache. Pola pochodne
      // z serwera (np. station_id po handoverze) dosyła realtime-merge listy,
      // a po upływie staleTime (B2) remount i tak refetchuje.
      const { id, ...updates } = variables || {};
      if (id) {
        qc.setQueriesData({ queryKey: ['workshop-orders'] }, (old: any) =>
          Array.isArray(old)
            ? old.map((o: any) => (o.id === id ? { ...o, ...updates } : o))
            : old
        );
      }
      /**
       * PODMIANA KLIENTA ALBO AUTA WYMAGA POBRANIA DANYCH Z SERWERA.
       *
       * 🔴 NAPRAWIONE 21.08.2026. Zgłoszone z testów: po podmianie klienta
       * wyskakiwało „Klient w zleceniu podmieniony", a w karcie zlecenia stał
       * dalej poprzedni — dopiero wyjście i wejście z powrotem pokazywało
       * zmianę.
       *
       * Powód: punktowe wmergowanie wyżej wpisuje do pamięci podręcznej to,
       * co wysłaliśmy — czyli SAM IDENTYFIKATOR `client_id`. Karta rysuje
       * `order.client.first_name` i `order.vehicle.plate`, a te obiekty
       * przychodzą ze złączenia po stronie serwera i zostawały nietknięte.
       * Zapis był poprawny, kłamał tylko ekran.
       *
       * Przy zwykłych polach (status, notatka, kwota) merge zostaje — po to
       * powstał, żeby nie przeładowywać całej listy ze złączeniami. Ale gdy
       * zmienia się KTO albo CO jest w zleceniu, dołączonych danych nie da się
       * zgadnąć lokalnie i trzeba je pobrać.
       */
      const podmienionoWpis = variables?.client_id !== undefined || variables?.vehicle_id !== undefined;
      if (podmienionoWpis) {
        qc.invalidateQueries({ queryKey: ['workshop-orders'] });
      }

      // translate-on-write: jeśli aktualizacja zawierała pola tekstowe, pre-tłumacz
      if (variables?.id) pretranslateOrderFields(variables.id, variables);
    },
    onError: (e: any) => toast.error(e.message),
  });
}

// ---- Order Statuses ----
export function useWorkshopStatuses(providerId: string | undefined) {
  return useQuery({
    queryKey: ['workshop-statuses', providerId],
    enabled: !!providerId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('workshop_order_statuses')
        .select('*')
        .eq('provider_id', providerId)
        .order('sort_order');
      if (error) throw error;
      // If no statuses, initialize defaults
      if (!data || data.length === 0) {
        await supabase.rpc('init_workshop_default_statuses', { p_provider_id: providerId });
        const { data: d2 } = await (supabase as any)
          .from('workshop_order_statuses')
          .select('*')
          .eq('provider_id', providerId)
          .order('sort_order');
        return d2 || [];
      }
      return data;
    },
  });
}

// ---- Stations (współdzielone przez wiersze listy — PERF B3) ----
// Jeden fetch per provider zamiast osobnego zapytania w każdym WorkshopStatusPicker.
export function useWorkshopStations(providerId: string | undefined) {
  return useQuery({
    queryKey: ['workshop-stations', providerId],
    enabled: !!providerId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await (supabase.from('workshop_stations') as any)
        .select('id, name, color, is_active')
        .eq('provider_id', providerId)
        .eq('is_active', true)
        .order('sort_order');
      if (error) throw error;
      return data || [];
    },
  });
}

// ---- Status Settings (auto/manual mode) ----
export function useWorkshopStatusSettings(providerId: string | undefined) {
  return useQuery({
    queryKey: ['workshop-status-settings', providerId],
    enabled: !!providerId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('workshop_status_settings')
        .select('*')
        .eq('provider_id', providerId)
        .maybeSingle();
      if (error) throw error;
      return data || { status_mode: 'auto' };
    },
  });
}

export function useUpdateWorkshopStatusSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ providerId, ...fields }: { providerId: string; status_mode?: string; color_mode?: string }) => {
      const { error } = await (supabase as any)
        .from('workshop_status_settings')
        .upsert({ provider_id: providerId, ...fields }, { onConflict: 'provider_id' });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workshop-status-settings'] });
      toast.success('Tryb statusów zapisany');
    },
    onError: (e: any) => toast.error(e.message),
  });
}

// ---- Clients ----
export function useWorkshopClients(providerId: string | undefined) {
  return useQuery({
    queryKey: ['workshop-clients', providerId],
    enabled: !!providerId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('workshop_clients')
        .select('*')
        .eq('provider_id', providerId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });
}

export function useCreateWorkshopClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (client: any) => {
      const { data, error } = await (supabase as any)
        .from('workshop_clients')
        .insert(client)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workshop-clients'] });
      toast.success('Klient dodany');
    },
    onError: (e: any) => toast.error(e.message),
  });
}

// ---- Vehicles ----
export function useWorkshopVehicles(providerId: string | undefined) {
  return useQuery({
    queryKey: ['workshop-vehicles', providerId],
    enabled: !!providerId,
    // PERF pkt 0: było refetchOnMount:'always' + staleTime:0 + gcTime:30s —
    // hook ma 3 konsumentów (WorkshopNewOrderDialog jest zamontowany NA STAŁE
    // w liście zleceń, więc jego zapytania żyją mimo zamkniętego dialogu),
    // każdy mount/nawigacja odpalała pełny fetch wszystkich pojazdów z joinem.
    // Świeżość po zapisie zapewniają invalidacje ['workshop-vehicles'].
    staleTime: 60 * 1000,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('workshop_vehicles')
        .select('*, owner:workshop_clients!workshop_vehicles_owner_client_id_fkey(id, first_name, last_name, company_name)')
        .eq('provider_id', providerId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });
}

export function useCreateWorkshopVehicle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vehicle: any) => {
      const { data, error } = await (supabase as any)
        .from('workshop_vehicles')
        .insert(vehicle)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workshop-vehicles'] });
      toast.success('Pojazd dodany');
    },
    onError: (e: any) => toast.error(e.message),
  });
}

// ---- Order Items ----
export function useCreateWorkshopOrderItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (item: any) => {
      const { data, error } = await (supabase as any)
        .from('workshop_order_items')
        // Idempotent insert: the caller supplies a stable client-generated `id`
        // (the draft row's draftKey). If the same draft gets committed twice — an
        // auto-save race, or a tab remount restoring the localStorage draft — the
        // duplicate hits ON CONFLICT DO NOTHING instead of creating a second
        // identical line. On a duplicate, `data` comes back null (nothing inserted).
        .upsert(item, { onConflict: 'id', ignoreDuplicates: true })
        .select()
        .maybeSingle();
      if (error) throw error;
      // Mark estimate as changed if it was already sent to client
      if (item.order_id) {
        await (supabase as any).from('workshop_orders')
          .update({ estimate_changed_after_send: true })
          .eq('id', item.order_id)
          .eq('estimate_sent_to_client', true);
      }
      await recomputeOrderTotals(item.order_id);
      // Magazyn: zejście FIFO tylko dla realnie wstawionej pozycji powiązanej z produktem
      // (data == null przy idempotentnym duplikacie → brak podwójnego zejścia).
      if (data?.inventory_product_id && Number(data.quantity) > 0) {
        const { shortfall } = await consumeStock(data.inventory_product_id, Number(data.quantity), data.id);
        if (shortfall > 0) toast.warning(`Magazyn: brakło ${shortfall} szt — zeszło tyle, ile było na stanie.`);
      }
      return data;
    },
    // Optimistic insert: drop the new line into every cached orders query right away,
    // so the list total recomputes instantly (like the live counter on the order card)
    // instead of waiting for the DB write + refetch. The caller supplies a stable `id`
    // (draftKey), so the refetch reconciles onto the same row without duplicating.
    onMutate: async (item: any) => {
      await qc.cancelQueries({ queryKey: ['workshop-orders'] });
      const snapshots: { key: any; data: any }[] = [];
      qc.getQueriesData({ queryKey: ['workshop-orders'] }).forEach(([key, data]: any) => {
        snapshots.push({ key, data });
        if (!Array.isArray(data)) return;
        const next = data.map((order: any) => {
          if (order?.id !== item.order_id) return order;
          const items = Array.isArray(order.items) ? order.items : [];
          if (items.some((i: any) => i.id === item.id)) return order; // already there — no double
          return { ...order, items: [...items, item] };
        });
        qc.setQueryData(key, next);
      });
      return { snapshots };
    },
    onError: (e: any, _vars, ctx: any) => {
      if (ctx?.snapshots) ctx.snapshots.forEach(({ key, data }: any) => qc.setQueryData(key, data));
      toast.error(e.message);
    },
    onSuccess: (data: any) => {
      pretranslateItem(data);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['workshop-orders'] });
    },
  });
}

// PERF P4: batchowy zapis pozycji dla kolejki w WorkshopOrderTasksTab — jedna
// paczka wierszy w JEDNYM upsert + JEDEN recompute totals, zamiast mutacji per
// wiersz (N× upsert + N× recompute + N× invalidacja listy = przeskakująca
// tabela przy szybkim dodawaniu). Cache'em zarządza wołający: optimistic insert
// przy enqueue, rollback przy błędzie, invalidacja raz po opróżnieniu kolejki.
// Idempotencja jak w useCreateWorkshopOrderItem: stabilne id (draftKey) +
// ignoreDuplicates — duplikat nie wstawia wiersza i nie schodzi z magazynu.
export async function createWorkshopOrderItemsBatch(items: any[]): Promise<any[]> {
  if (items.length === 0) return [];
  const orderId = items[0]?.order_id;
  const { data, error } = await (supabase as any)
    .from('workshop_order_items')
    .upsert(items, { onConflict: 'id', ignoreDuplicates: true })
    .select();
  if (error) throw error;
  const inserted = data || [];
  if (orderId) {
    await (supabase as any).from('workshop_orders')
      .update({ estimate_changed_after_send: true })
      .eq('id', orderId)
      .eq('estimate_sent_to_client', true);
    await recomputeOrderTotals(orderId);
  }
  // Magazyn: zejście FIFO tylko dla realnie wstawionych pozycji z produktem
  for (const row of inserted) {
    if (row?.inventory_product_id && Number(row.quantity) > 0) {
      const { shortfall } = await consumeStock(row.inventory_product_id, Number(row.quantity), row.id);
      if (shortfall > 0) toast.warning(`Magazyn: brakło ${shortfall} szt — zeszło tyle, ile było na stanie.`);
    }
  }
  inserted.forEach((row: any) => pretranslateItem(row));
  return inserted;
}

export function useUpdateWorkshopOrderItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: any) => {
      // Magazyn: przy zmianie ilości pobierz starą wartość, by zrobić deltę (dobiór/zwrot).
      let prev: any = null;
      if (updates.quantity !== undefined) {
        const { data: p } = await (supabase as any).from('workshop_order_items').select('quantity, inventory_product_id').eq('id', id).maybeSingle();
        prev = p;
      }
      const { data, error } = await (supabase as any)
        .from('workshop_order_items')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      // Mark estimate as changed if it was already sent to client
      if (data?.order_id) {
        await (supabase as any).from('workshop_orders')
          .update({ estimate_changed_after_send: true })
          .eq('id', data.order_id)
          .eq('estimate_sent_to_client', true);
      }
      if (prev?.inventory_product_id && updates.quantity !== undefined) {
        const { shortfall } = await adjustStock(prev.inventory_product_id, id, Number(prev.quantity), Number(updates.quantity));
        if (shortfall > 0) toast.warning(`Magazyn: brakło ${shortfall} szt — zeszło tyle, ile było.`);
      }
      await recomputeOrderTotals(data?.order_id);
      return data;
    },
    // Optimistic update: patch the item inside every cached orders query so the new
    // price/quantity/discount appears instantly (avoids the "ciągle pokazuje 0" lag).
    onMutate: async ({ id, ...updates }: any) => {
      await qc.cancelQueries({ queryKey: ['workshop-orders'] });
      const snapshots: { key: any; data: any }[] = [];
      qc.getQueriesData({ queryKey: ['workshop-orders'] }).forEach(([key, data]: any) => {
        snapshots.push({ key, data });
        if (!Array.isArray(data)) return;
        const next = data.map((order: any) => {
          if (!order?.items?.some((i: any) => i.id === id)) return order;
          return {
            ...order,
            items: order.items.map((i: any) => i.id === id ? { ...i, ...updates } : i),
          };
        });
        qc.setQueryData(key, next);
      });
      return { snapshots };
    },
    onError: (e: any, _vars, ctx: any) => {
      if (ctx?.snapshots) ctx.snapshots.forEach(({ key, data }: any) => qc.setQueryData(key, data));
      toast.error(e.message);
    },
    onSuccess: (data: any) => {
      // translate-on-write: nazwa pozycji mogła się zmienić → pre-tłumacz
      pretranslateItem(data);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['workshop-orders'] });
    },
  });
}

export function useDeleteWorkshopOrderItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      // Grab order_id + inventory link before deleting (recompute totals + zwrot magazynu).
      const { data: existing } = await (supabase as any)
        .from('workshop_order_items')
        .select('order_id, inventory_product_id')
        .eq('id', id)
        .maybeSingle();
      // Magazyn: zwrot części na stan, ale TYLKO gdy zlecenie nie jest zakończone
      // (po „Zakończone" zejście jest ostateczne — część zużyta).
      if (existing?.inventory_product_id && existing?.order_id) {
        const { data: ord } = await (supabase as any).from('workshop_orders').select('status_name').eq('id', existing.order_id).maybeSingle();
        if (ord?.status_name !== 'Zakończone') await returnStock(id);
      }
      const { error } = await (supabase as any)
        .from('workshop_order_items')
        .delete()
        .eq('id', id);
      if (error) throw error;
      await recomputeOrderTotals(existing?.order_id);
    },
    // Optimistic remove: drop the line from every cached orders query right away so the
    // list total falls instantly; onError restores the snapshot, onSettled reconciles.
    onMutate: async (id: string) => {
      await qc.cancelQueries({ queryKey: ['workshop-orders'] });
      const snapshots: { key: any; data: any }[] = [];
      qc.getQueriesData({ queryKey: ['workshop-orders'] }).forEach(([key, data]: any) => {
        snapshots.push({ key, data });
        if (!Array.isArray(data)) return;
        const next = data.map((order: any) => {
          if (!order?.items?.some((i: any) => i.id === id)) return order;
          return { ...order, items: order.items.filter((i: any) => i.id !== id) };
        });
        qc.setQueryData(key, next);
      });
      return { snapshots };
    },
    onError: (e: any, _vars, ctx: any) => {
      if (ctx?.snapshots) ctx.snapshots.forEach(({ key, data }: any) => qc.setQueryData(key, data));
      toast.error(e.message);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['workshop-orders'] });
    },
  });
}
