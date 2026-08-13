import { useState, useMemo, useEffect } from 'react';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { Card, CardContent } from '@/components/ui/card';
import { WorkshopPager, pageSlice } from './WorkshopPager';
import { useOrdersPaidMap } from '@/hooks/useFiscalCash';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import {
  useWorkshopOrders, useWorkshopStatuses, useUpdateWorkshopOrder, sortWorkshopOrderItems,
} from '@/hooks/useWorkshop';
import { WorkshopNewOrderDialog } from './WorkshopNewOrderDialog';
import { WorkshopPortalBookings } from './WorkshopPortalBookings';
import { WorkshopSmsDialog } from './WorkshopSmsDialog';
import { WorkshopEditClientDialog } from './WorkshopEditClientDialog';
import { WorkshopAssignClientDialog } from './WorkshopAssignClientDialog';
import { useVehicleLookup } from '@/hooks/useVehicleLookup';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { SimpleFreeInvoice } from '@/components/invoices/SimpleFreeInvoice';
import { ExistingInvoiceModal } from './ExistingInvoiceModal';
import { FiscalReceiptDialog } from '@/components/fiscal/FiscalReceiptDialog';
import { useFiscalizedDocumentIds, useOrderDocumentBadges } from '@/hooks/useFiscal';
import { InvoicePreviewModal } from '@/components/invoices/InvoicePreviewModal';
import { computeOrderTotals } from '@/utils/workshopOrderTotals';
import { WorkshopPaymentDialog } from './WorkshopPaymentDialog';
import { useWorkshopFinanceSettings } from '@/hooks/useWorkshopFinance';
import { returnStock } from '@/utils/workshopStock';
import {
  Plus, Search, Car, Trash2,
  Wrench, Loader2, Copy, Phone, Mail, User, ExternalLink, Building, Save, Calendar,
  FileText, Receipt, ChevronDown, ClipboardCheck
} from 'lucide-react';
import { format, isFuture, isPast } from 'date-fns';
import { pl } from 'date-fns/locale';
import { toast } from 'sonner';
import { WorkshopStatusPicker } from './WorkshopStatusPicker';
import { WorkshopRangeCalendar } from './WorkshopRangeCalendar';
import { getStatusStyle, translateWorkshopStatus } from '@/utils/workshopStatusStyle';
import { useWorkshopStatusStyles } from '@/hooks/useWorkshopStatusStyles';
import { useTranslation } from 'react-i18next';

interface Props {
  providerId: string;
  onSelectOrder?: (order: any) => void;
}

// A: derive the displayed amount straight from the order's line items instead of the
// denormalized `total_gross` column. The column is only refreshed by an effect inside
// the open order card, so reading it here showed a stale value until the card was
// re-opened. Items come fresh with every refetch, so this is always current.
const orderGrossAmount = (o: any) =>
  Array.isArray(o?.items) ? computeOrderTotals(o.items).total_gross : (o?.total_gross || 0);

