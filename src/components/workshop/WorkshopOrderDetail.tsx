import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useWorkshopStatuses, useUpdateWorkshopOrder } from '@/hooks/useWorkshop';
import { WorkshopOrderBasicTab } from './tabs/WorkshopOrderBasicTab';
import { WorkshopOrderFilesTab } from './tabs/WorkshopOrderFilesTab';
import { WorkshopOrderTasksTab } from './tabs/WorkshopOrderTasksTab';
import { WorkshopScheduler } from './WorkshopScheduler';
import { WorkshopOrderSummaryTab } from './tabs/WorkshopOrderSummaryTab';
import { WorkshopSmsDialog } from './WorkshopSmsDialog';
import { WorkshopEditClientDialog } from './WorkshopEditClientDialog';
import { WorkshopAssignClientDialog } from './WorkshopAssignClientDialog';
import { WorkshopVehicleHoverCard } from './WorkshopVehicleHoverCard';
import { WorkshopVehicleEditDialog } from './WorkshopVehicleEditDialog';
import { WorkshopClientHoverCard } from './WorkshopClientHoverCard';
import { WorkshopEstimatePreviewDialog } from './WorkshopEstimatePreviewDialog';
import { WorkshopMechanicCardDialog } from './WorkshopMechanicCardDialog';
import { RidoPartsCartButton } from './parts/RidoPartsCartButton';
import { WorkshopAssignEmployeeDropdown } from './WorkshopAssignEmployeeDropdown';
import { WorkshopOrderEmployeeFindingsTab } from './tabs/WorkshopOrderEmployeeFindingsTab';
import { OrderHistoryTimeline } from './OrderHistoryTimeline';
import { OrderCallPanel } from './OrderCallPanel';
import { WorkshopStatusPicker } from './WorkshopStatusPicker';
import { supabase } from '@/integrations/supabase/client';
import {
  ArrowLeft, FileText, Send, Eye, Link2, MessageSquare, MoreVertical,
  Printer, Download, ClipboardList, Car, Users, CheckCircle, XCircle, Ban, AlertTriangle, Wrench, UserPlus, Search
} from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { translateWorkshopStatus } from '@/utils/workshopStatusStyle';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select';

interface Props {
  order: any;
  providerId: string;
  onBack: () => void;
}

const statusColors: Record<string, string> = {
  'Nowe zlecenie': 'bg-red-500 text-white',
  'Przyjęcie do serwisu': 'bg-orange-500 text-white',
  'Przydzielone': 'bg-gray-400 text-white',
  'Diagnoza': 'bg-gray-500 text-white',
  'Do wyceny': 'bg-yellow-500 text-black',
  'Oczekuje na akceptację': 'bg-yellow-500 text-black',
  'Wycena gotowa': 'bg-yellow-500 text-black',
  'Wycena wysłana': 'bg-orange-400 text-black',
  'Zaakceptowano': 'bg-green-500 text-white',
  'Akceptacja klienta': 'bg-green-500 text-white',
  'Zgoda na naprawę': 'bg-green-500 text-white',
  'W trakcie naprawy': 'bg-amber-400 text-black',
  'Dodatek do naprawy': 'bg-yellow-500 text-black',
  'Naprawione': 'bg-red-600 text-white',
  'Zadania wykonane': 'bg-green-500 text-white',
  'Gotowy do odbioru': 'bg-gray-500 text-white',
  'Zakończone': 'bg-gray-800 text-white',
};

