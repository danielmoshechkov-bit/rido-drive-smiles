import { useState, useMemo, useEffect } from 'react';
import { WorkshopPager, pageSlice } from './WorkshopPager';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useWorkshopClients, useWorkshopVehicles } from '@/hooks/useWorkshop';
import { useProviderPrintHeader } from '@/hooks/useFiscal';
import { WorkshopAddVehicleDialog } from './WorkshopAddVehicleDialog';
import { WorkshopAddClientDialog } from './WorkshopAddClientDialog';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import {
  Plus, Search, Trash2, Archive, X, Check, ChevronsUpDown, Printer
} from 'lucide-react';

interface Props {
  providerId: string;
  onBack: () => void;
}

// Hooks for tire storage data
function useTireStorageRecords(providerId: string, view: 'stored' | 'issued' = 'stored') {
  return useQuery({
    queryKey: ['tire-storage', providerId, view],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('workshop_tire_storage')
        .select('*, workshop_clients(*), workshop_vehicles(*)')
        .eq('provider_id', providerId)
        .eq('is_active', view === 'stored')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!providerId,
  });
}

function useServicePoints(providerId: string) {
  return useQuery({
    queryKey: ['service-points', providerId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('workshop_service_points')
        .select('*')
        .eq('provider_id', providerId)
        .order('name');
      if (error) throw error;
      return data || [];
    },
    enabled: !!providerId,
  });
}

/**
 * Pokwitowanie przyjęcia/wydania opon.
 *
 * PO CO: klient zostawia cztery koła warte kilka tysięcy i nie dostawał na to żadnego
 * papieru. Pokwitowanie jest jedynym dowodem, co zostawił, w jakim stanie i do kiedy —
 * a przy sporze („zostawiłem cztery, oddajecie trzy") rozstrzyga sprawę.
 */
