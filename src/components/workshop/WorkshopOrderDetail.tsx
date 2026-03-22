import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useWorkshopStatuses, useUpdateWorkshopOrder } from '@/hooks/useWorkshop';
import { WorkshopOrderBasicTab } from './tabs/WorkshopOrderBasicTab';
import { WorkshopOrderFilesTab } from './tabs/WorkshopOrderFilesTab';
import { WorkshopOrderTasksTab } from './tabs/WorkshopOrderTasksTab';
import { WorkshopOrderSummaryTab } from './tabs/WorkshopOrderSummaryTab';
import { WorkshopSmsDialog } from './WorkshopSmsDialog';
import { RidoPartsCartButton } from './parts/RidoPartsCartButton';
import {
  ArrowLeft, FileText, Send, Eye, Link2, MessageSquare, MoreVertical,
  Printer, Download, ClipboardList, Car, Users
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
    // Auto-open SMS dialog for certain statuses
    if (newStatus === 'Akceptacja klienta') {
      setSmsType('quote');
      setSmsOpen(true);
    } else if (newStatus === 'Gotowy do odbioru') {
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
      {/* Header breadcrumb */}
      <div className="flex items-center justify-between flex-wrap gap-2">
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
              <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" /> {clientName}</span>
            </>
          )}
          {vehicleName && (
            <>
              <span className="text-muted-foreground">·</span>
              <span className="flex items-center gap-1"><Car className="h-3.5 w-3.5" /> {vehicleName}</span>
            </>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Status selector */}
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

          {/* Action icons */}
          <div className="flex items-center gap-1">
            {/* Protocol status indicators */}
            <Button
              variant="ghost" size="icon" title="Protokół przyjęcia"
              className={order.client_acceptance_confirmed ? 'text-green-500' : 'text-amber-500'}
            >
              <Eye className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost" size="icon" title="Wycena zaakceptowana"
              className={order.quote_accepted ? 'text-green-500' : 'text-amber-500'}
            >
              <ClipboardList className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost" size="icon" title="Gotowość potwierdzona"
              className={order.ready_notification_sent ? 'text-green-500' : 'text-amber-500'}
            >
              <Send className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" title="Wyślij SMS" onClick={() => openSms('reception')}>
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

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-transparent w-full justify-start gap-1.5 h-auto p-0 flex-wrap mb-4">
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
              className="px-5 py-2 rounded-full text-sm font-medium transition-all duration-200 data-[state=active]:text-white data-[state=active]:shadow-sm data-[state=inactive]:text-foreground/70 data-[state=inactive]:bg-transparent data-[state=inactive]:hover:bg-[#F5C842] data-[state=inactive]:hover:text-[#1a1a1a]"
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
          <div className="text-center py-12 text-muted-foreground">
            Terminarz zlecenia — wkrótce dostępny
          </div>
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
    </div>
  );
}
