import { useState, useMemo, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
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
  useWorkshopOrders, useWorkshopStatuses, useUpdateWorkshopOrder,
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
import { generateInvoiceHtml } from '@/utils/invoiceHtmlGenerator';
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
import { getStatusStyle, translateWorkshopStatus } from '@/utils/workshopStatusStyle';
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
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [showNewOrder, setShowNewOrder] = useState(false);
  const [search, setSearch] = useState('');
  const [orderView, setOrderView] = useState<'active' | 'completed'>('active');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  // Pack 1: date range for the "Zakończone" view + payment modal on completion.
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [paymentOrder, setPaymentOrder] = useState<any | null>(null);
  const { data: financeSettings } = useWorkshopFinanceSettings(providerId);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [statusDropdownId, setStatusDropdownId] = useState<string | null>(null);
  const [editClient, setEditClient] = useState<any>(null);
  const [editVehicle, setEditVehicle] = useState<any>(null);
  const [smsDialogOrder, setSmsDialogOrder] = useState<any>(null);
  const [smsDialogType, setSmsDialogType] = useState<'reception' | 'quote' | 'ready'>('ready');
  const [invoiceOrder, setInvoiceOrder] = useState<any>(null);
  const [invoiceItems, setInvoiceItems] = useState<any[]>([]);
  const [invoiceBuyer, setInvoiceBuyer] = useState<any>(null);
  const [invoiceNotes, setInvoiceNotes] = useState('');
  const [existingInvoice, setExistingInvoice] = useState<any>(null);
  const [existingInvoiceOrder, setExistingInvoiceOrder] = useState<any>(null);
  const [assignClientOrderId, setAssignClientOrderId] = useState<string | null>(null);

  const { data: statuses = [] } = useWorkshopStatuses(providerId);
  const { data: orders = [], isLoading } = useWorkshopOrders(providerId, {
    search: search || undefined,
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
        () => {
          queryClient.invalidateQueries({ queryKey: ['workshop-orders'] });
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'workshop_order_items' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['workshop-orders'] });
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
    // else creation date.
    if (dateFrom || dateTo) {
      const from = dateFrom ? new Date(dateFrom) : null;
      const to = dateTo ? new Date(dateTo + 'T23:59:59') : null;
      filtered = filtered.filter((o: any) => {
        const basis = o.completed_at || o.created_at;
        if (!basis) return false;
        const d = new Date(basis);
        return (!from || d >= from) && (!to || d <= to);
      });
    }
    return filtered;
  }, [orders, orderView, statusFilter, dateFrom, dateTo]);

  useEffect(() => {
    setSelectedIds(new Set());
  }, [orderView]);

  const totalSum = filteredOrders.reduce((s: number, o: any) => s + orderGrossAmount(o), 0);

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
    // Refresh in background to get any server-side derived fields
    queryClient.invalidateQueries({ queryKey: ['workshop-orders'] });
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

      const prefillItems = (orderItems || []).map((item: any) => ({
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

      const vehicleDesc = order.vehicle
        ? `Marka: ${order.vehicle.brand || ''}, Model: ${order.vehicle.model || ''}, Nr rej: ${order.vehicle.plate || ''}, VIN: ${order.vehicle.vin || ''}`
        : '';
      const notes = [vehicleDesc, order.order_number ? `Do zlecenia: ${order.order_number}` : ''].filter(Boolean).join('\n');

      setInvoiceItems(prefillItems);
      setInvoiceBuyer(buyer);
      setInvoiceNotes(notes);
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

      const html = generateInvoiceHtml(invoiceData);
      const printWindow = window.open('', '_blank');
      if (!printWindow) {
        toast.error(t('workshop.orders.popupBlocked'));
        return;
      }
      printWindow.document.write(html);
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => printWindow.print(), 400);
      toast.success(t('workshop.orders.confirmationGenerated'));
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
            if (!confirm(t('workshop.orders.confirmDelete', { count }))) return;
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

        {selectedIds.size === 1 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1">
                <FileText className="h-4 w-4" /> {t('workshop.orders.issue')} <ChevronDown className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={() => {
                const order = orders.find((o: any) => selectedIds.has(o.id));
                if (order) openInvoiceForOrder(order, 'invoice');
              }}>
                <FileText className="h-4 w-4 mr-2" /> {t('workshop.orders.invoice')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => {
                const order = orders.find((o: any) => selectedIds.has(o.id));
                if (order) openInvoiceForOrder(order, 'receipt');
              }}>
                <Receipt className="h-4 w-4 mr-2" /> {t('workshop.orders.fiscalReceipt')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => {
                const order = orders.find((o: any) => selectedIds.has(o.id));
                if (order) generateServiceConfirmation(order);
              }}>
                <ClipboardCheck className="h-4 w-4 mr-2" /> {t('workshop.orders.serviceConfirmation')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        <div className="flex-1" />

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-8 w-[180px]">
            <SelectValue placeholder={t('workshop.orders.allStatuses')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('workshop.orders.allStatuses')}</SelectItem>
            {statuses.filter((s: any) => orderView === 'completed' ? s.name === 'Zakończone' : s.name !== 'Zakończone').map((s: any) => (
              <SelectItem key={s.id} value={s.name}>
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                  {translateWorkshopStatus(s.name, t)}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {orderView === 'completed' && (
          <div className="flex items-center gap-1">
            <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="h-8 w-[150px]" title="Data od" />
            <span className="text-muted-foreground">—</span>
            <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="h-8 w-[150px]" title="Data do" />
            {(dateFrom || dateTo) && (
              <Button variant="ghost" size="sm" className="h-8 px-2" onClick={() => { setDateFrom(''); setDateTo(''); }}>×</Button>
            )}
          </div>
        )}

        <div className="relative w-full sm:w-auto">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
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
          <div className="text-center py-8 text-muted-foreground">{t('workshop.orders.noOrders')}</div>
        ) : (
          <>
            {filteredOrders.map((order: any) => {
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
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredOrders.map((order: any) => {
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
                  </TableRow>
                  );
                })}
                {filteredOrders.length === 0 && !isLoading && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      {t('workshop.orders.noOrders')}
                    </TableCell>
                  </TableRow>
                )}
                {filteredOrders.length > 0 && (
                  <TableRow className="font-semibold bg-muted/50">
                     <TableCell colSpan={3}>{t('workshop.orders.sum')}</TableCell>
                     <TableCell className="text-right">
                       {totalSum.toLocaleString('pl-PL', { minimumFractionDigits: 2 })}
                     </TableCell>
                     <TableCell colSpan={4}></TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
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
              prefillNotes={invoiceNotes}
              prefillOrderNumber={invoiceOrder?.order_number}
              prefillWorkshopOrderId={invoiceOrder?.id}
            />
          </DialogContent>
        </Dialog>
      )}

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
    if (value === null || value === undefined) return '';
    const text = String(value);
    const match = text.match(/\d+/g);
    return match ? match.join('') : '';
  };

  const applyLookup = (data: any) => {
    if (data.make) set('brand', data.make);
    if (data.model) set('model', data.model.replace(/\s+\d+\.\d+(\s+\S+)*$/, '').trim());
    if (data.registration_year) set('year', String(data.registration_year));
    if (data.vin) set('vin', String(data.vin).toUpperCase());
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
        qc.invalidateQueries({ queryKey: ['workshopOrders'] }),
        qc.invalidateQueries({ queryKey: ['workshopVehicles'] }),
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
              <Input value={form.plate} onChange={e => set('plate', e.target.value.toUpperCase())} placeholder="WW12345" />
              <Button variant="outline" size="icon" onClick={handlePlateSearch} disabled={lookupLoading || !form.plate.trim()} title={t('workshop.orders.searchByPlate')}>
                {lookupLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              </Button>
            </div>
          </div>
          <div>
            <Label className="text-xs">{t('workshop.orders.yearOfProduction')}</Label>
            <Input value={form.year} onChange={e => set('year', e.target.value)} placeholder="2020" />
          </div>
          <div className="col-span-2">
            <Label className="text-xs">{t('workshop.orders.vin')}</Label>
            <div className="flex gap-1">
              <Input value={form.vin} onChange={e => set('vin', e.target.value.toUpperCase())} placeholder="WVWZZZ3CZWE123456" />
              <Button variant="outline" size="icon" onClick={handleVinSearch} disabled={lookupLoading || !form.vin.trim()} title={t('workshop.orders.searchByVin')}>
                {lookupLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              </Button>
            </div>
          </div>
          <div>
            <Label className="text-xs">{t('workshop.orders.brand')}</Label>
            <Input value={form.brand} onChange={e => set('brand', e.target.value)} placeholder="BMW" />
          </div>
          <div>
            <Label className="text-xs">{t('workshop.orders.model')}</Label>
            <Input value={form.model} onChange={e => set('model', e.target.value)} placeholder="X5" />
          </div>
          <div>
            <Label className="text-xs">{t('workshop.orders.engineCapacityCc')}</Label>
            <Input value={form.engine_capacity_cm3} onChange={e => set('engine_capacity_cm3', e.target.value)} placeholder="1998" />
          </div>
          <div>
            <Label className="text-xs">{t('workshop.orders.enginePowerKw')}</Label>
            <Input value={form.engine_power_kw} onChange={e => set('engine_power_kw', e.target.value)} placeholder="150" />
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
            <Input value={form.color} onChange={e => set('color', e.target.value)} placeholder={t('workshop.orders.colorPlaceholder')} />
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