function printStorageReceipt(
  record: any,
  kind: 'przyjęcia' | 'wydania',
  header: { companyName?: string | null; nip?: string | null; address?: string | null; logoUrl?: string | null } = {},
) {
  const esc = (v: unknown) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const client = record.client_name
    || [record.workshop_clients?.first_name, record.workshop_clients?.last_name].filter(Boolean).join(' ')
    || '—';
  const vehicle = record.workshop_vehicles
    ? [record.workshop_vehicles.brand, record.workshop_vehicles.model, record.workshop_vehicles.plate].filter(Boolean).join(' ')
    : '—';
  const seasons: Record<string, string> = { letnie: 'letnie', zimowe: 'zimowe', calorocze: 'całoroczne' };
  const row = (label: string, value: unknown) =>
    `<tr><td class="k">${esc(label)}</td><td>${esc(value) || '—'}</td></tr>`;

  const html = `<!doctype html>
<html lang="pl"><head><meta charset="utf-8"><title>Pokwitowanie ${esc(kind)} opon</title>
<style>
  body { font-family: ui-sans-serif, system-ui, sans-serif; margin: 24px; color: #111; font-size: 13px; }
  .banner { border: 2px solid #111; padding: 8px 12px; text-align: center; font-weight: 700; letter-spacing: 1px; }
  h1 { font-size: 16px; margin: 18px 0 6px; }
  table { width: 100%; border-collapse: collapse; margin-top: 10px; }
  td { border-bottom: 1px solid #ddd; padding: 6px 4px; vertical-align: top; }
  td.k { width: 34%; color: #555; }
  .sign { margin-top: 46px; display: flex; justify-content: space-between; gap: 40px; }
  .sign div { flex: 1; border-top: 1px solid #111; padding-top: 6px; text-align: center; font-size: 11px; color: #555; }
  .footer { margin-top: 20px; font-size: 11px; color: #555; line-height: 1.6; }
  @media print { body { margin: 10mm; } }
</style></head>
<body>
  ${header.logoUrl ? `<div style="text-align:center;margin-bottom:10px"><img src="${esc(header.logoUrl)}" alt="" style="max-height:70px;max-width:60%;object-fit:contain" /></div>` : ''}
  <div class="banner">POKWITOWANIE ${esc(kind.toUpperCase())} OPON DO PRZECHOWANIA</div>
  ${header.companyName ? `<h1>${esc(header.companyName)}</h1>` : ''}
  <div class="muted" style="color:#555;font-size:12px">
    ${header.address ? esc(header.address) + '<br>' : ''}
    ${header.nip ? 'NIP: ' + esc(header.nip) : ''}
  </div>
  <h1>Nr miejsca: ${esc(record.storage_number || '—')}</h1>
  <table>
    ${row('Klient', client)}
    ${row('Telefon', record.client_phone)}
    ${row('Pojazd', vehicle)}
    ${row('Opony', [record.tire_brand, record.tire_model].filter(Boolean).join(' '))}
    ${row('Rozmiar', record.tire_size)}
    ${row('Sezon', seasons[record.season] ?? record.season)}
    ${row('Liczba sztuk', record.quantity ?? 4)}
    ${row('Głębokość bieżnika', record.tread_depth_mm ? `${record.tread_depth_mm} mm` : '')}
    ${row('DOT', record.dot_code)}
    ${row('Stan', record.condition)}
    ${row('Data przyjęcia', record.stored_at ? new Date(record.stored_at).toLocaleDateString('pl-PL') : '')}
    ${row('Termin odbioru', record.pickup_deadline ? new Date(record.pickup_deadline).toLocaleDateString('pl-PL') : '')}
    ${kind === 'wydania' ? row('Data wydania', record.pickup_at ? new Date(record.pickup_at).toLocaleDateString('pl-PL') : new Date().toLocaleDateString('pl-PL')) : ''}
    ${row('Koszt przechowania', record.storage_cost ? `${Number(record.storage_cost).toFixed(2)} zł` : '')}
    ${row('Lokalizacja', record.location_name)}
    ${row('Uwagi', record.notes)}
  </table>
  <div class="sign">
    <div>podpis klienta</div>
    <div>podpis przyjmującego</div>
  </div>
  <div class="footer">
    Dokument potwierdza ${kind === 'przyjęcia' ? 'przyjęcie opon do przechowania' : 'wydanie opon właścicielowi'}.
    Wygenerowano w GetRido: ${esc(new Date().toLocaleString('pl-PL'))}
  </div>
  <script>window.onload = () => window.print();</script>
</body></html>`;

  const win = window.open('', '_blank', 'width=760,height=900');
  if (!win) { toast.error('Przeglądarka zablokowała okno wydruku.'); return; }
  win.document.write(html);
  win.document.close();
}

