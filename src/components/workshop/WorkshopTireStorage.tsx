import { useState, useMemo, useEffect } from 'react';
import { useConfirm } from '@/components/ui/confirm-dialog';
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
import { TireStorageRulesDialog } from './TireStorageRulesDialog';
import { TireStoragePricing, useTirePricing, RODZAJE_FELG } from './TireStoragePricing';
import { TireStorageDetailsDialog } from './TireStorageDetailsDialog';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import {
  Plus, Search, Trash2, Archive, X, Check, ChevronsUpDown, Printer, Settings
} from 'lucide-react';

interface Props {
  providerId: string;
  onBack: () => void;
}

// Stan przypomnienia o odbiorze — ta sama arytmetyka co w widoku
// `workshop_tire_reminders_due`, z którego korzysta wysyłka: termin wpisany ręcznie
// ma pierwszeństwo, inaczej liczymy od przyjęcia + zadeklarowane miesiące.
// Warsztat musi widzieć, czy klient dostał wiadomość — automat działający
// niewidocznie jest nie do odróżnienia od automatu, który nie działa.
function reminderState(r: any): { label: string; className: string } {
  if ((r.reminder_channel ?? 'sms') === 'none') {
    return { label: 'bez przypomnień', className: 'text-muted-foreground' };
  }
  if (r.reminder_sent_at) {
    const kanal = r.reminder_channel === 'email' ? 'mail' : 'SMS';
    return {
      label: `✓ ${kanal} ${new Date(r.reminder_sent_at).toLocaleDateString('pl-PL')}`,
      className: 'text-emerald-600',
    };
  }
  const due = r.pickup_deadline
    ? new Date(r.pickup_deadline)
    : r.stored_at
      ? new Date(new Date(r.stored_at).setMonth(new Date(r.stored_at).getMonth() + (r.reminder_months ?? 6)))
      : null;
  if (!due) return { label: '—', className: 'text-muted-foreground' };

  const dni = Math.ceil((due.getTime() - Date.now()) / 86_400_000);
  const data = due.toLocaleDateString('pl-PL');
  if (dni < 0) return { label: `termin minął ${data}`, className: 'text-destructive' };
  if (dni <= 7) return { label: `za ${dni} dni (${data})`, className: 'text-amber-600' };
  return { label: data, className: 'text-muted-foreground' };
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

/**
 * Naleznosci: cena przechowania powiekszona o oplate za dni po terminie.
 * Liczy je baza (widok `workshop_tire_storage_naleznosci`), bo ta sama kwota
 * musi wyjsc w panelu, na wydruku i w przypomnieniu — trzy razy liczona
 * w przegladarce rozjechalaby sie przy pierwszej zmianie zasad.
 */
function useTireDues(providerId: string) {
  return useQuery({
    queryKey: ['tire-storage-dues', providerId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('workshop_tire_storage_naleznosci')
        .select('id, termin, dni_po_terminie, do_zaplaty, nieodebrane_od, reminder_count')
        .eq('provider_id', providerId);
      if (error) throw error;
      const mapa: Record<string, any> = {};
      for (const row of data || []) mapa[row.id] = row;
      return mapa;
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
    ${(() => {
      const b = [
        ['LP', record.tread_lp_mm], ['PP', record.tread_pp_mm],
        ['LT', record.tread_lt_mm], ['PT', record.tread_pt_mm],
      ].filter(([, v]) => v != null);
      return b.length ? row('Bieżnik', b.map(([k, v]) => `${k}: ${v} mm`).join(' · ')) : '';
    })()}
    ${row('Sezon', seasons[record.season] ?? record.season)}
    ${row('Liczba sztuk', record.quantity ?? 4)}
    ${row('Głębokość bieżnika', record.tread_depth_mm ? `${record.tread_depth_mm} mm` : '')}
    ${row('DOT', record.dot_code)}
    ${row('Stan', record.condition)}
    ${row('Data przyjęcia', record.stored_at ? new Date(record.stored_at).toLocaleDateString('pl-PL') : '')}
    ${row('Termin odbioru', record.pickup_deadline ? new Date(record.pickup_deadline).toLocaleDateString('pl-PL') : '')}
    ${kind === 'wydania' ? row('Data wydania', record.pickup_at ? new Date(record.pickup_at).toLocaleDateString('pl-PL') : new Date().toLocaleDateString('pl-PL')) : ''}
    ${row('Koszt przechowania', record.cena_za_okres && record.okres_miesiecy
      ? `${Number(record.cena_za_okres).toFixed(2)} zł za ${record.okres_miesiecy} mies. (każdy rozpoczęty okres płatny)`
      : record.storage_cost ? `${Number(record.storage_cost).toFixed(2)} zł` : '')}
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
  const { t } = useTranslation();  const confirmAction = useConfirm();

  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [zasadyOtwarte, setZasadyOtwarte] = useState(false);
  const [podglad, setPodglad] = useState<any>(null);
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
    if (!(await confirmAction({
      title: `Wydać ${label} klientowi?`,
      description: 'Wpis trafi do historii wydanych.',
      confirmLabel: 'Wydaj',
      destructive: false,
    }))) return;
    const { error } = await (supabase as any)
      .from('workshop_tire_storage')
      .update({ is_active: false, pickup_at: new Date().toISOString() })
      .eq('id', record.id);
    if (error) { toast.error(error.message); return; }
    toast.success('Komplet wydany klientowi.');
    queryClientRef.invalidateQueries({ queryKey: ['tire-storage'] });
  };

  /**
   * Komplet, po ktory nikt nie przyjechal mimo przypomnien. Oznaczenie
   * zatrzymuje dalsze przypomnienia (nie ma sensu pisac w kolko) i wyroznia
   * wpis na liscie, ale NIE wydaje kompletu i nie zeruje naleznosci —
   * o losie opon decyduje warsztat, nie system.
   */
  const oznaczNieodebrane = async (record: any) => {
    const nazwa = [record.tire_brand, record.tire_size].filter(Boolean).join(' ') || 'komplet';
    const juz = !!record.dlug?.nieodebrane_od;
    if (!(await confirmAction({
      title: juz ? `Cofnąć oznaczenie dla ${nazwa}?` : `Uznać ${nazwa} za nieodebrany?`,
      description: juz
        ? 'Przypomnienia znów będą wychodzić.'
        : 'Przypomnienia przestaną wychodzić. Komplet zostaje w magazynie, należność bez zmian.',
      confirmLabel: juz ? 'Cofnij' : 'Uznaj za nieodebrany',
      destructive: !juz,
    }))) return;

    const { error } = await (supabase as any)
      .from('workshop_tire_storage')
      .update({ nieodebrane_od: juz ? null : new Date().toISOString().slice(0, 10) })
      .eq('id', record.id);
    if (error) { toast.error(error.message); return; }
    toast.success(juz ? 'Oznaczenie cofnięte.' : 'Oznaczono jako nieodebrany.');
    queryClientRef.invalidateQueries({ queryKey: ['tire-storage'] });
    queryClientRef.invalidateQueries({ queryKey: ['tire-storage-dues', providerId] });
  };

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const { data: naleznosci = {} } = useTireDues(providerId);
  const [tylkoPoTerminie, setTylkoPoTerminie] = useState(false);

  // Wpisy wzbogacone o kwote i dlug — jedno zrodlo dla tabeli, filtra i sumy.
  const zNaleznoscia = useMemo(
    () => records.map((r: any) => ({ ...r, dlug: naleznosci[r.id] ?? null })),
    [records, naleznosci],
  );

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    let wynik = zNaleznoscia;

    if (search) {
      wynik = wynik.filter((r: any) =>
        (r.client_name || '').toLowerCase().includes(q) ||
        (r.tire_brand || '').toLowerCase().includes(q) ||
        (r.storage_number || '').toLowerCase().includes(q) ||
        (r.workshop_clients?.first_name || '').toLowerCase().includes(q) ||
        (r.workshop_clients?.last_name || '').toLowerCase().includes(q) ||
        (r.workshop_vehicles?.plate || '').toLowerCase().includes(q)
      );
    }

    if (tylkoPoTerminie) {
      wynik = wynik.filter((r: any) => (r.dlug?.dni_po_terminie ?? 0) > 0);
      // Najdluzej zalegajacy na gorze — to on kosztuje warsztat miejsce.
      wynik = [...wynik].sort(
        (a: any, b: any) => (b.dlug?.dni_po_terminie ?? 0) - (a.dlug?.dni_po_terminie ?? 0),
      );
    }

    return wynik;
  }, [zNaleznoscia, search, tylkoPoTerminie]);

  const poTerminie = useMemo(
    () => zNaleznoscia.filter((r: any) => (r.dlug?.dni_po_terminie ?? 0) > 0),
    [zNaleznoscia],
  );
  const sumaPoTerminie = useMemo(
    () => poTerminie.reduce((suma: number, r: any) => suma + Number(r.dlug?.do_zaplaty ?? 0), 0),
    [poTerminie],
  );

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
        <Button variant="outline" onClick={() => setZasadyOtwarte(true)} className="gap-2">
          <Settings className="h-4 w-4" /> Zasady
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
        {view === 'stored' && poTerminie.length > 0 && (
          <button
            type="button"
            onClick={() => setTylkoPoTerminie(v => !v)}
            className={`px-3 py-1.5 text-sm rounded-md border transition-colors ${
              tylkoPoTerminie
                ? 'bg-destructive text-destructive-foreground border-destructive'
                : 'border-destructive/40 text-destructive hover:bg-destructive/10'
            }`}
            title="Pokaz wylacznie komplety po terminie, od najdluzej zalegajacych"
          >
            Po terminie: {poTerminie.length}
            {sumaPoTerminie > 0 && ` · ${sumaPoTerminie.toFixed(2)} zl`}
          </button>
        )}
        <div className="flex-1" />
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input onFocus={e => e.currentTarget.select()} value={search} onChange={e => setSearch(e.target.value)} placeholder={t('common.search')} className="pl-9 w-[250px]" />
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              {/* Trzynascie kolumn nie miescilo sie na ekranie: naglowki lamaly sie
                  na dwie linie, a wiersze rosly do trzech. Zostaja te, ktore
                  decyduja przy patrzeniu na liste; reszta jest w szczegolach. */}
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-[104px]">Kod</TableHead>
                <TableHead className="min-w-[150px]">Klient</TableHead>
                <TableHead className="min-w-[170px]">Opony</TableHead>
                <TableHead className="w-[96px]">Pojazd</TableHead>
                <TableHead className="w-[120px]">Miejsce</TableHead>
                <TableHead className="w-[92px]">Przyjęto</TableHead>
                <TableHead className="w-[130px]">Przypomnienie</TableHead>
                <TableHead className="w-[130px]">Do zapłaty</TableHead>
                <TableHead className="w-[150px] text-right">Akcje</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-12 text-muted-foreground">
                    <Archive className="h-8 w-8 mx-auto mb-2 opacity-40" />
                    {isLoading ? t('common.loading') : t('workshop.tireStorage.noData')}
                  </TableCell>
                </TableRow>
              ) : paged.map((r: any) => (
                <TableRow
                  key={r.id}
                  onClick={() => setPodglad(r)}
                  className="cursor-pointer"
                  title="Kliknij, aby zobaczyć szczegóły"
                >
                  <TableCell className="font-mono text-xs py-2">{r.storage_number || '—'}</TableCell>
                  <TableCell className="py-2">
                    <div className="text-sm leading-tight">
                      {r.client_name
                        || `${r.workshop_clients?.first_name || ''} ${r.workshop_clients?.last_name || ''}`.trim()
                        || '—'}
                    </div>
                    {r.client_phone && (
                      <div className="text-xs text-muted-foreground leading-tight">{r.client_phone}</div>
                    )}
                  </TableCell>
                  <TableCell className="py-2">
                    <div className="text-sm leading-tight">
                      {[r.tire_brand, r.tire_model].filter(Boolean).join(' ') || '—'}
                    </div>
                    <div className="text-xs text-muted-foreground leading-tight">
                      {r.tire_size || '—'}
                      {r.season && ` · ${r.season}`}
                      {r.quantity ? ` · ${r.quantity} szt.` : ''}
                    </div>
                  </TableCell>
                  <TableCell className="py-2">
                    {r.workshop_vehicles?.plate ? (
                      <span className="font-mono text-xs rounded border px-1.5 py-0.5">
                        {r.workshop_vehicles.plate}
                      </span>
                    ) : <span className="text-muted-foreground text-xs">—</span>}
                  </TableCell>
                  <TableCell className="text-xs py-2">{r.location_name || '—'}</TableCell>
                  <TableCell className="text-xs py-2">
                    {r.stored_at ? new Date(r.stored_at).toLocaleDateString('pl-PL') : '—'}
                  </TableCell>
                  <TableCell className={`text-xs py-2 ${reminderState(r).className}`}>
                    {reminderState(r).label}
                  </TableCell>
                  <TableCell className="py-2">
                    {r.dlug ? (
                      <div className="leading-tight">
                        <span className="text-sm font-semibold">
                          {Number(r.dlug.do_zaplaty ?? 0).toFixed(2)} zł
                        </span>
                        {r.dlug.okresow > 0 && r.okres_miesiecy && (
                          <div className="text-[11px] text-muted-foreground">
                            {r.dlug.okresow} × {Number(r.cena_za_okres).toFixed(0)} zł
                          </div>
                        )}
                        {r.dlug.dni_po_terminie > 0 && (
                          <div className="text-[11px] text-destructive">
                            {r.dlug.dni_po_terminie} dni po terminie
                          </div>
                        )}
                        {r.dlug.nieodebrane_od && (
                          <div className="text-[11px] text-amber-600">nieodebrane</div>
                        )}
                      </div>
                    ) : <span className="text-muted-foreground text-xs">—</span>}
                  </TableCell>
                  <TableCell onClick={e => e.stopPropagation()} className="text-right whitespace-nowrap">
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
                    {view === 'stored' && (r.dlug?.dni_po_terminie ?? 0) > 0 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs gap-1"
                        onClick={() => oznaczNieodebrane(r)}
                        title={r.dlug?.nieodebrane_od
                          ? 'Cofnij oznaczenie i wznów przypomnienia'
                          : 'Zatrzymaj przypomnienia — nikt się nie zgłosił'}
                      >
                        <Archive className="h-3.5 w-3.5" />
                        {r.dlug?.nieodebrane_od ? 'Cofnij' : 'Nieodebrane'}
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
      <TireStorageRulesDialog open={zasadyOtwarte} onOpenChange={setZasadyOtwarte} providerId={providerId} />
      <TireStorageDetailsDialog record={podglad} onOpenChange={(v) => !v && setPodglad(null)} providerId={providerId} />
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
        <PopoverContent
          className="w-[--radix-popover-trigger-width] p-0"
          align="start"
        >
          {/* Lista jest juz przefiltrowana wyzej. Bez `shouldFilter={false}`
              komponent filtruje ja po raz drugi po wlasnym `value` i podswietla
              przypadkowe pozycje na zolto. */}
          <Command shouldFilter={false}>
            <div onKeyDown={handleKeyDown}>
              <CommandInput placeholder={placeholder} value={query} onValueChange={setQuery} />
            </div>
            <CommandList className="max-h-[260px] overflow-y-auto">
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
                  <CommandItem key={item.id} value={item.id} onSelect={() => { onSelect(item.id); setOpen(false); setQuery(''); }}>
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
  const [trybPrzypomnienia, setTrybPrzypomnienia] = useState<'miesiace' | 'data'>('miesiace');
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
  const [bieznikLP, setBieznikLP] = useState('');
  const [bieznikPP, setBieznikPP] = useState('');
  const [bieznikLT, setBieznikLT] = useState('');
  const [bieznikPT, setBieznikPT] = useState('');

  // Roznica miedzy osiami decyduje o wymianie, a jedna wartosc na komplet
  // ja gubila. Pokazujemy ja od razu przy przyjeciu.
  const roznicaBieznika = useMemo(() => {
    const wartosci = [bieznikLP, bieznikPP, bieznikLT, bieznikPT]
      .map(v => parseFloat(v))
      .filter(v => Number.isFinite(v));
    if (wartosci.length < 2) return null;
    return Math.max(...wartosci) - Math.min(...wartosci);
  }, [bieznikLP, bieznikPP, bieznikLT, bieznikPT]);

  // Stawka z cennika dla wybranego rozmiaru i felgi. Trafiona -> podpowiadamy
  // cene i okres; nietrafiona -> zostaje recznie wpisana kwota, jak dotad.
  const { data: cennik = [] } = useTirePricing(providerId);
  const stawka = useMemo(() => {
    const r = tireSize.trim().toLowerCase();
    if (!r) return null;
    const pasujace = cennik.filter((c: any) => (c.rozmiar || '').trim().toLowerCase() === r);
    if (pasujace.length === 0) return null;
    return pasujace.find((c: any) => c.rodzaj_felgi === rimType)
        ?? pasujace.find((c: any) => c.rodzaj_felgi === 'dowolne')
        ?? null;
  }, [cennik, tireSize, rimType]);

  useEffect(() => {
    if (stawka) setStorageCost(String(stawka.cena_za_okres));
  }, [stawka]);
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
          // W trybie miesiecy termin wylicza sie z daty przyjecia i rytmu,
          // wiec nie zapisujemy przypadkowej daty z drugiego trybu.
          pickup_deadline: trybPrzypomnienia === 'data' ? (pickupDeadline || null) : null,
          storage_cost: parseFloat(storageCost) || 150,
          // Stawke zamrazamy na wpisie: pozniejsza podwyzka cennika nie moze
          // podniesc ceny klientowi, ktory zostawil opony wczesniej.
          cena_za_okres: stawka ? Number(stawka.cena_za_okres) : null,
          okres_miesiecy: stawka ? Number(stawka.okres_miesiecy) : null,
          tread_lp_mm: parseFloat(bieznikLP) || null,
          tread_pp_mm: parseFloat(bieznikPP) || null,
          tread_lt_mm: parseFloat(bieznikLT) || null,
          tread_pt_mm: parseFloat(bieznikPT) || null,
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
      // Bez tego swiezy wpis nie ma jeszcze policzonej naleznosci i w kolumnie
      // "Do zaplaty" widac zero, mimo ze cena zostala podana.
      queryClient.invalidateQueries({ queryKey: ['tire-storage-dues', providerId] });
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
              renderItem={(c: any) => (
                <span className="flex items-baseline gap-2 min-w-0">
                  <span className="truncate">
                    {c.company_name || [c.first_name, c.last_name].filter(Boolean).join(' ') || 'bez nazwy'}
                  </span>
                  {/* Imiennicy bez telefonu sa nie do odroznienia na liscie. */}
                  <span className="text-xs text-muted-foreground shrink-0">
                    {c.phone || 'brak telefonu'}
                  </span>
                </span>
              )}
              getLabel={(c: any) => c.company_name || `${c.first_name || ''} ${c.last_name || ''}`.trim()}
            />
            {!clientId && clientName && (
              <Input onFocus={e => e.currentTarget.select()} value={clientName} onChange={e => setClientName(e.target.value)} placeholder={t('workshop.tireStorage.fullName')} className="h-8" />
            )}
          </div>

          {/* Phone */}
          <div className="space-y-2">
            <Label>{t('workshop.tireStorage.phoneNumber')}</Label>
            <Input onFocus={e => e.currentTarget.select()} value={clientPhone} onChange={e => setClientPhone(e.target.value)} placeholder="np. 512 345 678" className="h-9" />
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
              renderItem={(v: any) => {
                const opis = [v.brand, v.model].filter(Boolean).join(' ');
                // Puste marka/model dawaly na liscie "null null — WY045XF".
                return opis ? `${opis} — ${v.plate || 'bez rejestracji'}` : (v.plate || 'bez rejestracji');
              }}
              getLabel={(v: any) => [v.brand, v.model, v.plate].filter(Boolean).join(' ').trim()}
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
            <Input onFocus={e => e.currentTarget.select()} type="date" value={storedAt} onChange={e => setStoredAt(e.target.value)} className="h-9" />
          </div>
          <div className="space-y-2">
            <Label>{t('workshop.tireStorage.pickupDate')}</Label>
            <Input onFocus={e => e.currentTarget.select()} type="date" value={pickupAt} onChange={e => setPickupAt(e.target.value)} className="h-9" />
          </div>

          {/* Cost */}
          <div className="space-y-2">
            <Label>{t('workshop.tireStorage.storageCost')}</Label>
            <div className="flex items-center gap-2">
              <Input onFocus={e => e.currentTarget.select()} type="number" value={storageCost} onChange={e => setStorageCost(e.target.value)} className="flex-1 h-9" />
              <span className="text-sm text-muted-foreground">{t('workshop.tireStorage.plnNet')}</span>
            </div>
            {stawka ? (
              <p className="text-xs text-emerald-600">
                Z cennika: {Number(stawka.cena_za_okres).toFixed(2)} zł za {stawka.okres_miesiecy}{' '}
                {stawka.okres_miesiecy === 1 ? 'miesiąc' : stawka.okres_miesiecy < 5 ? 'miesiące' : 'miesięcy'}
                {stawka.rodzaj_felgi === 'dowolne' && ' (stawka zapasowa dla rozmiaru)'}
                . Kolejne okresy doliczą się same.
              </p>
            ) : tireSize.trim() ? (
              <p className="text-xs text-muted-foreground">
                Brak tego rozmiaru w cenniku — kwota jednorazowa, bez doliczania kolejnych okresów.
              </p>
            ) : null}
          </div>

          {/* Przypomnienie: albo konkretna data, albo rytm w miesiacach */}
          <div className="space-y-2 md:col-span-2">
            <Label>Przypomnienie o odbiorze</Label>

            <div className="flex rounded-md border overflow-hidden w-fit">
              {([['miesiace', 'Za ile miesięcy'], ['data', 'Konkretna data']] as const).map(([w, opis]) => (
                <button
                  key={w}
                  type="button"
                  onClick={() => setTrybPrzypomnienia(w)}
                  className={`px-3 py-1.5 text-sm transition-colors ${
                    trybPrzypomnienia === w ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'
                  }`}
                >
                  {opis}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {trybPrzypomnienia === 'miesiace' ? (
                <>
                  <Select value={reminderMonths} onValueChange={setReminderMonths}>
                    <SelectTrigger className="h-9 w-40"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                        <SelectItem key={m} value={String(m)}>
                          {m} {m === 1 ? 'miesiąc' : m < 5 ? 'miesiące' : 'miesięcy'}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <span className="text-sm text-muted-foreground">od przyjęcia</span>
                </>
              ) : (
                <Input
                  type="date"
                  value={pickupDeadline}
                  onChange={e => setPickupDeadline(e.target.value)}
                  className="h-9 w-48"
                />
              )}

              <Select value={reminderChannel} onValueChange={(v) => setReminderChannel(v as any)}>
                <SelectTrigger className="h-9 w-44"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="sms">SMS-em</SelectItem>
                  <SelectItem value="email">E-mailem</SelectItem>
                  <SelectItem value="none">Bez przypomnienia</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <p className="text-[11px] text-muted-foreground">
              {trybPrzypomnienia === 'miesiace'
                ? 'Pierwsze przypomnienie po tym czasie, kolejne w tym samym rytmie.'
                : 'Przypomnienie przed tą datą, kolejne co ' + reminderMonths + ' mies.'}
              {' '}Po wydaniu kompletu przestają wychodzić. Historia wysyłek jest w szczegółach wpisu.
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
            <Input onFocus={e => e.currentTarget.select()} value={employeeName} onChange={e => setEmployeeName(e.target.value)} placeholder={t('workshop.tireStorage.fullName')} className="h-9" />
          </div>
        </div>

        {/* Tire details */}
        <div className="mt-6">
          <h3 className="font-semibold text-lg mb-3">{t('workshop.tireStorage.tireDetails')}</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">{t('workshop.tireStorage.tireBrand')}</Label>
              <Input onFocus={e => e.currentTarget.select()} value={tireBrand} onChange={e => setTireBrand(e.target.value)} placeholder="Continental" className="h-8" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t('workshop.tireStorage.tireModel')}</Label>
              <Input onFocus={e => e.currentTarget.select()} value={tireModel} onChange={e => setTireModel(e.target.value)} placeholder="PremiumContact 6" className="h-8" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t('workshop.tireStorage.size')}</Label>
              <Input onFocus={e => e.currentTarget.select()} value={tireSize} onChange={e => setTireSize(e.target.value)} placeholder="205/55R16" className="h-8" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t('workshop.tireStorage.dotCode')}</Label>
              <Input onFocus={e => e.currentTarget.select()} value={dotCode} onChange={e => setDotCode(e.target.value)} placeholder="3325" maxLength={4} className="h-8" />
            </div>
            <div className="space-y-1 col-span-2">
              <Label className="text-xs">Bieżnik na każdą oponę (mm)</Label>
              <div className="grid grid-cols-4 gap-1.5">
                {([
                  ['lp', 'Lewa przód', bieznikLP, setBieznikLP],
                  ['pp', 'Prawa przód', bieznikPP, setBieznikPP],
                  ['lt', 'Lewa tył', bieznikLT, setBieznikLT],
                  ['pt', 'Prawa tył', bieznikPT, setBieznikPT],
                ] as const).map(([klucz, opis, wartosc, ustaw]) => (
                  <div key={klucz}>
                    <Input
                      onFocus={e => e.currentTarget.select()}
                      type="number" step="0.5" min={0} max={20}
                      value={wartosc}
                      onChange={e => ustaw(e.target.value)}
                      placeholder={klucz.toUpperCase()}
                      title={opis}
                      className="h-8 text-center"
                    />
                    <p className="text-[10px] text-muted-foreground text-center mt-0.5">{opis}</p>
                  </div>
                ))}
              </div>
              {roznicaBieznika !== null && roznicaBieznika >= 3 && (
                <p className="text-[11px] text-amber-600">
                  Różnica {roznicaBieznika.toFixed(1)} mm między oponami — warto pokazać klientowi.
                </p>
              )}
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t('workshop.tireStorage.rimType')}</Label>
              <Select value={rimType || 'brak'} onValueChange={v => setRimType(v === 'brak' ? '' : v)}>
                <SelectTrigger className="h-8"><SelectValue placeholder="wybierz" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="brak">— nie podano —</SelectItem>
                  {RODZAJE_FELG.filter(r => r.value !== 'dowolne').map(r => (
                    <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t('workshop.tireStorage.rimManufacturer')}</Label>
              <Input onFocus={e => e.currentTarget.select()} value={rimManufacturer} onChange={e => setRimManufacturer(e.target.value)} placeholder="OZ Racing" className="h-8" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t('workshop.tireStorage.quantity')}</Label>
              <Input onFocus={e => e.currentTarget.select()} type="number" value={quantity} onChange={e => setQuantity(e.target.value)} className="h-8" />
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
            <Input onFocus={e => e.currentTarget.select()} value={newTaskName} onChange={e => setNewTaskName(e.target.value)} placeholder={t('workshop.tireStorage.taskNamePlaceholder')} className="flex-1 h-8" onKeyDown={e => e.key === 'Enter' && addTask()} />
            <Input onFocus={e => e.currentTarget.select()} type="number" value={newTaskPrice} onChange={e => setNewTaskPrice(e.target.value)} placeholder={t('workshop.tireStorage.pricePlaceholder')} className="w-24 h-8" onKeyDown={e => e.key === 'Enter' && addTask()} />
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