export function WorkshopOrdersList({ providerId, onSelectOrder }: Props) {
  const { t } = useTranslation();  const confirmAction = useConfirm();

  const queryClient = useQueryClient();
  const [showNewOrder, setShowNewOrder] = useState(false);
  const [search, setSearch] = useState('');
  const [orderView, setOrderView] = useState<'active' | 'completed'>('active');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  // Pack 1: date range for the "Zakończone" view + payment modal on completion.
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [paymentOrder, setPaymentOrder] = useState<any | null>(null);
  // Ile zapłacono do każdego zlecenia — kolumna „Płatność" w widoku zakończonych.
  const { data: paidMap = {} } = useOrdersPaidMap(providerId);
  const { data: financeSettings } = useWorkshopFinanceSettings(providerId);
  const { getStyle } = useWorkshopStatusStyles(providerId);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [statusDropdownId, setStatusDropdownId] = useState<string | null>(null);
  const [editClient, setEditClient] = useState<any>(null);
  const [editVehicle, setEditVehicle] = useState<any>(null);
  const [smsDialogOrder, setSmsDialogOrder] = useState<any>(null);
  const [smsDialogType, setSmsDialogType] = useState<'reception' | 'quote' | 'ready'>('ready');
  const [invoiceOrder, setInvoiceOrder] = useState<any>(null);
  const [invoiceItems, setInvoiceItems] = useState<any[]>([]);
  const [invoiceBuyer, setInvoiceBuyer] = useState<any>(null);
  // Potwierdzenie wykonania usługi pokazujemy w tym samym podglądzie co fakturę
  // (z przyciskami „Pobierz PDF" i „Drukuj"), zamiast wyrzucać surowy HTML do
  // nowej karty i od razu otwierać okno drukowania.
  const [confirmationData, setConfirmationData] = useState<any>(null);
  // Uwagi na fakturze rozbite na dwa niezależne pola (dane pojazdu / numer zlecenia) —
  // każde ma własny przełącznik, bo warsztat nie zawsze chce oba naraz.
  const [invoiceVehicleNotes, setInvoiceVehicleNotes] = useState('');
  const [invoiceOrderNotes, setInvoiceOrderNotes] = useState('');
  const [fiscalOrder, setFiscalOrder] = useState<any>(null);
  // Zlecenia z wystawionym (albo trwającym) paragonem — pozycja w menu jest dla nich wyszarzona.
  const { data: fiscalizedIds } = useFiscalizedDocumentIds(providerId, 'workshop_order');
  // Znaczniki wystawionych dokumentów — trwałe, bo liczone z dokumentów, nie ze stanu zlecenia.
  const { data: documentBadges } = useOrderDocumentBadges(providerId, 'workshop_order');
  const [documentFilter, setDocumentFilter] = useState<'all' | 'with_receipt' | 'without_receipt' | 'with_invoice'>('all');
  const selectedFiscalized =
    selectedIds.size === 1 && Array.from(selectedIds).some((id) => fiscalizedIds?.has(id));
  const [existingInvoice, setExistingInvoice] = useState<any>(null);
  const [existingInvoiceOrder, setExistingInvoiceOrder] = useState<any>(null);
  const [assignClientOrderId, setAssignClientOrderId] = useState<string | null>(null);

  const { data: statuses = [] } = useWorkshopStatuses(providerId);
  // PERF C2: paginacja archiwum zakończonych — "Załaduj więcej" podbija limit.
  const [completedLimit, setCompletedLimit] = useState(100);
  // Szukanie odpytuje bazę (zlecenia + pojazdy + klienci), więc nie strzelamy
  // przy każdym wciśniętym klawiszu — dopiero gdy użytkownik przestanie pisać.
  const [searchDebounced, setSearchDebounced] = useState('');
  // Stronicowanie zamiast przewijania bez końca — przy 100+ zleceniach to jedyny
  // sposób, żeby wrócić do miejsca, w którym się było.
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  useEffect(() => {
    const timer = setTimeout(() => setSearchDebounced(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const { data: orders = [], isLoading } = useWorkshopOrders(providerId, {
<<<<<<< HEAD
    // Wyszukiwarka NIE chodzi do serwera: kazda litera tworzyla nowy klucz zapytania,
    // a wiec nowy request z pelnymi joinami (klient + pojazd + wszystkie pozycje).
    // Stad spinner przy kazdym znaku i zawieszanie. Lista aktywnych i tak jest
    // w pamieci — filtrujemy ja lokalnie (patrz filteredOrders), natychmiast
    // i po WSZYSTKICH polach, ktorych ludzie szukaja (marka, tablica, klient).
=======
    search: searchDebounced || undefined,
>>>>>>> origin/main
    // PERF C2: filtr widoku + zakres dat serwerowo — wejście na "Aktywne" nie
    // ściąga już całego archiwum zakończonych zleceń.
    view: orderView,
    dateFrom: orderView === 'completed' ? (dateFrom || undefined) : undefined,
    dateTo: orderView === 'completed' ? (dateTo || undefined) : undefined,
    limit: orderView === 'completed' ? completedLimit : undefined,
  });
  const updateOrder = useUpdateWorkshopOrder();

  // Realtime: keep order list in sync with DB changes (e.g. client signs document → status changes)
  useEffect(() => {
    if (!providerId) return;
    const channel = (supabase as any)
      .channel(`workshop-orders-rt-${providerId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'workshop_orders', filter: `provider_id=eq.${providerId}` },
        (payload: any) => {
          // PERF A2: UPDATE niesie pełny nowy wiersz — wmerguj go do cache
          // zamiast refetchować całą listę (echo własnej zmiany statusu
          // kosztowało pełny refetch). Joiny (client/vehicle/items) zostają
          // z poprzedniego stanu wiersza.
          if (payload?.eventType === 'UPDATE' && payload?.new?.id) {
            queryClient.setQueriesData({ queryKey: ['workshop-orders'] }, (old: any) =>
              Array.isArray(old)
                ? old.map((o: any) => (o.id === payload.new.id ? { ...o, ...payload.new } : o))
                : old
            );
            return;
          }
          // INSERT/DELETE potrzebują joinów — pełne odświeżenie.
          queryClient.invalidateQueries({ queryKey: ['workshop-orders'] });
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'workshop_order_items' },
        (payload: any) => {
          // PERF B1: items nie mają provider_id, więc filtr serwerowy jest
          // niemożliwy — zamiast refetchować listę przy KAŻDEJ zmianie pozycji
          // w całej bazie (dodanie 5 pozycji = 5 refetchy), merguj zdarzenie
          // punktowo do cache. Pozycje cudzych warsztatów nie znajdą swojego
          // zlecenia w cache i są tanim no-opem.
          const item = payload?.new?.id ? payload.new : null;
          if (payload?.eventType === 'INSERT' && item?.order_id) {
            queryClient.setQueriesData({ queryKey: ['workshop-orders'] }, (old: any) =>
              Array.isArray(old)
                ? old.map((o: any) => {
                    if (o.id !== item.order_id) return o;
                    const items = Array.isArray(o.items) ? o.items : [];
                    if (items.some((it: any) => it.id === item.id)) return o;
                    return { ...o, items: sortWorkshopOrderItems([...items, item]) };
                  })
                : old
            );
          } else if (payload?.eventType === 'UPDATE' && item?.order_id) {
            queryClient.setQueriesData({ queryKey: ['workshop-orders'] }, (old: any) =>
              Array.isArray(old)
                ? old.map((o: any) =>
                    o.id === item.order_id && Array.isArray(o.items)
                      ? { ...o, items: sortWorkshopOrderItems(o.items.map((it: any) => (it.id === item.id ? { ...it, ...item } : it))) }
                      : o
                  )
                : old
            );
          } else if (payload?.eventType === 'DELETE' && payload?.old?.id) {
            // DELETE niesie tylko PK — usuń pozycję z tego zlecenia, które ją ma.
            const deletedId = payload.old.id;
            queryClient.setQueriesData({ queryKey: ['workshop-orders'] }, (old: any) =>
              Array.isArray(old)
                ? old.map((o: any) =>
                    Array.isArray(o.items) && o.items.some((it: any) => it.id === deletedId)
                      ? { ...o, items: o.items.filter((it: any) => it.id !== deletedId) }
                      : o
                  )
                : old
            );
          }
        },
      )
      .subscribe();
    return () => {
      (supabase as any).removeChannel(channel);
    };
  }, [providerId, queryClient]);

  const filteredOrders = useMemo(() => {
    let filtered = orders.filter((o: any) => orderView === 'completed'
      ? o.status_name === 'Zakończone'
      : o.status_name !== 'Zakończone'
    );
    if (statusFilter !== 'all') {
      filtered = filtered.filter((o: any) => o.status_name === statusFilter);
    }
    // Date range (mainly for the completed view): filter by completion date if set,
    // else creation date. Porównanie po części daty YYYY-MM-DD (jak w raporcie
    // "Rozliczenie zleceń") — bez off-by-one na granicach przy strefach czasowych.
    if (dateFrom || dateTo) {
      filtered = filtered.filter((o: any) => {
        const basis = o.completed_at || o.created_at;
        if (!basis) return false;
        const d = String(basis).slice(0, 10);
        return (!dateFrom || d >= dateFrom) && (!dateTo || d <= dateTo);
      });
    }
<<<<<<< HEAD
    // Szukanie: numer zlecenia, opis, status, dane klienta i pojazdu.
    // Tablice porownujemy bez spacji i myslnikow ("WA 123 AB" znajdzie "WA123AB").
    const phrase = search.trim().toLowerCase();
    if (phrase) {
      const plain = (v: unknown) => String(v ?? '').toLowerCase();
      const compact = (v: unknown) => plain(v).replace(/[\s-]/g, '');
      const needle = compact(phrase);
      filtered = filtered.filter((o: any) => {
        const haystack = [
          o.order_number, o.description, o.status_name, o.client_code,
          o.client?.first_name, o.client?.last_name, o.client?.company_name,
          o.client?.phone, o.client?.email, o.client?.nip,
          o.vehicle?.brand, o.vehicle?.model, o.vehicle?.vin, o.vehicle?.year,
        ].map(plain).join(' ');
        if (haystack.includes(phrase)) return true;
        // marka + model razem: "bmw x5" znajdzie pojazd BMW / X5
        const brandModel = `${plain(o.vehicle?.brand)} ${plain(o.vehicle?.model)}`;
        if (brandModel.includes(phrase)) return true;
        return compact(o.vehicle?.plate).includes(needle);
      });
    }
    return filtered;
  }, [orders, orderView, statusFilter, dateFrom, dateTo, search]);
=======
    if (documentFilter !== 'all') {
      filtered = filtered.filter((o: any) => {
        const badges = documentBadges?.get(o.id);
        if (documentFilter === 'with_receipt') return Boolean(badges?.hasReceipt);
        if (documentFilter === 'without_receipt') return !badges?.hasReceipt;
        return Boolean(badges?.hasInvoice);
      });
    }
    return filtered;
  }, [orders, orderView, statusFilter, dateFrom, dateTo, documentFilter, documentBadges]);
>>>>>>> origin/main

  useEffect(() => {
    setSelectedIds(new Set());
  }, [orderView]);

  const totalSum = filteredOrders.reduce((s: number, o: any) => s + orderGrossAmount(o), 0);
  const pagedOrders = pageSlice(filteredOrders, page, pageSize);

  // Zmiana filtra cofa na pierwszą stronę — inaczej wynik ląduje poza widokiem.
  useEffect(() => { setPage(1); }, [searchDebounced, statusFilter, orderView, documentFilter, dateFrom, dateTo, pageSize]);

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // Called by the status-picker when an admin changes status from the list.
  // - Optimistically patches the cached order so the badge updates instantly
  // - Auto-opens the SMS dialog for "Gotowy do odbioru" / "Wycena wysłana"
  const handleStatusChanged = (orderId: string, newStatus: string) => {
    queryClient.setQueriesData({ queryKey: ['workshop-orders'] }, (old: any) =>
      Array.isArray(old)
        ? old.map((o: any) => (o.id === orderId ? { ...o, status_name: newStatus } : o))
        : old
    );
    const order = orders.find((o: any) => o.id === orderId);
    if (!order) return;
    // Pack 1: closing an order opens the payment form (cash/card/BLIK/transfer, split).
    if (newStatus === 'Zakończone' && financeSettings?.cash_enabled) {
      setPaymentOrder({ ...order, status_name: newStatus });
    }
    const lower = (newStatus || '').toLowerCase();
    if (lower.includes('gotow') || lower.includes('odbioru')) {
      setSmsDialogType('ready');
      setSmsDialogOrder({ ...order, status_name: newStatus });
    } else if (lower.includes('wycena wysłana') || lower.includes('kosztorys')) {
      setSmsDialogType('quote');
      setSmsDialogOrder({ ...order, status_name: newStatus });
    }
    // PERF A2: bez pełnej invalidacji — optimistic patch powyżej wystarcza,
    // a pola pochodne z serwera (completed_at, station_id po handoverze)
    // dosyła realtime-merge z subskrypcji workshop_orders.
  };

  const changeStatus = async (orderId: string, newStatus: string) => {
    await updateOrder.mutateAsync({ id: orderId, status_name: newStatus });
    setStatusDropdownId(null);
    toast.success(t('workshop.orders.statusChangedTo', { status: translateWorkshopStatus(newStatus, t) }));
    handleStatusChanged(orderId, newStatus);
  };

  const openInvoiceForOrder = async (order: any, docType: 'invoice' | 'receipt' = 'invoice') => {
    try {
      // Duplicate check: if invoice already exists for this order, show existing-invoice modal
      const { data: existing } = await (supabase as any)
        .from('user_invoices')
        .select('*')
        .eq('workshop_order_id', order.id)
        .neq('is_correction', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existing) {
        setExistingInvoice(existing);
        setExistingInvoiceOrder(order);
        return;
      }

      // Load order items
      const { data: orderItems } = await (supabase as any)
        .from('workshop_order_items')
        .select('*')
        .eq('order_id', order.id)
        .order('sort_order');

      // FAZA 5: puste wiersze z zestawienia (bez nazwy i bez ceny) nie wchodzą
      // na fakturę — inaczej lądowały jako "1 | 0,00 zł" bez nazwy na PDF/KSeF.
      const prefillItems = (orderItems || [])
        .filter((item: any) => (item.name || '').trim() || item.unit_price_net || item.unit_price_gross)
        .map((item: any) => ({
          name: item.name || '',
          quantity: item.quantity || 1,
          unit: item.unit || 'usł.',
          unit_net_price: item.unit_price_net || 0,
          unit_gross_price: item.unit_price_gross || 0,
          vat_rate: '23',
          discount_percent: item.discount_percent || 0,
        }));

      const buyer: any = {};
      if (order.client) {
        buyer.name = order.client.client_type === 'company'
          ? order.client.company_name
          : `${order.client.first_name || ''} ${order.client.last_name || ''}`.trim();
        buyer.nip = order.client.nip || '';
        buyer.address_street = order.client.address || '';
        buyer.address_city = order.client.city || '';
        buyer.address_postal_code = order.client.postal_code || '';
        buyer.email = order.client.email || '';
      }

      // Dane pojazdu i nr zlecenia NIE trafiają do uwag automatycznie — SimpleFreeInvoice
      // pokaże dwa niezależne checkboxy (stany pamiętane między fakturami).
      // Tylko wypełnione pola — bez pustych etykiet typu "Marka: ,".
      const vehicleDesc = order.vehicle
        ? [
            order.vehicle.brand ? `Marka: ${order.vehicle.brand}` : '',
            order.vehicle.model ? `Model: ${order.vehicle.model}` : '',
            order.vehicle.plate ? `Nr rej: ${order.vehicle.plate}` : '',
            order.vehicle.vin ? `VIN: ${order.vehicle.vin}` : '',
          ].filter(Boolean).join(', ')
        : '';

      setInvoiceItems(prefillItems);
      setInvoiceBuyer(buyer);
      setInvoiceVehicleNotes(vehicleDesc);
      setInvoiceOrderNotes(order.order_number ? `Do zlecenia: ${order.order_number}` : '');
      setInvoiceOrder(order);
    } catch (e: any) {
      toast.error(t('workshop.orders.loadItemsError'));
    }
  };

  const generateServiceConfirmation = async (order: any) => {
    try {
      const { data: orderItems } = await (supabase as any)
        .from('workshop_order_items')
        .select('*')
        .eq('order_id', order.id)
        .order('sort_order');

      const { data: { session } } = await supabase.auth.getSession();
      let companyData: any = null;
      let logoUrl: string = '';
      if (session?.user) {
        const { data: cs } = await (supabase as any)
          .from('company_settings')
          .select('*')
          .eq('user_id', session.user.id)
          .maybeSingle();
        companyData = cs;
        // Try invoice company first (has logo_url)
        const { data: invCompany } = await (supabase as any)
          .from('user_invoice_companies')
          .select('logo_url, name, nip, address_street, address_building_number, address_city, address_postal_code, email, phone')
          .eq('user_id', session.user.id)
          .eq('is_default', true)
          .maybeSingle();
        if (invCompany?.logo_url) logoUrl = invCompany.logo_url;
        if (invCompany && !companyData) companyData = invCompany;
        // Fallback: service_providers / workshop_settings
        if (!logoUrl) {
          const { data: sp } = await supabase
            .from('service_providers').select('logo_url').eq('user_id', session.user.id).maybeSingle();
          if (sp?.logo_url) logoUrl = sp.logo_url;
        }
        if (!logoUrl) {
          const { data: ws } = await (supabase as any)
            .from('workshop_settings').select('logo_url').eq('user_id', session.user.id).maybeSingle();
          if (ws?.logo_url) logoUrl = ws.logo_url;
        }
      }

      const items = (orderItems || []).map((item: any) => {
        const qty = item.quantity || 1;
        const unitNet = item.unit_price_net || 0;
        const unitGross = item.unit_price_gross || 0;
        const grossAmount = item.total_gross || qty * unitGross;
        const netAmount = item.total_net || qty * unitNet;
        return {
          name: item.name || '',
          quantity: qty,
          unit: item.unit || 'usł.',
          unit_net_price: unitNet,
          vat_rate: '23',
          net_amount: netAmount,
          vat_amount: grossAmount - netAmount,
          gross_amount: grossAmount,
        };
      });

      const buyer: any = {};
      if (order.client) {
        buyer.name = order.client.client_type === 'company'
          ? order.client.company_name
          : `${order.client.first_name || ''} ${order.client.last_name || ''}`.trim();
        buyer.nip = order.client.nip || '';
        buyer.address_street = order.client.address || '';
      }

      const vehicleDesc = order.vehicle
        ? `Pojazd: ${order.vehicle.brand || ''} ${order.vehicle.model || ''}, Nr rej: ${order.vehicle.plate || ''}`
        : '';

      const today = new Date().toISOString().split('T')[0];
      const invoiceData: any = {
        invoice_number: `PWU/${order.order_number || 'dok'}`,
        type: 'service_confirmation',
        issue_date: today,
        sale_date: today,
        due_date: today,
        payment_method: 'cash',
        notes: vehicleDesc,
        currency: 'PLN',
        paid_amount: 0,
        is_fully_paid: true,
        items,
        seller: {
          name: companyData?.company_name || companyData?.name || '',
          nip: companyData?.nip || '',
          address_street: companyData?.street || companyData?.address_street || companyData?.address || '',
          address_building_number: companyData?.building_number || companyData?.address_building_number || '',
          address_apartment_number: companyData?.apartment_number || companyData?.address_apartment_number || '',
          address_city: companyData?.city || companyData?.address_city || '',
          address_postal_code: companyData?.postal_code || companyData?.address_postal_code || '',
          email: companyData?.email || '',
          phone: companyData?.phone || '',
          bank_name: companyData?.bank_name || '',
          bank_account: companyData?.bank_account || '',
          logo_url: logoUrl || companyData?.logo_url || '',
        },
        buyer,
      };

      setConfirmationData(invoiceData);
    } catch (e: any) {
      console.error('[generateServiceConfirmation]', e);
      toast.error(t('workshop.orders.confirmationError', { error: e?.message || e?.toString() || t('workshop.orders.unknownError') }));
    }
  };

  const getClientName = (o: any) => {
    if (!o.client) return '';
    return o.client.client_type === 'company'
      ? o.client.company_name
      : `${o.client.first_name || ''} ${o.client.last_name || ''}`.trim();
  };

  const getVehicleName = (o: any) => {
    if (!o.vehicle) return '';
    return `${o.vehicle.brand || ''} ${o.vehicle.model || ''} ${o.vehicle.plate || ''}`.trim();
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => setShowNewOrder(true)} className="gap-2" size="sm">
          <Plus className="h-4 w-4" /> <span className="hidden sm:inline">{t('workshop.orders.new')}</span> {t('workshop.orders.order')}
        </Button>

        <div className="flex items-center gap-1 rounded-lg border bg-muted/30 p-0.5">
          <Button
            variant={orderView === 'active' ? 'default' : 'ghost'}
            size="sm"
            className="h-8"
            onClick={() => setOrderView('active')}
          >
            {t('workshop.orders.activeOrders')}
          </Button>
          <Button
            variant={orderView === 'completed' ? 'default' : 'ghost'}
            size="sm"
            className="h-8"
            onClick={() => setOrderView('completed')}
          >
            {t('workshop.orders.completedOrders')}
          </Button>
        </div>

        {selectedIds.size > 0 && (
          <Button variant="destructive" size="sm" className="gap-1" onClick={async () => {
            const count = selectedIds.size;
            if (!(await confirmAction({ title: t('workshop.orders.confirmDelete', { count }) }))) return;
            const ids = Array.from(selectedIds);
            // Optimistic: remove from cache + clear selection immediately
            queryClient.setQueriesData({ queryKey: ['workshop-orders'] }, (old: any) =>
              Array.isArray(old) ? old.filter((o: any) => !ids.includes(o.id)) : old
            );
            setSelectedIds(new Set());
            toast.success(t('workshop.orders.deletedCount', { count }));
            try {
              await Promise.all(ids.map(async (id) => {
                // Magazyn: usunięcie zlecenia zwraca części na stan (chyba że zakończone).
                const ord = orders.find((o: any) => o.id === id);
                if (ord?.status_name !== 'Zakończone') {
                  const linked = (ord?.items || []).filter((it: any) => it.inventory_product_id);
                  for (const it of linked) await returnStock(it.id);
                }
                await Promise.all([
                  (supabase as any).from('workshop_order_items').delete().eq('order_id', id),
                  (supabase as any).from('workshop_order_signatures').delete().eq('order_id', id),
                ]);
                await (supabase as any).from('workshop_orders').delete().eq('id', id);
              }));
            } catch (e: any) {
              toast.error(e.message || t('workshop.orders.deleteError'));
            } finally {
              queryClient.invalidateQueries({ queryKey: ['workshop-orders'] });
            }
          }}>
            <Trash2 className="h-4 w-4" /> {t('common.delete')}
          </Button>
        )}

        {/* Menu „Wystaw" jest zawsze klikalne — użytkownik ma widzieć, że funkcja istnieje,
            zanim zaznaczy zlecenie. Bez zaznaczenia pozycje są wyszarzone z podpowiedzią. */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1">
              <FileText className="h-4 w-4" /> {t('workshop.orders.issue')} <ChevronDown className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            {selectedIds.size !== 1 && (
              <div className="px-2 py-1.5 text-xs text-muted-foreground max-w-[240px]">
                {t('workshop.orders.selectOrderFirst')}
              </div>
            )}
            {selectedIds.size === 1 && selectedFiscalized && (
              <div className="px-2 py-1.5 text-xs text-muted-foreground max-w-[240px]">
                {t('workshop.orders.alreadyFiscalized')}
              </div>
            )}
            <DropdownMenuItem
              disabled={selectedIds.size !== 1 || selectedFiscalized}
              onClick={() => {
                const order = orders.find((o: any) => selectedIds.has(o.id));
                if (order) setFiscalOrder(order);
              }}
            >
              <Receipt className="h-4 w-4 mr-2" /> {t('workshop.orders.fiscalReceipt')}
            </DropdownMenuItem>
            <DropdownMenuItem disabled={selectedIds.size !== 1} onClick={() => {
              const order = orders.find((o: any) => selectedIds.has(o.id));
              if (order) openInvoiceForOrder(order, 'invoice');
            }}>
              <FileText className="h-4 w-4 mr-2" /> {t('workshop.orders.invoice')}
            </DropdownMenuItem>
            <DropdownMenuItem disabled={selectedIds.size !== 1} onClick={() => {
              const order = orders.find((o: any) => selectedIds.has(o.id));
              if (order) generateServiceConfirmation(order);
            }}>
              <ClipboardCheck className="h-4 w-4 mr-2" /> {t('workshop.orders.serviceConfirmation')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="flex-1" />

        <Select value={documentFilter} onValueChange={(v) => setDocumentFilter(v as typeof documentFilter)}>
          <SelectTrigger className="h-8 w-[190px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('workshop.orders.docsAll')}</SelectItem>
            <SelectItem value="with_receipt">{t('workshop.orders.docsWithReceipt')}</SelectItem>
            <SelectItem value="without_receipt">{t('workshop.orders.docsWithoutReceipt')}</SelectItem>
            <SelectItem value="with_invoice">{t('workshop.orders.docsWithInvoice')}</SelectItem>
          </SelectContent>
        </Select>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-8 w-[180px]">
            <SelectValue placeholder={t('workshop.orders.allStatuses')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('workshop.orders.allStatuses')}</SelectItem>
            {statuses.filter((s: any) => orderView === 'completed' ? s.name === 'Zakończone' : s.name !== 'Zakończone').map((s: any) => (
              <SelectItem key={s.id} value={s.name}>
                <div className="flex items-center gap-2">
                  {/* Kropka z tego samego źródła co badge (paleta / tryb Ręczne) */}
                  <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: getStyle(s.name).dotColor }} />
                  {translateWorkshopStatus(s.name, t)}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {orderView === 'completed' && (
          <div className="flex items-center gap-1">
            {/* Portalowy range-picker (klik początek → klik koniec, ten sam dzień OK) —
                ten sam komponent co w Raportach, zamiast dwóch natywnych pól date. */}
            <WorkshopRangeCalendar from={dateFrom} to={dateTo} onChange={(f, tto) => { setDateFrom(f); setDateTo(tto); }} align="end" />
            {(dateFrom || dateTo) && (
              <Button variant="ghost" size="sm" className="h-8 px-2" onClick={() => { setDateFrom(''); setDateTo(''); }}>×</Button>
            )}
          </div>
        )}

        <div className="relative w-full sm:w-auto">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            onFocus={e => e.currentTarget.select()}
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={t('common.search')}
            className="pl-9 w-full sm:w-[200px] h-8"
          />
        </div>
      </div>

      {/* Mobile card view */}
      <div className="md:hidden space-y-2">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground space-y-2">
            <div>{t('workshop.orders.noOrders')}</div>
            {searchDebounced && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setOrderView(orderView === 'active' ? 'completed' : 'active')}
              >
                Szukaj „{searchDebounced}" w {orderView === 'active' ? 'zakończonych' : 'aktywnych'}
              </Button>
            )}
          </div>
        ) : (
          <>
            {pagedOrders.map((order: any) => {
              const ss = getStatusStyle(order.status_name);
              return (
              <Card key={order.id} className={`cursor-pointer hover:shadow-md transition-shadow ${ss.row} ${ss.border}`} onClick={() => onSelectOrder?.(order)}>
                <CardContent className="p-3">
                  <div className="flex items-center justify-between mb-1.5 gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Wrench className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span className="font-semibold text-sm truncate">{order.order_number}</span>
                    </div>
                    <div onClick={e => e.stopPropagation()}>
                      <WorkshopStatusPicker
                        providerId={providerId}
                        orderId={order.id}
                        currentStatus={order.status_name}
                        hasUnreadNotes={order.has_unread_notes}
                        onChanged={(name) => handleStatusChanged(order.id, name)}
                        size="xs"
                      />
                    </div>
                  </div>
                  {order.scheduled_date && isFuture(new Date(order.scheduled_date)) && (
                    <div className="text-[10px] text-primary mb-1">📅 {format(new Date(order.scheduled_date), 'd MMM HH:mm', { locale: pl })}</div>
                  )}
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      {getVehicleName(order) && (
                        <span className="flex items-center gap-1 truncate">
                          <Car className="h-3 w-3 shrink-0" /> {getVehicleName(order)}
                        </span>
                      )}
                    </div>
                    <span className="font-medium text-foreground text-sm ml-2 shrink-0">
                      {orderGrossAmount(order).toLocaleString('pl-PL', { minimumFractionDigits: 2 })} zł
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground mt-1">
                    {getClientName(order) ? (
                      <span>{getClientName(order)}</span>
                    ) : (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setAssignClientOrderId(order.id); }}
                        className="inline-flex items-center gap-1 text-green-600 hover:text-green-700"
                        title={t('workshop.orders.addClient')}
                      >
                        <Plus className="h-3.5 w-3.5" /> {t('workshop.orders.addClient')}
                      </button>
                    )}
                    <span>{format(new Date(order.created_at), 'dd.MM.yyyy')}</span>
                  </div>
                </CardContent>
              </Card>
              );
            })}
            {filteredOrders.length > 0 && (
              <div className="text-right text-sm font-semibold px-2 pt-2 border-t">
                {t('workshop.orders.sum')}: {totalSum.toLocaleString('pl-PL', { minimumFractionDigits: 2 })} zł
              </div>
            )}
            <WorkshopPager
              page={page}
              pageSize={pageSize}
              total={filteredOrders.length}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
              className="px-2"
            />
          </>
        )}
      </div>

      {/* Desktop table view */}
      <Card className="hidden md:block">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10"></TableHead>
                  <TableHead>{t('workshop.orders.colOrderNumber')}</TableHead>
                  <TableHead>{t('workshop.orders.colStatus')}</TableHead>
                  <TableHead className="text-right">{t('workshop.orders.colTotal')}</TableHead>
                   <TableHead>{t('workshop.orders.colVehicle')}</TableHead>
                   <TableHead>{t('workshop.orders.colClient')}</TableHead>
                   <TableHead>{t('workshop.orders.colReceived')}</TableHead>
                   <TableHead>{t('workshop.orders.colDeadline')}</TableHead>
                   {orderView === 'completed' && <TableHead>Płatność</TableHead>}
                   <TableHead>{t('workshop.orders.colDocuments')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagedOrders.map((order: any) => {
                  const ss = getStatusStyle(order.status_name);
                  return (
                  <TableRow key={order.id} className={`group cursor-pointer transition-colors ${ss.row}`} onClick={() => onSelectOrder?.(order)}>
                    <TableCell onClick={e => e.stopPropagation()}>
                      <Checkbox
                        checked={selectedIds.has(order.id)}
                        onCheckedChange={() => toggleSelect(order.id)}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className={`w-1 h-6 rounded-full ${ss.dot}`} />
                        <Wrench className="h-4 w-4 text-muted-foreground" />
                        <span className="font-semibold tabular-nums tracking-tight">{order.order_number}</span>
                      </div>
                    </TableCell>
                    <TableCell onClick={e => e.stopPropagation()}>
                      <WorkshopStatusPicker
                        providerId={providerId}
                        orderId={order.id}
                        currentStatus={order.status_name}
                        hasUnreadNotes={order.has_unread_notes}
                        onChanged={(name) => handleStatusChanged(order.id, name)}
                      />
                    </TableCell>
                    <TableCell className="text-right text-[15px] font-semibold tabular-nums text-foreground">
                      {orderGrossAmount(order).toLocaleString('pl-PL', { minimumFractionDigits: 2 })}
                    </TableCell>

                    <TableCell onClick={e => e.stopPropagation()}>
                      <HoverCard openDelay={400} closeDelay={200}>
                        <HoverCardTrigger asChild>
                          <div
                            className="flex items-center gap-1.5 cursor-pointer hover:text-primary transition-colors"
                            onClick={() => order.vehicle && setEditVehicle(order.vehicle)}
                          >
                            {order.vehicle && <Car className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                            {order.vehicle ? (
                              <div className="flex flex-col min-w-0 leading-tight">
                                {/* Plate first — always fully visible, never truncated. */}
                                {order.vehicle.plate ? (
                                  <>
                                    <span className="text-[15px] font-semibold tracking-wide whitespace-nowrap tabular-nums">{order.vehicle.plate}</span>
                                    {(order.vehicle.brand || order.vehicle.model) && (
                                      <span className="text-[13px] font-medium text-foreground/70 truncate max-w-[180px]">
                                        {`${order.vehicle.brand || ''} ${order.vehicle.model || ''}`.trim()}
                                      </span>
                                    )}
                                  </>
                                ) : (
                                  <span className="text-sm truncate max-w-[180px]">
                                    {`${order.vehicle.brand || ''} ${order.vehicle.model || ''}`.trim() || '—'}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-sm text-muted-foreground">—</span>
                            )}
                          </div>
                        </HoverCardTrigger>
                        {order.vehicle && (
                          <HoverCardContent className="w-96 max-w-[calc(100vw-2rem)] p-4" side="bottom" align="start">
                            <div className="flex items-center justify-between mb-2">
                              <p className="font-semibold text-base">{order.vehicle.brand} {order.vehicle.model}</p>
                              <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setEditVehicle(order.vehicle)}>
                                <ExternalLink className="h-3 w-3" />
                              </Button>
                            </div>
                            <div className="grid grid-cols-[auto,minmax(0,1fr)] gap-x-3 gap-y-2 text-sm">
                              {order.vehicle.plate && (
                                <>
                                  <span className="text-muted-foreground">{t('workshop.orders.plate')}</span>
                                  <button className="text-left font-semibold text-foreground hover:text-primary flex items-center gap-1.5" onClick={() => { navigator.clipboard.writeText(order.vehicle.plate); toast.success(t('workshop.orders.copiedPlate')); }}>
                                    {order.vehicle.plate} <Copy className="h-3 w-3 opacity-50 shrink-0" />
                                  </button>
                                </>
                              )}
                              {order.vehicle.vin && (
                                <>
                                  <span className="text-muted-foreground">{t('workshop.orders.vin')}</span>
                                  <button className="text-left font-semibold text-foreground hover:text-primary flex items-center justify-between gap-2 min-w-0" onClick={() => { navigator.clipboard.writeText(order.vehicle.vin); toast.success(t('workshop.orders.copiedVin')); }}>
                                    <span className="break-all">{order.vehicle.vin}</span> <Copy className="h-3 w-3 opacity-50 shrink-0" />
                                  </button>
                                </>
                              )}
                              {order.vehicle.year && (
                                <>
                                  <span className="text-muted-foreground">{t('workshop.orders.yearOfProd')}</span>
                                  <span className="font-semibold text-foreground">{order.vehicle.year}</span>
                                </>
                              )}
                              {order.vehicle.engine_capacity && (
                                <>
                                  <span className="text-muted-foreground">{t('workshop.orders.capacity')}</span>
                                  <span className="font-semibold text-foreground">{order.vehicle.engine_capacity} cc</span>
                                </>
                              )}
                              {order.vehicle.engine_power && (
                                <>
                                  <span className="text-muted-foreground">{t('workshop.orders.power')}</span>
                                  <span className="font-semibold text-foreground">{order.vehicle.engine_power} kW</span>
                                </>
                              )}
                              {order.vehicle.fuel_type && (
                                <>
                                  <span className="text-muted-foreground">{t('workshop.orders.fuel')}</span>
                                  <span className="font-semibold text-foreground">{order.vehicle.fuel_type}</span>
                                </>
                              )}
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              className="w-full mt-3 h-7 text-xs gap-1"
                              onClick={() => setEditVehicle(order.vehicle)}
                            >
                              <ExternalLink className="h-3 w-3" /> {t('workshop.orders.openVehicleCard')}
                            </Button>
                          </HoverCardContent>
                        )}
                      </HoverCard>
                    </TableCell>
                    <TableCell onClick={e => e.stopPropagation()}>
                      {order.client ? (
                      <HoverCard openDelay={400} closeDelay={200}>
                        <HoverCardTrigger asChild>
                          <span
                            className="text-sm font-medium text-foreground cursor-pointer hover:text-primary transition-colors"
                            onClick={() => order.client && setEditClient(order.client)}
                          >
                            {getClientName(order)}
                          </span>
                        </HoverCardTrigger>
                        {order.client && (
                          <HoverCardContent className="w-72 p-3" side="bottom" align="start">
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                {order.client.client_type === 'company' ? (
                                  <Building className="h-4 w-4 text-muted-foreground" />
                                ) : (
                                  <User className="h-4 w-4 text-muted-foreground" />
                                )}
                                <span className="font-semibold text-sm">{getClientName(order)}</span>
                              </div>
                              <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setEditClient(order.client)}>
                                <ExternalLink className="h-3 w-3" />
                              </Button>
                            </div>
                            {order.client.company_name && order.client.client_type === 'company' && (
                              <p className="text-xs text-muted-foreground mb-2">{order.client.company_name}</p>
                            )}
                            <div className="space-y-1.5 text-xs">
                              {order.client.phone && (
                                <button className="flex items-center gap-2 hover:text-primary w-full text-left" onClick={() => { navigator.clipboard.writeText(order.client.phone); toast.success(t('workshop.orders.copiedPhone')); }}>
                                  <Phone className="h-3 w-3 text-muted-foreground" />
                                  <span>{order.client.phone}</span>
                                  <Copy className="h-2.5 w-2.5 opacity-50 ml-auto" />
                                </button>
                              )}
                              {order.client.email && (
                                <button className="flex items-center gap-2 hover:text-primary w-full text-left" onClick={() => { navigator.clipboard.writeText(order.client.email); toast.success(t('workshop.orders.copiedEmail')); }}>
                                  <Mail className="h-3 w-3 text-muted-foreground" />
                                  <span className="truncate">{order.client.email}</span>
                                  <Copy className="h-2.5 w-2.5 opacity-50 ml-auto" />
                                </button>
                              )}
                              {order.client.nip && (
                                <button className="flex items-center gap-2 hover:text-primary w-full text-left" onClick={() => { navigator.clipboard.writeText(order.client.nip); toast.success(t('workshop.orders.copiedNip')); }}>
                                  <span className="text-muted-foreground">{t('workshop.orders.nip')}</span>
                                  <span>{order.client.nip}</span>
                                  <Copy className="h-2.5 w-2.5 opacity-50 ml-auto" />
                                </button>
                              )}
                              {order.client.city && (
                                <div className="flex items-center gap-2 text-muted-foreground">
                                  <span>📍 {order.client.city}</span>
                                </div>
                              )}
                            </div>
                            <div className="flex gap-2 mt-3">
                              <Button
                                variant="outline"
                                size="sm"
                                className="flex-1 h-7 text-xs gap-1"
                                onClick={() => setEditClient(order.client)}
                              >
                                <ExternalLink className="h-3 w-3" /> {t('workshop.orders.open')}
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="flex-1 h-7 text-xs gap-1 border-primary/40 text-primary hover:bg-primary/10"
                                onClick={() => setAssignClientOrderId(order.id)}
                                title={t('workshop.orders.changeClientTitle')}
                              >
                                <Search className="h-3 w-3" /> {t('workshop.orders.change')}
                              </Button>
                            </div>
                          </HoverCardContent>
                        )}
                      </HoverCard>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setAssignClientOrderId(order.id)}
                          className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-green-500/15 text-green-600 hover:bg-green-500 hover:text-white transition-colors"
                          title={t('workshop.orders.addClientToOrder')}
                        >
                          <Plus className="h-4 w-4" />
                        </button>
                      )}
                     </TableCell>
                     <TableCell className="text-sm tabular-nums whitespace-nowrap text-foreground">
                       {format(new Date(order.created_at), 'yyyy-MM-dd')}
                     </TableCell>
                     <TableCell>
                       {order.scheduled_date ? (
                         <Badge variant="outline" className={`text-xs whitespace-nowrap ${
                           isFuture(new Date(order.scheduled_date))
                             ? 'border-primary text-primary'
                             : 'border-destructive text-destructive'
                         }`}>
                           <Calendar className="h-3 w-3 mr-1" />
                           {format(new Date(order.scheduled_date), 'd MMM HH:mm', { locale: pl })}
                         </Badge>
                       ) : (
                         <span className="text-xs text-muted-foreground">—</span>
                       )}
                    </TableCell>
                    {/* Płatność — status zlecenia mówi o aucie, nie o pieniądzach.
                        Klik otwiera to samo okno co przy zakończeniu, więc pomyłkę w formie
                        albo dacie da się poprawić bez szukania w Operacjach kasy. */}
                    {orderView === 'completed' && (
                      <TableCell onClick={e => e.stopPropagation()}>
                        {(() => {
                          const gross = orderGrossAmount(order);
                          const entry = paidMap[order.id];
                          const paid = entry?.paid ?? 0;
                          const settled = gross > 0 && paid >= gross - 0.01;
                          const partial = paid > 0.01 && !settled;
                          const label = settled ? 'Opłacone' : partial ? 'Częściowo' : 'Nieopłacone';
                          const methods = (entry?.methods ?? [])
                            .map((m) => ({ gotowka: 'gotówka', karta: 'karta', blik: 'BLIK', przelew: 'przelew' } as any)[m] || m)
                            .join(' + ');
                          return (
                            <button
                              type="button"
                              className="text-left"
                              title="Kliknij, żeby poprawić kwotę, formę lub datę płatności"
                              onClick={() => setPaymentOrder(order)}
                            >
                              <Badge
                                variant={settled ? 'default' : partial ? 'secondary' : 'outline'}
                                className={`text-[10px] cursor-pointer ${!settled && !partial ? 'border-destructive text-destructive' : ''}`}
                              >
                                {label}
                              </Badge>
                              <span className="block text-[10px] text-muted-foreground">
                                {partial
                                  ? `${paid.toLocaleString('pl-PL', { minimumFractionDigits: 2 })} z ${gross.toLocaleString('pl-PL', { minimumFractionDigits: 2 })}`
                                  : methods || (settled ? '' : 'brak wpłat')}
                                {entry?.lastDate ? ` · ${entry.lastDate}` : ''}
                              </span>
                            </button>
                          );
                        })()}
                      </TableCell>
                    )}
                    {/* Dokumenty fiskalne — klik prowadzi do panelu paragonu z akcjami */}
                    <TableCell onClick={e => e.stopPropagation()}>
                      {(() => {
                        const badges = documentBadges?.get(order.id);
                        if (!badges) return <span className="text-xs text-muted-foreground">—</span>;
                        return (
                          <div className="flex flex-wrap gap-1">
                            {badges.hasReceipt && (
                              <button type="button" onClick={() => setFiscalOrder(order)} title="Pokaż paragon i akcje">
                                <Badge variant="secondary" className="text-[10px] cursor-pointer hover:bg-secondary/80">
                                  <Receipt className="h-2.5 w-2.5 mr-0.5" />
                                  Paragon{badges.receiptNumber ? ` ${badges.receiptNumber}` : ''}
                                </Badge>
                              </button>
                            )}
                            {badges.hasInvoice && (
                              <Badge variant="outline" className="text-[10px]">
                                <FileText className="h-2.5 w-2.5 mr-0.5" /> Faktura
                              </Badge>
                            )}
                            {badges.hasReturn && (
                              <Badge variant="outline" className="text-[10px] border-amber-500/60 text-amber-600">
                                Zwrot
                              </Badge>
                            )}
                            {badges.hasCorrection && (
                              <Badge variant="destructive" className="text-[10px]">Korekta</Badge>
                            )}
                          </div>
                        );
                      })()}
                    </TableCell>
                  </TableRow>
                  );
                })}
                {filteredOrders.length === 0 && !isLoading && (
                  <TableRow>
                    <TableCell colSpan={orderView === 'completed' ? 9 : 8} className="text-center py-8 text-muted-foreground">
                      {t('workshop.orders.noOrders')}
                      {/* Szukanie działa w obrębie wybranej zakładki — bez tej podpowiedzi
                          „nie ma zlecenia" znaczy tylko „nie ma go w tej zakładce". */}
                      {searchDebounced && (
                        <div className="mt-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setOrderView(orderView === 'active' ? 'completed' : 'active')}
                          >
                            Szukaj „{searchDebounced}" w {orderView === 'active' ? 'zakończonych' : 'aktywnych'}
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                )}
                {filteredOrders.length > 0 && (
                  <TableRow className="font-semibold bg-muted/50">
                     <TableCell colSpan={3}>{t('workshop.orders.sum')}</TableCell>
                     <TableCell className="text-right">
                       {totalSum.toLocaleString('pl-PL', { minimumFractionDigits: 2 })}
                     </TableCell>
                     <TableCell colSpan={orderView === 'completed' ? 5 : 4}></TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
          <WorkshopPager
            page={page}
            pageSize={pageSize}
            total={filteredOrders.length}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
          />
          {/* PERF C2: archiwum zakończonych jest stronicowane po 100 */}
          {orderView === 'completed' && !isLoading && orders.length >= completedLimit && (
            <div className="flex justify-center py-3">
              <Button variant="outline" size="sm" onClick={() => setCompletedLimit(l => l + 100)}>
                {t('workshop.orders.loadMore', { defaultValue: 'Załaduj kolejne 100' })}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Rezerwacje z portalu — druga tabela poniżej */}
      <WorkshopPortalBookings providerId={providerId} onSelectOrder={onSelectOrder} />
      <WorkshopNewOrderDialog
        open={showNewOrder}
        onOpenChange={setShowNewOrder}
        providerId={providerId}
      />

      {/* Client edit dialog */}
      <WorkshopEditClientDialog
        open={!!editClient}
        onOpenChange={(v) => { if (!v) setEditClient(null); }}
        client={editClient}
      />

      {/* Assign client to existing order */}
      {assignClientOrderId && (
        <WorkshopAssignClientDialog
          open={!!assignClientOrderId}
          onOpenChange={(v) => { if (!v) setAssignClientOrderId(null); }}
          providerId={providerId}
          orderId={assignClientOrderId}
          onAssigned={() => {
            setAssignClientOrderId(null);
            queryClient.invalidateQueries({ queryKey: ['workshop-orders'] });
          }}
        />
      )}

      {/* Vehicle edit dialog */}
      {editVehicle && (
        <VehicleEditDialog
          vehicle={editVehicle}
          onClose={() => setEditVehicle(null)}
        />
      )}

      {/* SMS dialog on status change */}
      {smsDialogOrder && (
        <WorkshopSmsDialog
          open={!!smsDialogOrder}
          onOpenChange={(v) => { if (!v) setSmsDialogOrder(null); }}
          order={smsDialogOrder}
          type={smsDialogType}
        />
      )}

      {/* Pack 1: payment form on order completion */}
      {paymentOrder && (
        <WorkshopPaymentDialog
          open={!!paymentOrder}
          onOpenChange={(v) => { if (!v) setPaymentOrder(null); }}
          providerId={providerId}
          orderId={paymentOrder.id}
          amount={orderGrossAmount(paymentOrder)}
          title={`Płatność — ${paymentOrder.order_number || ''}`}
          onPaid={() => {
            queryClient.invalidateQueries({ queryKey: ['workshop-orders-paid-map'] });
            queryClient.invalidateQueries({ queryKey: ['workshop-cash-data'] });
          }}
        />
      )}

      {/* Invoice dialog */}
      {invoiceOrder && (
        <Dialog open={!!invoiceOrder} onOpenChange={(v) => { if (!v) setInvoiceOrder(null); }}>
          <DialogContent className="max-w-6xl max-h-[95vh] overflow-y-auto p-0">
            <DialogTitle className="sr-only">{t('workshop.orders.issueInvoice')}</DialogTitle>
            <SimpleFreeInvoice
              onClose={() => setInvoiceOrder(null)}
              onSaved={async () => {
                const orderId = invoiceOrder?.id;
                setInvoiceOrder(null);
                toast.success(t('workshop.orders.invoiceIssued'));
                // Auto-status: set order to "Gotowy do odbioru" if not yet
                if (orderId) {
                  const lower = (invoiceOrder?.status_name || '').toLowerCase();
                  if (!lower.includes('gotow') && !lower.includes('zakończ') && !lower.includes('odbioru')) {
                    await (supabase as any)
                      .from('workshop_orders')
                      .update({ status_name: 'Gotowy do odbioru' })
                      .eq('id', orderId);
                  }
                  // Trigger ready-SMS popup if not yet sent
                  if (!invoiceOrder?.ready_notification_sent) {
                    setSmsDialogType('ready');
                    setSmsDialogOrder({ ...invoiceOrder, status_name: 'Gotowy do odbioru' });
                  }
                }
                queryClient.invalidateQueries({ queryKey: ['workshop-orders'] });
              }}
              prefillItems={invoiceItems}
              prefillBuyer={invoiceBuyer}
              prefillVehicleNotes={invoiceVehicleNotes}
              prefillOrderNotes={invoiceOrderNotes}
              prefillOrderNumber={invoiceOrder?.order_number}
              prefillWorkshopOrderId={invoiceOrder?.id}
            />
          </DialogContent>
        </Dialog>
      )}

      {/* Potwierdzenie wykonania usługi — ten sam podgląd co przy fakturze */}
      {confirmationData && (
        <InvoicePreviewModal
          open={!!confirmationData}
          onOpenChange={(v) => { if (!v) setConfirmationData(null); }}
          invoiceData={confirmationData}
          isLoggedIn
          mode="document"
          titleLabel="Potwierdzenie wykonania usługi"
        />
      )}

      {/* Paragon fiskalny — wydruk na drukarce tenanta (moduł fiskalny) */}
      <FiscalReceiptDialog
        open={!!fiscalOrder}
        onOpenChange={(open) => { if (!open) setFiscalOrder(null); }}
        providerId={providerId}
        order={fiscalOrder}
        onIssueInvoice={() => {
          // Skrót z paragonu powyżej 450 zł: firma potrzebuje pełnej faktury.
          const order = fiscalOrder;
          setFiscalOrder(null);
          if (order) openInvoiceForOrder(order, 'invoice');
        }}
      />

      {/* Existing invoice — duplicate prevention modal */}
      {existingInvoice && (
        <ExistingInvoiceModal
          open={!!existingInvoice}
          onOpenChange={(v) => { if (!v) { setExistingInvoice(null); setExistingInvoiceOrder(null); } }}
          invoice={existingInvoice}
          orderNumber={existingInvoiceOrder?.order_number}
          onChanged={() => queryClient.invalidateQueries({ queryKey: ['workshop-orders'] })}
        />
      )}
    </div>
  );
}

const fuelTypes = ['Benzyna', 'Diesel', 'LPG', 'Elektryczny', 'Hybryda', 'Benzyna+LPG', 'CNG'];

function VehicleEditDialog({ vehicle, onClose }: { vehicle: any; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [userId, setUserId] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    brand: vehicle.brand || '',
    model: vehicle.model || '',
    plate: vehicle.plate || '',
    vin: vehicle.vin || '',
    year: vehicle.year ? String(vehicle.year) : '',
    engine_capacity_cm3: vehicle.engine_capacity_cm3 ? String(vehicle.engine_capacity_cm3) : '',
    engine_power_kw: vehicle.engine_power_kw ? String(vehicle.engine_power_kw) : '',
    fuel_type: vehicle.fuel_type || '',
    color: vehicle.color || '',
  });

  const { credits, loading: lookupLoading, checkRegistration, checkVin } = useVehicleLookup(userId);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user) setUserId(data.user.id);
    });
  }, []);

  const set = (key: string, val: string) => setForm(p => ({ ...p, [key]: val }));

  const normalizeFuelType = (value?: string) => {
    const normalized = (value || '').trim().toLowerCase();
    if (!normalized) return '';
    if (normalized.includes('diesel') || normalized === 'olej napędowy') return 'Diesel';
    if (normalized.includes('benz') || normalized.includes('petrol')) return 'Benzyna';
    if (normalized.includes('lpg')) return 'LPG';
    if (normalized.includes('hyb')) return 'Hybryda';
    if (normalized.includes('elek')) return 'Elektryczny';
    if (normalized.includes('cng')) return 'CNG';
    return value;
  };

  const extractDigits = (value?: string | number) => {
    // UWAGA: proste usuniecie wszystkich nie-cyfr psulo wynik, bo jednostka tez
    // ma cyfre: "1197 cm3" dawalo 11973. Bierzemy PIERWSZA liczbe, wczesniej
    // sklejajac spacje w srodku liczby ("1 968 cm3" -> 1968).
    const tekst = String(value ?? '').replace(/(\d)[\s\u00A0](?=\d)/g, '$1');
    const m = tekst.match(/\d+(?:[.,]\d+)?/);
    if (!m) return null;
    const liczba = parseFloat(m[0].replace(',', '.'));
    if (!Number.isFinite(liczba)) return null;
    // Pojemnosc podana w litrach ("1.6") zamieniamy na cm3.
    return Math.round(liczba < 100 && m[0].match(/[.,]/) ? liczba * 1000 : liczba);
  };

  const applyLookup = (data: any) => {
    if (data.make) set('brand', data.make);
    if (data.model) set('model', data.model.replace(/\s+\d+\.\d+(\s+\S+)*$/, '').trim());
    if (data.registration_year) set('year', String(data.registration_year));
    // Rejestr zwraca VIN CZĘŚCIOWO ZAMASKOWANY („W0L**********8071"). Taki zapis jest
    // gorszy niż jego brak: nie da się po nim szukać ani sprawdzić auta, a wygląda jak
    // prawdziwy numer. Bierzemy tylko pełny VIN, resztę zostawiamy do wpisania z dowodu.
    const lookedUpVin = String(data.vin ?? '').toUpperCase().trim();
    if (lookedUpVin && !lookedUpVin.includes('*') && lookedUpVin.length >= 11) {
      set('vin', lookedUpVin);
    }
    if (data.color) set('color', data.color);

    const normalizedFuel = normalizeFuelType(data.fuel_type);
    if (normalizedFuel) set('fuel_type', normalizedFuel);

    const capacity = extractDigits(data.engine_size);
    if (capacity) set('engine_capacity_cm3', capacity);

    const power = extractDigits(data.engine_power_kw || data.power_kw || data.engine_power);
    if (power) set('engine_power_kw', power);
  };

  const handlePlateSearch = async () => {
    if (!form.plate.trim()) return;
    const data = await checkRegistration(form.plate.trim());
    if (data) applyLookup(data);
  };

  const handleVinSearch = async () => {
    if (!form.vin.trim()) return;
    const data = await checkVin(form.vin.trim());
    if (data) applyLookup(data);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await (supabase as any)
        .from('workshop_vehicles')
        .update({
          brand: form.brand || null,
          model: form.model || null,
          plate: form.plate || null,
          vin: form.vin || null,
          year: form.year ? parseInt(form.year, 10) : null,
          engine_capacity_cm3: form.engine_capacity_cm3 ? parseInt(form.engine_capacity_cm3, 10) : null,
          engine_power_kw: form.engine_power_kw ? parseInt(form.engine_power_kw, 10) : null,
          fuel_type: form.fuel_type || null,
          color: form.color || null,
        })
        .eq('id', vehicle.id);
      if (error) throw error;
      toast.success(t('workshop.orders.vehicleSaved'));
      await Promise.all([
        // FIX: klucze były camelCase (['workshopOrders']) — nie istnieją; realne
        // to kebab-case, więc po edycji pojazdu lista/karta się nie odświeżały.
        qc.invalidateQueries({ queryKey: ['workshop-orders'] }),
        qc.invalidateQueries({ queryKey: ['workshop-vehicles'] }),
      ]);
      onClose();
    } catch (e: any) {
      toast.error(e.message || t('common.saveError'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Car className="h-5 w-5" />
            {t('workshop.orders.editVehicle')}
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label className="text-xs">{t('workshop.orders.plateNumber')}</Label>
            <div className="flex gap-1">
              <Input onFocus={e => e.currentTarget.select()} value={form.plate} onChange={e => set('plate', e.target.value.toUpperCase())} placeholder="WW12345" />
              <Button variant="outline" size="icon" onClick={handlePlateSearch} disabled={lookupLoading || !form.plate.trim()} title={t('workshop.orders.searchByPlate')}>
                {lookupLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              </Button>
            </div>
          </div>
          <div>
            <Label className="text-xs">{t('workshop.orders.yearOfProduction')}</Label>
            <Input onFocus={e => e.currentTarget.select()} value={form.year} onChange={e => set('year', e.target.value)} placeholder="2020" />
          </div>
          <div className="col-span-2">
            <Label className="text-xs">{t('workshop.orders.vin')}</Label>
            <div className="flex gap-1">
              <Input onFocus={e => e.currentTarget.select()} value={form.vin} onChange={e => set('vin', e.target.value.toUpperCase())} placeholder="WVWZZZ3CZWE123456" />
              <Button variant="outline" size="icon" onClick={handleVinSearch} disabled={lookupLoading || !form.vin.trim()} title={t('workshop.orders.searchByVin')}>
                {lookupLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              </Button>
            </div>
          </div>
          <div>
            <Label className="text-xs">{t('workshop.orders.brand')}</Label>
            <Input onFocus={e => e.currentTarget.select()} value={form.brand} onChange={e => set('brand', e.target.value)} placeholder="BMW" />
          </div>
          <div>
            <Label className="text-xs">{t('workshop.orders.model')}</Label>
            <Input onFocus={e => e.currentTarget.select()} value={form.model} onChange={e => set('model', e.target.value)} placeholder="X5" />
          </div>
          <div>
            <Label className="text-xs">{t('workshop.orders.engineCapacityCc')}</Label>
            <Input onFocus={e => e.currentTarget.select()} value={form.engine_capacity_cm3} onChange={e => set('engine_capacity_cm3', e.target.value)} placeholder="1998" />
          </div>
          <div>
            <Label className="text-xs">{t('workshop.orders.enginePowerKw')}</Label>
            <Input onFocus={e => e.currentTarget.select()} value={form.engine_power_kw} onChange={e => set('engine_power_kw', e.target.value)} placeholder="150" />
          </div>
          <div>
            <Label className="text-xs">{t('workshop.orders.fuelType')}</Label>
            <Select value={form.fuel_type} onValueChange={v => set('fuel_type', v)}>
              <SelectTrigger><SelectValue placeholder={t('common.select')} /></SelectTrigger>
              <SelectContent>
                {fuelTypes.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">{t('workshop.orders.color')}</Label>
            <Input onFocus={e => e.currentTarget.select()} value={form.color} onChange={e => set('color', e.target.value)} placeholder={t('workshop.orders.colorPlaceholder')} />
          </div>
        </div>

        {credits !== null && (
          <p className="text-xs text-muted-foreground">{t('workshop.orders.remainingCredits', { count: credits.remaining_credits })}</p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t('common.cancel')}</Button>
          <Button onClick={handleSave} disabled={saving} className="gap-1">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