export function WorkshopTireStorage({ providerId, onBack }: Props) {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  /**
   * „W magazynie" i „Wydane" to dwa różne pytania: pierwsze zadaje magazynier szukający
   * miejsca, drugie — klient, który twierdzi, że opon nie odebrał. Dotąd lista pokazywała
   * wyłącznie aktywne, więc wydanie kompletu znaczyło skasowanie wpisu razem z historią.
   */
  const [view, setView] = useState<'stored' | 'issued'>('stored');
  const { data: records = [], isLoading } = useTireStorageRecords(providerId, view);
  // Pokwitowanie trafia do rąk klienta — z logo i danymi warsztatu.
  const { data: printHeader } = useProviderPrintHeader(providerId);
  const queryClientRef = useQueryClient();

  const issueSet = async (record: any) => {
    const label = [record.tire_brand, record.tire_size].filter(Boolean).join(' ') || 'komplet';
    if (!confirm(`Wydać ${label} klientowi? Wpis trafi do historii wydanych.`)) return;
    const { error } = await (supabase as any)
      .from('workshop_tire_storage')
      .update({ is_active: false, pickup_at: new Date().toISOString() })
      .eq('id', record.id);
    if (error) { toast.error(error.message); return; }
    toast.success('Komplet wydany klientowi.');
    queryClientRef.invalidateQueries({ queryKey: ['tire-storage'] });
  };

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const filtered = useMemo(() => {
    if (!search) return records;
    const q = search.toLowerCase();
    return records.filter((r: any) =>
      (r.client_name || '').toLowerCase().includes(q) ||
      (r.tire_brand || '').toLowerCase().includes(q) ||
      (r.storage_number || '').toLowerCase().includes(q) ||
      (r.workshop_clients?.first_name || '').toLowerCase().includes(q) ||
      (r.workshop_clients?.last_name || '').toLowerCase().includes(q) ||
      (r.workshop_vehicles?.plate || '').toLowerCase().includes(q)
    );
  }, [records, search]);

  const paged = pageSlice(filtered, page, pageSize);
  useEffect(() => { setPage(1); }, [pageSize]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="text-primary hover:underline text-sm">🏠</button>
        <span className="text-muted-foreground">/</span>
        <h2 className="text-xl font-bold">{t('workshop.tireStorage.title')}</h2>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => setShowAdd(true)} className="gap-2">
          <Plus className="h-4 w-4" /> {t('workshop.tireStorage.store')}
        </Button>
        <div className="flex rounded-md border overflow-hidden">
          {([['stored', 'W magazynie'], ['issued', 'Wydane']] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setView(value)}
              className={`px-3 py-1.5 text-sm transition-colors ${view === value ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'}`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('common.search')} className="pl-9 w-[250px]" />
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('workshop.tireStorage.col.code')}</TableHead>
                <TableHead>{t('workshop.tireStorage.col.client')}</TableHead>
                <TableHead>{t('workshop.tireStorage.col.phone')}</TableHead>
                <TableHead>{t('workshop.tireStorage.col.brandModel')}</TableHead>
                <TableHead>{t('workshop.tireStorage.col.size')}</TableHead>
                <TableHead>{t('workshop.tireStorage.col.season')}</TableHead>
                <TableHead>{t('workshop.tireStorage.col.vehicle')}</TableHead>
                <TableHead>{t('workshop.tireStorage.col.location')}</TableHead>
                <TableHead>{t('workshop.tireStorage.col.receivedDate')}</TableHead>
                <TableHead>{t('workshop.tireStorage.col.cost')}</TableHead>
                <TableHead className="text-right">Akcje</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={11} className="text-center py-12 text-muted-foreground">
                    <Archive className="h-8 w-8 mx-auto mb-2 opacity-40" />
                    {isLoading ? t('common.loading') : t('workshop.tireStorage.noData')}
                  </TableCell>
                </TableRow>
              ) : paged.map((r: any) => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono text-xs">{r.storage_number || '—'}</TableCell>
                  <TableCell>{r.client_name || `${r.workshop_clients?.first_name || ''} ${r.workshop_clients?.last_name || ''}`.trim() || '—'}</TableCell>
                  <TableCell className="text-xs">{r.client_phone || '—'}</TableCell>
                  <TableCell>{r.tire_brand} {r.tire_model}</TableCell>
                  <TableCell>{r.tire_size || '—'}</TableCell>
                  <TableCell>{r.season === 'letnie' ? `☀️ ${t('workshop.tireStorage.season.summer')}` : r.season === 'zimowe' ? `❄️ ${t('workshop.tireStorage.season.winter')}` : `🔄 ${t('workshop.tireStorage.season.allSeason')}`}</TableCell>
                  <TableCell className="text-xs">{r.workshop_vehicles ? `${r.workshop_vehicles.brand} ${r.workshop_vehicles.model} ${r.workshop_vehicles.plate}` : '—'}</TableCell>
                  <TableCell className="text-xs">{r.location_name || '—'}</TableCell>
                  <TableCell className="text-xs">{r.stored_at ? new Date(r.stored_at).toLocaleDateString('pl-PL') : '—'}</TableCell>
                  <TableCell className="font-medium">{(r.storage_cost || 0).toFixed(2)} zł</TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs gap-1"
                      onClick={() => printStorageReceipt(r, view === 'stored' ? 'przyjęcia' : 'wydania', printHeader ?? {})}
                    >
                      <Printer className="h-3.5 w-3.5" /> Pokwitowanie
                    </Button>
                    {view === 'stored' && (
                      <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => issueSet(r)}>
                        <Check className="h-3.5 w-3.5" /> Wydaj
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <WorkshopPager
        page={page}
        pageSize={pageSize}
        total={filtered.length}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
      />

      <TireStorageDialog open={showAdd} onOpenChange={setShowAdd} providerId={providerId} />
    </div>
  );
}