export function WorkshopOrderDetail({ order, providerId, onBack }: Props) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data: statuses = [] } = useWorkshopStatuses(providerId);
  const updateOrder = useUpdateWorkshopOrder();
  const [activeTab, setActiveTab] = useState('tasks');
  const [smsOpen, setSmsOpen] = useState(false);
  const [smsType, setSmsType] = useState<'reception' | 'quote' | 'requote' | 'ready'>('reception');

  // Wspólny handler zmiany statusu z pickera: optimistic patch cache (badge zmienia
  // się NATYCHMIAST w detalu i na liście) + invalidacja (koniec z ręcznym odświeżaniem).
  // Picker robi własny UPDATE w DB; tu tylko synchronizujemy widok bez czekania.
  const handleStatusChanged = (name: string) => {
    queryClient.setQueriesData({ queryKey: ['workshop-orders'] }, (old: any) => {
      if (!Array.isArray(old)) return old;
      return old.map((o: any) => o.id === order.id ? { ...o, status_name: name, has_unread_notes: true } : o);
    });
    // prop fallback (gdy detal nie pochodzi z cache listy)
    order.status_name = name;
    order.has_unread_notes = true;
    queryClient.invalidateQueries({ queryKey: ['workshop-orders'] });

    const lower = (name || '').toLowerCase();
    if (lower.includes('gotow') || lower.includes('odbioru')) {
      setSmsType('ready');
      setSmsOpen(true);
    } else if (lower.includes('wycena wysłana') || lower.includes('kosztorys')) {
      setSmsType('quote');
      setSmsOpen(true);
    }
  };
  const [editClientOpen, setEditClientOpen] = useState(false);
  const [pickClientOpen, setPickClientOpen] = useState(false);
  const [editVehicleOpen, setEditVehicleOpen] = useState(false);
  const [estimatePreviewOpen, setEstimatePreviewOpen] = useState(false);
  const [mechanicCardOpen, setMechanicCardOpen] = useState(false);
  const clientName = order.client
    ? order.client.client_type === 'company'
      ? order.client.company_name
      : `${order.client.first_name || ''} ${order.client.last_name || ''}`.trim()
    : '';

  const vehicleName = order.vehicle
    ? `${order.vehicle.brand || ''} ${order.vehicle.model || ''} ${order.vehicle.plate || ''}`.trim()
    : '';

  const changeStatus = async (newStatus: string) => {
    const note = window.prompt(
      t('workshop.orderDetail.statusChangePrompt', { status: translateWorkshopStatus(newStatus, t) }),
      ''
    );
    if (note === null) return; // Anulowano
    await updateOrder.mutateAsync({ id: order.id, status_name: newStatus });
    if (note.trim()) {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        await (supabase.from('workshop_order_events') as any).insert({
          order_id: order.id,
          provider_id: providerId,
          event_type: 'note',
          note: note.trim(),
          actor_user_id: user?.id || null,
          actor_name: user?.user_metadata?.full_name || user?.email || null,
          actor_role: 'admin',
          to_status: newStatus,
        });
        await (supabase.from('workshop_orders') as any)
          .update({ has_unread_notes: true })
          .eq('id', order.id);
      } catch (e) { console.error('Note insert error:', e); }
    }
    toast.success(t('workshop.orderDetail.statusChangedTo', { status: translateWorkshopStatus(newStatus, t) }));

    // If the new status matches a station (Myjnia, Wulkanizacja, Geometria, ...),
    // attach the order to it and create assignments so the station's
    // employees immediately see the order in their "Moje zlecenia".
    try {
      const { applyStationHandover } = await import('@/utils/workshopStationHandover');
      // Strip workflow suffixes like " — realizacja" / " — gotowe" before matching to a station.
      const baseName = newStatus.replace(/\s*[—-]\s*(realizacja|gotowe|w trakcie|w realizacji)\s*$/i, '').trim();
      await applyStationHandover({ orderId: order.id, providerId, newStatus: baseName });
    } catch {/* best-effort */}

    // Auto-open SMS dialog based on status context
    const lower = newStatus.toLowerCase();
    if (lower.includes('gotow') || lower.includes('zakończ') || lower.includes('odbioru')) {
      setSmsType('ready');
      setSmsOpen(true);
    } else if (lower.includes('wycena wysłana') || lower.includes('kosztorys')) {
      setSmsType('quote');
      setSmsOpen(true);
    }
  };

  const markReceptionSigned = async () => {
    const newVal = !order.client_acceptance_confirmed;
    await updateOrder.mutateAsync({
      id: order.id,
      client_acceptance_confirmed: newVal,
      ...(newVal ? { status_name: 'Przyjęcie do serwisu' } : {}),
    });
    order.client_acceptance_confirmed = newVal;
    if (newVal) order.status_name = 'Przyjęcie do serwisu';
    toast.success(newVal
      ? t('workshop.orderDetail.protocolSigned', { status: translateWorkshopStatus('Przyjęcie do serwisu', t) })
      : t('workshop.orderDetail.markedUnsigned'));
  };


  const openSms = (type: 'reception' | 'quote' | 'requote' | 'ready') => {
    setSmsType(type);
    setSmsOpen(true);
  };

  const copyClientLink = () => {
    if (order.client_code) {
      navigator.clipboard.writeText(`${window.location.origin}/warsztat/klient/${order.client_code}`);
      toast.success(t('workshop.orderDetail.orderLinkCopied'));
    }
  };

  const isCompleted = order.status_name === 'Zakończone';

  return (
    <div className="space-y-4">
      {isCompleted && (
        <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-3 text-sm text-amber-900 dark:text-amber-100">
          <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <div>
            <strong>{t('workshop.orderDetail.completedWarningTitle')}</strong> {t('workshop.orderDetail.completedWarningBody')}
          </div>
        </div>
      )}
      {/* Header breadcrumb - desktop */}
      <div className="hidden md:flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 text-sm">
          <button onClick={onBack} className="text-primary hover:underline flex items-center gap-1">
            <ArrowLeft className="h-4 w-4" /> {t('workshop.orderDetail.orders')}
          </button>
          <span className="text-muted-foreground">·</span>
          <span className="font-semibold">{order.order_number}</span>
          <span className="text-muted-foreground">·</span>
          {order.created_at && (
            <span className="text-muted-foreground">{format(new Date(order.created_at), 'dd/MM/yyyy')}</span>
          )}
          {clientName ? (
            <>
              <span className="text-muted-foreground">·</span>
              <WorkshopClientHoverCard client={order.client} onEdit={() => setEditClientOpen(true)}>
                <button
                  type="button"
                  onClick={() => setEditClientOpen(true)}
                  className="flex items-center gap-1 cursor-pointer hover:text-primary transition-colors"
                >
                  <Users className="h-3.5 w-3.5" /> {clientName}
                </button>
              </WorkshopClientHoverCard>
              <button
                type="button"
                onClick={() => setPickClientOpen(true)}
                title={t('workshop.orderDetail.changeClientTitle')}
                className="flex items-center gap-1 px-1.5 py-0.5 rounded border border-dashed text-xs text-muted-foreground hover:text-primary hover:border-primary transition-colors"
              >
                <Search className="h-3 w-3" /> {t('workshop.orderDetail.change')}
              </button>
            </>
          ) : (
            <>
              <span className="text-muted-foreground">·</span>
              <button
                type="button"
                onClick={() => setPickClientOpen(true)}
                className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-500/15 text-green-700 hover:bg-green-500 hover:text-white transition-colors text-xs font-medium"
              >
                <UserPlus className="h-3.5 w-3.5" /> {t('workshop.orderDetail.addClient')}
              </button>
            </>
          )}
          {vehicleName && (
            <>
              <span className="text-muted-foreground">·</span>
              <WorkshopVehicleHoverCard vehicle={order.vehicle} onEdit={() => setEditVehicleOpen(true)}>
                <button
                  type="button"
                  onClick={() => setEditVehicleOpen(true)}
                  className="flex items-center gap-1 cursor-pointer hover:text-primary transition-colors"
                >
                  <Car className="h-3.5 w-3.5" /> {vehicleName}
                </button>
              </WorkshopVehicleHoverCard>
            </>
          )}
        </div>

        <div className="flex items-center gap-2">
          <WorkshopStatusPicker
            providerId={providerId}
            orderId={order.id}
            currentStatus={order.status_name}
            hasUnreadNotes={order.has_unread_notes}
            onChanged={handleStatusChanged}
          />

          <Button
            variant="outline"
            size="sm"
            className="gap-1"
            onClick={() => {
              if (order.client_code) {
                window.open(`/warsztat/klient/${order.client_code}?admin=1`, '_blank');
              } else {
                toast.info(t('workshop.orderDetail.noClientCode'));
              }
            }}
          >
            <FileText className="h-4 w-4" /> {t('workshop.orderDetail.orderCard')}
          </Button>

          <Button
            variant="outline"
            size="sm"
            className="gap-1"
            onClick={() => setMechanicCardOpen(true)}
            title={t('workshop.orderDetail.mechanicCardTitle')}
          >
            <Wrench className="h-4 w-4" /> {t('workshop.orderDetail.mechanicCard')}
          </Button>

          {/* Action icons with dropdowns */}
          <div className="flex items-center gap-1">
            {/* Protokół przyjęcia */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost" size="icon" title={t('workshop.orderDetail.receptionProtocol')}
                  className={order.client_acceptance_confirmed ? 'text-green-500' : 'text-amber-500'}
                >
                  <Eye className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-52">
                <DropdownMenuItem onClick={() => toast.info(t('workshop.orderDetail.protocolPreviewToast'))}>
                  <Eye className="h-4 w-4 mr-2" /> {t('workshop.orderDetail.preview')}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => toast.info(t('workshop.orderDetail.protocolPrinting'))}>
                  <Printer className="h-4 w-4 mr-2" /> {t('workshop.orderDetail.print')}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => toast.info(t('workshop.orderDetail.protocolDownloading'))}>
                  <Download className="h-4 w-4 mr-2" /> {t('workshop.orderDetail.download')}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={markReceptionSigned}>
                  {order.client_acceptance_confirmed
                    ? <XCircle className="h-4 w-4 mr-2" />
                    : <CheckCircle className="h-4 w-4 mr-2" />}
                  {order.client_acceptance_confirmed ? t('workshop.orderDetail.markAsUnsigned') : t('workshop.orderDetail.markAsSigned')}
                </DropdownMenuItem>
                <DropdownMenuItem className="text-destructive" onClick={() => toast.info(t('workshop.orderDetail.protocolDisabled'))}>
                  <Ban className="h-4 w-4 mr-2" /> {t('workshop.orderDetail.disable')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Wycena / Kosztorys */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost" size="icon" title={t('workshop.orderDetail.estimate')}
                  className={`relative ${order.quote_accepted ? 'text-green-500' : 'text-amber-500'}`}
                >
                  <ClipboardList className="h-4 w-4" />
                  {order.estimate_changed_after_send && (
                    <AlertTriangle className="h-3 w-3 text-destructive absolute -top-0.5 -right-0.5" />
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-52">
                {order.estimate_changed_after_send && (
                  <div className="px-3 py-2 text-xs text-destructive bg-destructive/10 border-b">
                    {t('workshop.orderDetail.estimateChangedWarning')}
                  </div>
                )}
                <DropdownMenuItem onClick={() => openSms('quote')}>
                  <Send className="h-4 w-4 mr-2" /> {t('workshop.orderDetail.sendEstimateSms')}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setEstimatePreviewOpen(true)}>
                  <Eye className="h-4 w-4 mr-2" /> {t('workshop.orderDetail.preview')}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => toast.info(t('workshop.orderDetail.estimatePrinting'))}>
                  <Printer className="h-4 w-4 mr-2" /> {t('workshop.orderDetail.print')}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => toast.info(t('workshop.orderDetail.estimateDownloading'))}>
                  <Download className="h-4 w-4 mr-2" /> {t('workshop.orderDetail.download')}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => {
                  const newVal = !order.quote_accepted;
                  updateOrder.mutateAsync({ id: order.id, quote_accepted: newVal, ...(newVal ? { status_name: 'Akceptacja klienta' } : {}) });
                  toast.success(newVal
                    ? t('workshop.orderDetail.quoteAccepted', { status: translateWorkshopStatus('Akceptacja klienta', t) })
                    : t('workshop.orderDetail.markedUnsigned'));
                }}>
                  {order.quote_accepted
                    ? <XCircle className="h-4 w-4 mr-2" />
                    : <CheckCircle className="h-4 w-4 mr-2" />}
                  {order.quote_accepted ? t('workshop.orderDetail.markAsUnsigned') : t('workshop.orderDetail.markAsSigned')}
                </DropdownMenuItem>
                <DropdownMenuItem className="text-destructive" onClick={() => toast.info(t('workshop.orderDetail.estimateDisabled'))}>
                  <Ban className="h-4 w-4 mr-2" /> {t('workshop.orderDetail.disable')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Gotowość / Powiadomienie */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost" size="icon" title={t('workshop.orderDetail.readinessConfirmed')}
                  className={order.ready_notification_sent ? 'text-green-500' : 'text-amber-500'}
                >
                  <Send className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-52">
                <DropdownMenuItem onClick={() => openSms('ready')}>
                  <Send className="h-4 w-4 mr-2" /> {t('workshop.orderDetail.sendNotification')}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => toast.info(t('workshop.orderDetail.notificationPreview'))}>
                  <Eye className="h-4 w-4 mr-2" /> {t('workshop.orderDetail.preview')}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => {
                  updateOrder.mutateAsync({ id: order.id, ready_notification_sent: !order.ready_notification_sent });
                  toast.success(order.ready_notification_sent ? t('workshop.orderDetail.markedNotSent') : t('workshop.orderDetail.markedSent'));
                }}>
                  <XCircle className="h-4 w-4 mr-2" /> {order.ready_notification_sent ? t('workshop.orderDetail.markAsNotSent') : t('workshop.orderDetail.markAsSent')}
                </DropdownMenuItem>
                <DropdownMenuItem className="text-destructive" onClick={() => toast.info(t('workshop.orderDetail.disabledToast'))}>
                  <Ban className="h-4 w-4 mr-2" /> {t('workshop.orderDetail.disable')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Button variant="ghost" size="icon" title={t('workshop.orderDetail.sendSms')} onClick={() => {
              // Auto-detect SMS type based on order state.
              // hasQuoteItems liczone z SUMY POZYCJI, bo order.total_gross bywa
              // nieaktualne/null (sync tylko z zakładki tasków) → wcześniej po podpisie
              // recepcji gałąź 'quote' przepadała i leciało 'ready' (zakończenie).
              const itemsGross = (order.items || []).reduce((s: number, i: any) => s + (i.total_gross || 0), 0);
              const hasQuoteItems = (order.total_gross || 0) > 0 || itemsGross > 0;
              const protocolSigned = order.client_acceptance_confirmed;
              // DODATEK / zmiana wyceny po wysłaniu → PONOWNA WYCENA do akceptacji.
              // Musi być sprawdzane PRZED gałęzią quote_accepted (która błędnie wybierała
              // 'ready' = zakończenie naprawy, mimo że doszedł dodatek do akceptacji).
              const needsReQuote = (order.estimate_changed_after_send || order.status_name === 'Dodatek do naprawy');
              if (needsReQuote && hasQuoteItems) {
                openSms('requote');
              } else if (protocolSigned && hasQuoteItems && !order.quote_accepted) {
                openSms('quote');
              } else if (order.quote_accepted || order.status_name === 'Gotowy do odbioru' || order.status_name === 'Zakończone') {
                openSms('ready');
              } else if (protocolSigned) {
                openSms('quote');
              } else {
                openSms('reception');
              }
            }}>
              <MessageSquare className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" title={t('workshop.orderDetail.orderLink')} onClick={copyClientLink}>
              <Link2 className="h-4 w-4" />
            </Button>
            <RidoPartsCartButton providerId={providerId} />
            <WorkshopAssignEmployeeDropdown
              orderId={order.id}
              providerId={providerId}
              onAssignmentChanged={(assigned) => {
                if (assigned && ['Nowe zlecenie', 'Przyjęcie do serwisu', 'Do wyceny', ''].includes(order.status_name || '')) {
                  order.status_name = 'Przydzielone';
                }
              }}
            />
          </div>


          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon"><MoreVertical className="h-4 w-4" /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem><Eye className="h-4 w-4 mr-2" /> {t('workshop.orderDetail.preview')}</DropdownMenuItem>
              <DropdownMenuItem><Printer className="h-4 w-4 mr-2" /> {t('workshop.orderDetail.print')}</DropdownMenuItem>
              <DropdownMenuItem><Download className="h-4 w-4 mr-2" /> {t('workshop.orderDetail.download')}</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Header - mobile */}
      <div className="md:hidden space-y-3">
        <div className="flex items-center justify-between">
          <span className="font-bold text-lg">{order.order_number}</span>
          <WorkshopStatusPicker
            providerId={providerId}
            orderId={order.id}
            currentStatus={order.status_name}
            hasUnreadNotes={order.has_unread_notes}
            onChanged={handleStatusChanged}
            size="xs"
          />
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {order.created_at && <span>{format(new Date(order.created_at), 'dd.MM.yyyy')}</span>}
          {clientName ? (
            <button type="button" onClick={() => setEditClientOpen(true)} className="flex items-center gap-1 hover:text-primary">
              <Users className="h-3 w-3" /> {clientName}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setPickClientOpen(true)}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-500/15 text-green-700 hover:bg-green-500 hover:text-white transition-colors text-[11px] font-medium"
            >
              <UserPlus className="h-3 w-3" /> Dodaj klienta
            </button>
          )}
          {vehicleName && <span className="flex items-center gap-1"><Car className="h-3 w-3" /> {vehicleName}</span>}
        </div>
        <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide">
          <Button variant="outline" size="sm" className="h-7 text-xs gap-1 shrink-0" onClick={() => {
            if (order.client_code) window.open(`/warsztat/klient/${order.client_code}?admin=1`, '_blank');
          }}>
            <FileText className="h-3.5 w-3.5" /> {t('workshop.orderDetail.card')}
          </Button>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 shrink-0" onClick={() => openSms('reception')}>
            <MessageSquare className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 shrink-0" onClick={copyClientLink}>
            <Link2 className="h-3.5 w-3.5" />
          </Button>
          <div className="shrink-0"><WorkshopAssignEmployeeDropdown orderId={order.id} providerId={providerId} onAssignmentChanged={(assigned) => {
            if (assigned && ['Nowe zlecenie', 'Przyjęcie do serwisu', 'Do wyceny', ''].includes(order.status_name || '')) order.status_name = 'Przydzielone';
          }} /></div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0 shrink-0"><MoreVertical className="h-3.5 w-3.5" /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => toast.info(t('workshop.orderDetail.protocolPreviewToast'))}>
                <Eye className="h-4 w-4 mr-2" /> {t('workshop.orderDetail.receptionProtocol')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setEstimatePreviewOpen(true)}>
                <ClipboardList className="h-4 w-4 mr-2" /> {t('workshop.orderDetail.estimate')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => openSms('ready')}>
                <Send className="h-4 w-4 mr-2" /> {t('workshop.orderDetail.notification')}
              </DropdownMenuItem>
              <DropdownMenuItem><Printer className="h-4 w-4 mr-2" /> {t('workshop.orderDetail.print')}</DropdownMenuItem>
              <DropdownMenuItem><Download className="h-4 w-4 mr-2" /> {t('workshop.orderDetail.download')}</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-transparent w-full justify-start gap-1.5 h-auto p-0 overflow-x-auto scrollbar-hide flex-nowrap mb-4">
          {[
            { value: 'tasks', labelKey: 'workshop.orderDetail.tabTasks' },
            { value: 'basic', labelKey: 'workshop.orderDetail.tabBasic' },
            { value: 'findings', labelKey: 'workshop.orderDetail.tabFindings' },
            { value: 'summary', labelKey: 'workshop.orderDetail.tabSummary' },
            { value: 'schedule', labelKey: 'workshop.orderDetail.tabSchedule' },
            { value: 'files', labelKey: 'workshop.orderDetail.tabFiles' },
            { value: 'repair-data', labelKey: 'workshop.orderDetail.tabRepairData' },
            { value: 'call', label: 'Rozmowa telefoniczna' },
          ].map((tab: any) => (
            <TabsTrigger
              key={tab.value}
              value={tab.value}
              className="px-4 md:px-5 py-2 rounded-full text-xs md:text-sm font-medium shrink-0 transition-all duration-200 data-[state=active]:text-white data-[state=active]:shadow-sm data-[state=inactive]:text-foreground/70 data-[state=inactive]:bg-transparent data-[state=inactive]:hover:bg-[#F5C842] data-[state=inactive]:hover:text-[#1a1a1a]"
              style={activeTab === tab.value ? { backgroundColor: 'var(--nav-bar-color, #6C3CF0)' } : undefined}
            >
              {tab.label || t(tab.labelKey)}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="basic">
          <WorkshopOrderBasicTab order={order} providerId={providerId} />
        </TabsContent>
        <TabsContent value="tasks">
          <WorkshopOrderTasksTab order={order} providerId={providerId} />
        </TabsContent>
        <TabsContent value="findings">
          <OrderHistoryTimeline orderId={order.id} providerId={providerId} />
        </TabsContent>
        <TabsContent value="summary">
          <WorkshopOrderSummaryTab order={order} />
        </TabsContent>
        <TabsContent value="schedule">
          <WorkshopScheduler providerId={providerId} onBack={() => {}} title={t('workshop.orderDetail.schedulerTitle', { number: order.order_number || '' })} focusOrderId={order.id} />
        </TabsContent>
        <TabsContent value="files">
          <WorkshopOrderFilesTab order={order} />
        </TabsContent>
        <TabsContent value="repair-data">
          <div className="text-center py-12 text-muted-foreground">
            {t('workshop.orderDetail.repairDataComingSoon')}
          </div>
        </TabsContent>
        <TabsContent value="call">
          <OrderCallPanel orderId={order.id} />
        </TabsContent>
      </Tabs>

      {/* SMS Dialog */}
      <WorkshopSmsDialog
        open={smsOpen}
        onOpenChange={setSmsOpen}
        order={order}
        type={smsType}
      />

      {/* Edit Client Dialog */}
      <WorkshopEditClientDialog
        open={editClientOpen}
        onOpenChange={setEditClientOpen}
        client={order.client}
      />
      <WorkshopAssignClientDialog
        open={pickClientOpen}
        onOpenChange={setPickClientOpen}
        providerId={providerId}
        orderId={order.id}
      />
      {/* Vehicle Edit Dialog */}
      <WorkshopVehicleEditDialog
        vehicle={order.vehicle}
        open={editVehicleOpen}
        onOpenChange={setEditVehicleOpen}
      />
      {/* Estimate Preview Dialog */}
      <WorkshopEstimatePreviewDialog
        open={estimatePreviewOpen}
        onOpenChange={setEstimatePreviewOpen}
        order={order}
      />
      <WorkshopMechanicCardDialog
        open={mechanicCardOpen}
        onOpenChange={setMechanicCardOpen}
        order={order}
      />
    </div>
  );
}
