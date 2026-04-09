import { useState } from 'react';
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
import { WorkshopVehicleHoverCard } from './WorkshopVehicleHoverCard';
import { WorkshopClientHoverCard } from './WorkshopClientHoverCard';
import { RidoPartsCartButton } from './parts/RidoPartsCartButton';
import {
  ArrowLeft, FileText, Send, Eye, Link2, MessageSquare, MoreVertical,
  Printer, Download, ClipboardList, Car, Users, CheckCircle, XCircle, Ban, AlertTriangle
} from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
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
  'Przyjęcie do serwisu': 'bg-red-500 text-white',
  'Nowe zlecenie': 'bg-amber-400 text-black',
  'Akceptacja klienta': 'bg-amber-400 text-black',
  'W trakcie naprawy': 'bg-amber-400 text-black',
  'Zadania wykonane': 'bg-green-500 text-white',
  'Gotowy do odbioru': 'bg-green-500 text-white',
  'Zakończone': 'bg-gray-800 text-white',
};

export function WorkshopOrderDetail({ order, providerId, onBack }: Props) {
  const { data: statuses = [] } = useWorkshopStatuses(providerId);
  const updateOrder = useUpdateWorkshopOrder();
  const [activeTab, setActiveTab] = useState('tasks');
  const [smsOpen, setSmsOpen] = useState(false);
  const [smsType, setSmsType] = useState<'reception' | 'quote' | 'ready'>('reception');
  const [editClientOpen, setEditClientOpen] = useState(false);

  const clientName = order.client
    ? order.client.client_type === 'company'
      ? order.client.company_name
      : `${order.client.first_name || ''} ${order.client.last_name || ''}`.trim()
    : '';

  const vehicleName = order.vehicle
    ? `${order.vehicle.brand || ''} ${order.vehicle.model || ''} ${order.vehicle.plate || ''}`.trim()
    : '';

  const changeStatus = async (newStatus: string) => {
    await updateOrder.mutateAsync({ id: order.id, status_name: newStatus });
    toast.success(`Status zmieniony na: ${newStatus}`);
    // Auto-open SMS dialog for notification statuses
    if (newStatus === 'Gotowy do odbioru' || newStatus === 'Zakończone') {
      setSmsType('ready');
      setSmsOpen(true);
    }
  };

  const openSms = (type: 'reception' | 'quote' | 'ready') => {
    setSmsType(type);
    setSmsOpen(true);
  };

  const copyClientLink = () => {
    if (order.client_code) {
      navigator.clipboard.writeText(`${window.location.origin}/warsztat/klient/${order.client_code}`);
      toast.success('Link do zlecenia skopiowany');
    }
  };

  return (
    <div className="space-y-4">
      {/* Header breadcrumb - desktop */}
      <div className="hidden md:flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 text-sm">
          <button onClick={onBack} className="text-primary hover:underline flex items-center gap-1">
            <ArrowLeft className="h-4 w-4" /> Zlecenia
          </button>
          <span className="text-muted-foreground">·</span>
          <span className="font-semibold">{order.order_number}</span>
          <span className="text-muted-foreground">·</span>
          {order.created_at && (
            <span className="text-muted-foreground">{format(new Date(order.created_at), 'dd/MM/yyyy')}</span>
          )}
          {clientName && (
            <>
              <span className="text-muted-foreground">·</span>
              <WorkshopClientHoverCard client={order.client} onEdit={() => setEditClientOpen(true)}>
                <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" /> {clientName}</span>
              </WorkshopClientHoverCard>
            </>
          )}
          {vehicleName && (
            <>
              <span className="text-muted-foreground">·</span>
              <WorkshopVehicleHoverCard vehicle={order.vehicle}>
                <span className="flex items-center gap-1"><Car className="h-3.5 w-3.5" /> {vehicleName}</span>
              </WorkshopVehicleHoverCard>
            </>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Select value={order.status_name} onValueChange={changeStatus}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {statuses.map((s: any) => (
                <SelectItem key={s.id} value={s.name}>
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.color }} />
                    {s.name}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            variant="outline"
            size="sm"
            className="gap-1"
            onClick={() => {
              if (order.client_code) {
                window.open(`/warsztat/klient/${order.client_code}`, '_blank');
              } else {
                toast.info('Brak kodu klienta — utwórz zlecenie ponownie');
              }
            }}
          >
            <FileText className="h-4 w-4" /> Karta zlecenia
          </Button>

          {/* Action icons with dropdowns */}
          <div className="flex items-center gap-1">
            {/* Protokół przyjęcia */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost" size="icon" title="Protokół przyjęcia"
                  className={order.client_acceptance_confirmed ? 'text-green-500' : 'text-amber-500'}
                >
                  <Eye className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-52">
                <DropdownMenuItem onClick={() => toast.info('Podgląd protokołu przyjęcia')}>
                  <Eye className="h-4 w-4 mr-2" /> Podgląd
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => toast.info('Drukowanie protokołu...')}>
                  <Printer className="h-4 w-4 mr-2" /> Drukuj
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => toast.info('Pobieranie protokołu...')}>
                  <Download className="h-4 w-4 mr-2" /> Pobierz
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => toast.info('Podpisany dokument')}>
                  <CheckCircle className="h-4 w-4 mr-2" /> Podpisany dokument
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => {
                  updateOrder.mutateAsync({ id: order.id, client_acceptance_confirmed: !order.client_acceptance_confirmed });
                  toast.success(order.client_acceptance_confirmed ? 'Oznaczono jako niepodpisany' : 'Oznaczono jako podpisany');
                }}>
                  <XCircle className="h-4 w-4 mr-2" /> {order.client_acceptance_confirmed ? 'Oznacz jako niepodpisany' : 'Oznacz jako podpisany'}
                </DropdownMenuItem>
                <DropdownMenuItem className="text-destructive" onClick={() => toast.info('Wyłączono protokół')}>
                  <Ban className="h-4 w-4 mr-2" /> Wyłącz
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Wycena / Kosztorys */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost" size="icon" title="Wycena"
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
                    ⚠️ Kosztorys zmieniony po wysłaniu — wyślij ponownie do klienta
                  </div>
                )}
                <DropdownMenuItem onClick={() => openSms('quote')}>
                  <Send className="h-4 w-4 mr-2" /> Wyślij kosztorys SMS
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => toast.info('Podgląd kosztorysu')}>
                  <Eye className="h-4 w-4 mr-2" /> Podgląd
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => toast.info('Drukowanie kosztorysu...')}>
                  <Printer className="h-4 w-4 mr-2" /> Drukuj
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => toast.info('Pobieranie kosztorysu...')}>
                  <Download className="h-4 w-4 mr-2" /> Pobierz
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => toast.info('Podpisany dokument')}>
                  <CheckCircle className="h-4 w-4 mr-2" /> Podpisany dokument
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => {
                  const newVal = !order.quote_accepted;
                  updateOrder.mutateAsync({ id: order.id, quote_accepted: newVal, ...(newVal ? { status_name: 'Akceptacja klienta' } : {}) });
                  toast.success(newVal ? 'Zaakceptowano — status: Akceptacja klienta' : 'Oznaczono jako niepodpisany');
                }}>
                  <XCircle className="h-4 w-4 mr-2" /> {order.quote_accepted ? 'Oznacz jako niepodpisany' : 'Oznacz jako podpisany'}
                </DropdownMenuItem>
                <DropdownMenuItem className="text-destructive" onClick={() => toast.info('Wyłączono kosztorys')}>
                  <Ban className="h-4 w-4 mr-2" /> Wyłącz
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Gotowość / Powiadomienie */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost" size="icon" title="Gotowość potwierdzona"
                  className={order.ready_notification_sent ? 'text-green-500' : 'text-amber-500'}
                >
                  <Send className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-52">
                <DropdownMenuItem onClick={() => openSms('ready')}>
                  <Send className="h-4 w-4 mr-2" /> Wyślij powiadomienie
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => toast.info('Podgląd powiadomienia')}>
                  <Eye className="h-4 w-4 mr-2" /> Podgląd
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => {
                  updateOrder.mutateAsync({ id: order.id, ready_notification_sent: !order.ready_notification_sent });
                  toast.success(order.ready_notification_sent ? 'Oznaczono jako niewysłane' : 'Oznaczono jako wysłane');
                }}>
                  <XCircle className="h-4 w-4 mr-2" /> {order.ready_notification_sent ? 'Oznacz jako niewysłane' : 'Oznacz jako wysłane'}
                </DropdownMenuItem>
                <DropdownMenuItem className="text-destructive" onClick={() => toast.info('Wyłączono')}>
                  <Ban className="h-4 w-4 mr-2" /> Wyłącz
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Button variant="ghost" size="icon" title="Wyślij SMS" onClick={() => {
              // Auto-detect SMS type based on order state
              const hasQuoteItems = (order.total_gross || 0) > 0;
              const protocolSigned = order.client_acceptance_confirmed;
              if (protocolSigned && hasQuoteItems && !order.quote_accepted) {
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
            <Button variant="ghost" size="icon" title="Link do zlecenia" onClick={copyClientLink}>
              <Link2 className="h-4 w-4" />
            </Button>
            <RidoPartsCartButton providerId={providerId} />
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon"><MoreVertical className="h-4 w-4" /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem><Eye className="h-4 w-4 mr-2" /> Podgląd</DropdownMenuItem>
              <DropdownMenuItem><Printer className="h-4 w-4 mr-2" /> Drukuj</DropdownMenuItem>
              <DropdownMenuItem><Download className="h-4 w-4 mr-2" /> Pobierz</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Header - mobile */}
      <div className="md:hidden space-y-3">
        <div className="flex items-center justify-between">
          <span className="font-bold text-lg">{order.order_number}</span>
          <Select value={order.status_name} onValueChange={changeStatus}>
            <SelectTrigger className="w-auto h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {statuses.map((s: any) => (
                <SelectItem key={s.id} value={s.name}>
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.color }} />
                    {s.name}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {order.created_at && <span>{format(new Date(order.created_at), 'dd.MM.yyyy')}</span>}
          {clientName && <span className="flex items-center gap-1"><Users className="h-3 w-3" /> {clientName}</span>}
          {vehicleName && <span className="flex items-center gap-1"><Car className="h-3 w-3" /> {vehicleName}</span>}
        </div>
        <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide">
          <Button variant="outline" size="sm" className="h-7 text-xs gap-1 shrink-0" onClick={() => {
            if (order.client_code) window.open(`/warsztat/klient/${order.client_code}`, '_blank');
          }}>
            <FileText className="h-3.5 w-3.5" /> Karta
          </Button>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 shrink-0" onClick={() => openSms('reception')}>
            <MessageSquare className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 shrink-0" onClick={copyClientLink}>
            <Link2 className="h-3.5 w-3.5" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0 shrink-0"><MoreVertical className="h-3.5 w-3.5" /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => toast.info('Podgląd protokołu przyjęcia')}>
                <Eye className="h-4 w-4 mr-2" /> Protokół przyjęcia
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => toast.info('Podgląd kosztorysu')}>
                <ClipboardList className="h-4 w-4 mr-2" /> Wycena
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => openSms('ready')}>
                <Send className="h-4 w-4 mr-2" /> Powiadomienie
              </DropdownMenuItem>
              <DropdownMenuItem><Printer className="h-4 w-4 mr-2" /> Drukuj</DropdownMenuItem>
              <DropdownMenuItem><Download className="h-4 w-4 mr-2" /> Pobierz</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-transparent w-full justify-start gap-1.5 h-auto p-0 overflow-x-auto scrollbar-hide flex-nowrap mb-4">
          {[
            { value: 'tasks', label: 'Wycena zlecenia' },
            { value: 'basic', label: 'Podstawowe' },
            { value: 'summary', label: 'Podsumowanie' },
            { value: 'schedule', label: 'Terminarz' },
            { value: 'files', label: 'Pliki' },
            { value: 'repair-data', label: 'Dane naprawcze' },
          ].map((tab) => (
            <TabsTrigger
              key={tab.value}
              value={tab.value}
              className="px-4 md:px-5 py-2 rounded-full text-xs md:text-sm font-medium shrink-0 transition-all duration-200 data-[state=active]:text-white data-[state=active]:shadow-sm data-[state=inactive]:text-foreground/70 data-[state=inactive]:bg-transparent data-[state=inactive]:hover:bg-[#F5C842] data-[state=inactive]:hover:text-[#1a1a1a]"
              style={activeTab === tab.value ? { backgroundColor: 'var(--nav-bar-color, #6C3CF0)' } : undefined}
            >
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="basic">
          <WorkshopOrderBasicTab order={order} providerId={providerId} />
        </TabsContent>
        <TabsContent value="tasks">
          <WorkshopOrderTasksTab order={order} providerId={providerId} />
        </TabsContent>
        <TabsContent value="summary">
          <WorkshopOrderSummaryTab order={order} />
        </TabsContent>
        <TabsContent value="schedule">
          <WorkshopScheduler providerId={providerId} onBack={() => {}} title={`Terminarz: ${order.order_number || ''}`} focusOrderId={order.id} />
        </TabsContent>
        <TabsContent value="files">
          <WorkshopOrderFilesTab order={order} />
        </TabsContent>
        <TabsContent value="repair-data">
          <div className="text-center py-12 text-muted-foreground">
            Dane naprawcze — wkrótce dostępne
          </div>
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
    </div>
  );
}