// ---- Searchable Combobox ----
function SearchableCombobox({ items, value, onSelect, onCreateNew, onAddNew, placeholder, renderItem, getLabel }: {
  items: any[];
  value: string;
  onSelect: (val: string) => void;
  onCreateNew?: (query: string) => void;
  onAddNew?: (query: string) => void;
  placeholder: string;
  renderItem: (item: any) => React.ReactNode;
  getLabel: (item: any) => string;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    if (!query) return items;
    const q = query.toLowerCase();
    return items.filter(item => getLabel(item).toLowerCase().includes(q));
  }, [items, query, getLabel]);

  const selectedLabel = items.find(i => i.id === value) ? getLabel(items.find(i => i.id === value)!) : '';

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && query.trim() && filtered.length === 0 && onCreateNew) {
      e.preventDefault();
      onCreateNew(query.trim());
      setOpen(false);
      setQuery('');
    }
  };

  return (
    <div className="flex items-center gap-1">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" role="combobox" className="w-full justify-between h-9 font-normal">
            {selectedLabel || <span className="text-muted-foreground">{placeholder}</span>}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-full p-0" align="start">
          <Command>
            <div onKeyDown={handleKeyDown}>
              <CommandInput placeholder={placeholder} value={query} onValueChange={setQuery} />
            </div>
            <CommandList>
              <CommandEmpty>
                <div className="space-y-1">
                  {onCreateNew && query.trim() && (
                    <button
                      className="w-full px-3 py-2 text-sm text-left hover:bg-accent flex items-center gap-2"
                      onClick={() => { onCreateNew(query.trim()); setOpen(false); setQuery(''); }}
                    >
                      <Plus className="h-4 w-4" /> {t('workshop.tireStorage.addQuery', { query: query.trim() })}
                    </button>
                  )}
                  {!query.trim() && t('workshop.tireStorage.notFound')}
                </div>
              </CommandEmpty>
              <CommandGroup>
                {filtered.map(item => (
                  <CommandItem key={item.id} value={getLabel(item)} onSelect={() => { onSelect(item.id); setOpen(false); setQuery(''); }}>
                    <Check className={`mr-2 h-4 w-4 ${value === item.id ? 'opacity-100' : 'opacity-0'}`} />
                    {renderItem(item)}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {onAddNew && (
        <Button variant="outline" size="icon" className="h-9 w-9 shrink-0" onClick={() => onAddNew(query.trim())}>
          <Plus className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}

// ---- Dialog ----
function TireStorageDialog({ open, onOpenChange, providerId }: { open: boolean; onOpenChange: (v: boolean) => void; providerId: string }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data: clients = [] } = useWorkshopClients(providerId);
  const { data: rawVehicles = [] } = useWorkshopVehicles(providerId);
  const { data: servicePoints = [] } = useServicePoints(providerId);

  // Deduplicate vehicles by plate
  const vehicles = useMemo(() => {
    const seen = new Set<string>();
    return rawVehicles.filter((v: any) => {
      const key = `${v.plate || ''}_${v.brand || ''}_${v.model || ''}`.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [rawVehicles]);

  const [clientId, setClientId] = useState('');
  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [vehicleId, setVehicleId] = useState('');
  const [vehiclePlateText, setVehiclePlateText] = useState('');
  const [storedAt, setStoredAt] = useState(new Date().toISOString().split('T')[0]);
  const [pickupAt, setPickupAt] = useState('');
  const [storageCost, setStorageCost] = useState('150');
  const [pickupDeadline, setPickupDeadline] = useState('');
  const [reminderMonths, setReminderMonths] = useState('6');
  // O sposobie kontaktu decyduje klient — 'none' to pełnoprawny wybór, nie brak danych.
  const [reminderChannel, setReminderChannel] = useState<'sms' | 'email' | 'none'>('sms');
  const [locationName, setLocationName] = useState('');
  const [locationDesc, setLocationDesc] = useState('');
  const [season, setSeason] = useState('letnie');
  const [employeeName, setEmployeeName] = useState('');

  // Add dialogs
  const [showAddClient, setShowAddClient] = useState(false);
  const [showAddVehicle, setShowAddVehicle] = useState(false);

  // Tire fields
  const [tireBrand, setTireBrand] = useState('');
  const [tireModel, setTireModel] = useState('');
  const [tireSize, setTireSize] = useState('');
  const [dotCode, setDotCode] = useState('');
  const [treadDepth, setTreadDepth] = useState('');
  const [rimType, setRimType] = useState('');
  const [rimManufacturer, setRimManufacturer] = useState('');
  const [quantity, setQuantity] = useState('4');
  const [notes, setNotes] = useState('');

  // Tasks (empty by default)
  const [tasks, setTasks] = useState<{ name: string; price: number }[]>([]);
  const [newTaskName, setNewTaskName] = useState('');
  const [newTaskPrice, setNewTaskPrice] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSelectClient = (id: string) => {
    setClientId(id);
    const client = clients.find((c: any) => c.id === id);
    if (client) {
      const name = client.company_name || `${client.first_name || ''} ${client.last_name || ''}`.trim();
      setClientName(name);
      if (client.phone) setClientPhone(client.phone);
    }
  };

  const handleCreateClientInline = (query: string) => {
    // Enter pressed - just use typed name inline
    setClientName(query);
    setClientId('');
  };

  const handleSelectVehicle = (id: string) => {
    setVehicleId(id);
    setVehiclePlateText('');
  };

  const handleCreateVehicleInline = (query: string) => {
    // Enter pressed - just use typed plate text inline
    setVehiclePlateText(query);
    setVehicleId('');
  };

  const addTask = () => {
    if (!newTaskName.trim()) return;
    setTasks([...tasks, { name: newTaskName.trim(), price: parseFloat(newTaskPrice) || 0 }]);
    setNewTaskName('');
    setNewTaskPrice('');
  };

  const removeTask = (idx: number) => {
    setTasks(tasks.filter((_, i) => i !== idx));
  };

  const handleSave = async () => {
    if (!clientName.trim()) {
      toast.error(t('workshop.tireStorage.enterClientName'));
      return;
    }
    setSaving(true);
    try {
      // Parse DOT code to extract week/year
      const dotMatch = dotCode.match(/^(\d{2})(\d{2})$/);

      const { data: stored, error } = await (supabase as any)
        .from('workshop_tire_storage')
        .insert({
          provider_id: providerId,
          client_id: clientId || null,
          vehicle_id: vehicleId || null,
          client_name: clientName,
          client_phone: clientPhone,
          tire_brand: tireBrand,
          tire_model: tireModel,
          tire_size: tireSize,
          tire_type: rimType,
          rim_type: rimType,
          rim_manufacturer: rimManufacturer,
          quantity: parseInt(quantity) || 4,
          tread_depth_mm: parseFloat(treadDepth) || null,
          dot_code: dotCode,
          production_year: dotMatch ? 2000 + parseInt(dotMatch[2]) : null,
          season,
          stored_at: storedAt,
          pickup_at: pickupAt || null,
          pickup_deadline: pickupDeadline || null,
          storage_cost: parseFloat(storageCost) || 150,
          location_name: locationName || locationDesc,
          reminder_months: parseInt(reminderMonths) || 6,
          reminder_channel: reminderChannel,
          employee_name: employeeName,
          notes,
          is_active: true,
        })
        .select('id')
        .single();

      if (error) throw error;

      // Save tasks
      if (tasks.length > 0 && stored?.id) {
        const { error: taskErr } = await (supabase as any)
          .from('workshop_tire_storage_tasks')
          .insert(tasks.map(t => ({
            storage_id: stored.id,
            name: t.name,
            price: t.price,
          })));
        if (taskErr) console.error('Tasks save error:', taskErr);
      }

      toast.success(t('workshop.tireStorage.storageSaved'));
      queryClient.invalidateQueries({ queryKey: ['tire-storage'] });
      onOpenChange(false);

      // Offer SMS
      if (clientPhone) {
        const seasonLabel = season === 'letnie' ? 'letnie' : season === 'zimowe' ? 'zimowe' : 'całoroczne';
        toast.info(t('workshop.tireStorage.smsCanBeSent', { phone: clientPhone }), {
          action: { label: t('workshop.tireStorage.send'), onClick: () => toast.info(t('workshop.tireStorage.smsComingSoon')) },
        });
      }
    } catch (e: any) {
      toast.error(e.message || t('common.saveError'));
    } finally {
      setSaving(false);
    }
  };

  const addServicePoint = async () => {
    const name = prompt(t('workshop.tireStorage.servicePointNamePrompt'));
    if (!name?.trim()) return;
    const { error } = await (supabase as any)
      .from('workshop_service_points')
      .insert({ provider_id: providerId, name: name.trim() });
    if (error) toast.error(error.message);
    else {
      toast.success(t('workshop.tireStorage.servicePointAdded'));
      queryClient.invalidateQueries({ queryKey: ['service-points'] });
    }
  };

  const tasksTotal = tasks.reduce((s, t) => s + t.price, 0);

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('workshop.tireStorage.newStorage')}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4">
          {/* Client */}
          <div className="space-y-2">
            <Label>{t('workshop.tireStorage.client')}</Label>
            <SearchableCombobox
              items={clients}
              value={clientId}
              onSelect={handleSelectClient}
              onCreateNew={handleCreateClientInline}
              onAddNew={() => setShowAddClient(true)}
              placeholder={t('workshop.tireStorage.enterFullNamePlaceholder')}
              renderItem={(c: any) => c.company_name || `${[c.first_name, c.last_name].filter(Boolean).join(' ')}`}
              getLabel={(c: any) => c.company_name || `${c.first_name || ''} ${c.last_name || ''}`.trim()}
            />
            {!clientId && clientName && (
              <Input value={clientName} onChange={e => setClientName(e.target.value)} placeholder={t('workshop.tireStorage.fullName')} className="h-8" />
            )}
          </div>

          {/* Phone */}
          <div className="space-y-2">
            <Label>{t('workshop.tireStorage.phoneNumber')}</Label>
            <Input value={clientPhone} onChange={e => setClientPhone(e.target.value)} placeholder="+48 ..." className="h-9" />
          </div>

          {/* Vehicle */}
          <div className="space-y-2">
            <Label>{t('workshop.tireStorage.vehicle')}</Label>
            <SearchableCombobox
              items={vehicles}
              value={vehicleId}
              onSelect={handleSelectVehicle}
              onCreateNew={handleCreateVehicleInline}
              onAddNew={() => setShowAddVehicle(true)}
              placeholder={t('workshop.tireStorage.searchVehiclePlaceholder')}
              renderItem={(v: any) => `${v.brand} ${v.model} — ${v.plate}`}
              getLabel={(v: any) => `${v.brand || ''} ${v.model || ''} ${v.plate || ''}`.trim()}
            />
            {!vehicleId && vehiclePlateText && (
              <div className="text-xs text-muted-foreground">{t('workshop.tireStorage.entered', { value: vehiclePlateText })}</div>
            )}
          </div>

          {/* Season */}
          <div className="space-y-2">
            <Label>{t('workshop.tireStorage.col.season')}</Label>
            <Select value={season} onValueChange={setSeason}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="letnie">☀️ {t('workshop.tireStorage.season.summer')}</SelectItem>
                <SelectItem value="zimowe">❄️ {t('workshop.tireStorage.season.winter')}</SelectItem>
                <SelectItem value="całoroczne">🔄 {t('workshop.tireStorage.season.allSeason')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Dates */}
          <div className="space-y-2">
            <Label>{t('workshop.tireStorage.receivedDate')}</Label>
            <Input type="date" value={storedAt} onChange={e => setStoredAt(e.target.value)} className="h-9" />
          </div>
          <div className="space-y-2">
            <Label>{t('workshop.tireStorage.pickupDate')}</Label>
            <Input type="date" value={pickupAt} onChange={e => setPickupAt(e.target.value)} className="h-9" />
          </div>

          {/* Cost */}
          <div className="space-y-2">
            <Label>{t('workshop.tireStorage.storageCost')}</Label>
            <div className="flex items-center gap-2">
              <Input type="number" value={storageCost} onChange={e => setStorageCost(e.target.value)} className="flex-1 h-9" />
              <span className="text-sm text-muted-foreground">{t('workshop.tireStorage.plnNet')}</span>
            </div>
          </div>

          {/* Reminder */}
          <div className="space-y-2">
            <Label>Przypomnienie o odbiorze za</Label>
            <div className="flex items-center gap-2 flex-wrap">
              <Input type="number" min="1" max="12" value={reminderMonths} onChange={e => setReminderMonths(e.target.value)} className="w-20 h-9" />
              <span className="text-sm text-muted-foreground">{t('workshop.tireStorage.months')}</span>
              <Select value={reminderChannel} onValueChange={(v) => setReminderChannel(v as any)}>
                <SelectTrigger className="h-9 w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="sms">SMS-em</SelectItem>
                  <SelectItem value="email">E-mailem</SelectItem>
                  <SelectItem value="none">Bez przypomnienia</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Kanał wybiera klient. Wysyłka wymaga jeszcze zadania po stronie serwera —
              na razie termin jest zapisywany i widoczny w pokwitowaniu.
            </p>
          </div>

          {/* Service point */}
          <div className="space-y-2">
            <Label>{t('workshop.tireStorage.servicePoint')}</Label>
            <div className="flex items-center gap-2">
              <Select value={locationName} onValueChange={setLocationName}>
                <SelectTrigger className="flex-1 h-9"><SelectValue placeholder={t('workshop.tireStorage.selectPointPlaceholder')} /></SelectTrigger>
                <SelectContent>
                  {servicePoints.map((sp: any) => (
                    <SelectItem key={sp.id} value={sp.name}>{sp.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" size="icon" className="h-9 w-9 shrink-0" onClick={addServicePoint}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Location description */}
          <div className="space-y-2">
            <Label>{t('workshop.tireStorage.locationDesc')}</Label>
            <Textarea value={locationDesc} onChange={e => setLocationDesc(e.target.value)} placeholder={t('workshop.tireStorage.locationDescPlaceholder')} rows={2} />
          </div>

          {/* Employee */}
          <div className="space-y-2">
            <Label>{t('workshop.tireStorage.employee')}</Label>
            <Input value={employeeName} onChange={e => setEmployeeName(e.target.value)} placeholder={t('workshop.tireStorage.fullName')} className="h-9" />
          </div>
        </div>

        {/* Tire details */}
        <div className="mt-6">
          <h3 className="font-semibold text-lg mb-3">{t('workshop.tireStorage.tireDetails')}</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">{t('workshop.tireStorage.tireBrand')}</Label>
              <Input value={tireBrand} onChange={e => setTireBrand(e.target.value)} placeholder="Continental" className="h-8" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t('workshop.tireStorage.tireModel')}</Label>
              <Input value={tireModel} onChange={e => setTireModel(e.target.value)} placeholder="PremiumContact 6" className="h-8" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t('workshop.tireStorage.size')}</Label>
              <Input value={tireSize} onChange={e => setTireSize(e.target.value)} placeholder="205/55R16" className="h-8" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t('workshop.tireStorage.dotCode')}</Label>
              <Input value={dotCode} onChange={e => setDotCode(e.target.value)} placeholder="3325" maxLength={4} className="h-8" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t('workshop.tireStorage.treadDepth')}</Label>
              <Input type="number" value={treadDepth} onChange={e => setTreadDepth(e.target.value)} placeholder="6.5" className="h-8" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t('workshop.tireStorage.rimType')}</Label>
              <Input value={rimType} onChange={e => setRimType(e.target.value)} placeholder={t('workshop.tireStorage.rimTypePlaceholder')} className="h-8" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t('workshop.tireStorage.rimManufacturer')}</Label>
              <Input value={rimManufacturer} onChange={e => setRimManufacturer(e.target.value)} placeholder="OZ Racing" className="h-8" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t('workshop.tireStorage.quantity')}</Label>
              <Input type="number" value={quantity} onChange={e => setQuantity(e.target.value)} className="h-8" />
            </div>
          </div>
          <div className="mt-3 space-y-1">
            <Label className="text-xs">{t('workshop.tireStorage.notes')}</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder={t('workshop.tireStorage.notesPlaceholder')} rows={2} />
          </div>
        </div>

        {/* Tasks (empty by default, add with +) */}
        <div className="mt-6">
          <h3 className="font-semibold text-lg mb-3">{t('workshop.tireStorage.taskList')}</h3>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('workshop.tireStorage.col.no')}</TableHead>
                <TableHead>{t('workshop.tireStorage.col.name')}</TableHead>
                <TableHead className="text-right">{t('workshop.tireStorage.col.price')}</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tasks.map((task, idx) => (
                <TableRow key={idx}>
                  <TableCell>{idx + 1}</TableCell>
                  <TableCell>{task.name}</TableCell>
                  <TableCell className="text-right">{task.price.toFixed(2)}</TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => removeTask(idx)}>
                      <X className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {tasks.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-4 text-muted-foreground">{t('workshop.tireStorage.noTasks')}</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          <div className="flex items-center gap-2 mt-2">
            <Input value={newTaskName} onChange={e => setNewTaskName(e.target.value)} placeholder={t('workshop.tireStorage.taskNamePlaceholder')} className="flex-1 h-8" onKeyDown={e => e.key === 'Enter' && addTask()} />
            <Input type="number" value={newTaskPrice} onChange={e => setNewTaskPrice(e.target.value)} placeholder={t('workshop.tireStorage.pricePlaceholder')} className="w-24 h-8" onKeyDown={e => e.key === 'Enter' && addTask()} />
            <Button variant="outline" size="sm" className="gap-1 h-8" onClick={addTask}>
              <Plus className="h-4 w-4" /> {t('workshop.tireStorage.add')}
            </Button>
          </div>
          <div className="text-right text-sm font-medium mt-1">{t('workshop.tireStorage.total', { value: tasksTotal.toFixed(2) })}</div>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? t('workshop.tireStorage.saving') : t('common.save')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>

    <WorkshopAddClientDialog
      open={showAddClient}
      onOpenChange={setShowAddClient}
      providerId={providerId}
      onCreated={(newClient: any) => {
        if (newClient?.id) {
          handleSelectClient(newClient.id);
        }
      }}
    />

    <WorkshopAddVehicleDialog
      open={showAddVehicle}
      onOpenChange={setShowAddVehicle}
      providerId={providerId}
      onCreated={(newVehicle: any) => {
        if (newVehicle?.id) {
          handleSelectVehicle(newVehicle.id);
          queryClient.invalidateQueries({ queryKey: ['workshop-vehicles'] });
        }
      }}
    />
    </>
  );
}
