import { useState, useEffect, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  Download,
  Building2,
  Settings,
  Users,
  Banknote,
  Truck,
  Search,
  Edit,
  Check,
} from 'lucide-react';
import { format } from 'date-fns';

interface BankTransferExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fleetId: string;
  settlements: Array<{
    driver_id: string;
    driver_name: string;
    final_payout: number;
  }>;
  periodLabel: string;
  weekStart?: string;
}

interface BankFormat {
  id: string;
  name: string;
  shortName: string;
  extension: string;
  generate: (rows: TransferRow[], senderAccount: string, date: string) => string;
}

interface TransferRow {
  iban: string;
  amount: number;
  name: string;
  title: string;
}

interface DriverRow {
  id: string;
  name: string;
  payout: number;
  iban: string;
  paymentMode: 'transfer' | 'cash' | 'fleet';
  fleetId?: string;
  fleetName?: string;
  contractNumber?: string | null;
  billingMethod?: string;
  selected: boolean;
}

interface FleetOption {
  id: string;
  name: string;
  iban?: string;
}

// ── Format generators ──

function generateElixir0(rows: TransferRow[], senderAccount: string, dateStr: string): string {
  const cleanAccount = senderAccount.replace(/\s/g, '').replace(/^PL/i, '');
  const lines: string[] = [];
  lines.push('4120414|1');
  for (const r of rows) {
    const recipientAccount = r.iban.replace(/\s/g, '').replace(/^PL/i, '');
    const amountStr = r.amount.toFixed(2).replace('.', ',');
    lines.push(`1|${cleanAccount}|${recipientAccount}|${r.name}|Adres odbiorcy|${amountStr}|1|${r.title}|${dateStr}|`);
  }
  return lines.join('\n');
}

function generateCSV(rows: TransferRow[], sep: string, _senderAccount: string): string {
  return rows.map(r => {
    const amountStr = r.amount.toFixed(2).replace('.', ',');
    return `${r.iban.replace(/\s/g, '')}${sep}${amountStr}${sep}${r.name}${sep}${r.title}`;
  }).join('\n');
}

const POLISH_BANKS: BankFormat[] = [
  {
    id: 'santander',
    name: 'Santander Bank Polska (Elixir-0)',
    shortName: 'Santander',
    extension: 'txt',
    generate: (rows, sender, _date) => {
      const d = format(new Date(), 'dd-MM-yyyy');
      return generateElixir0(rows, sender, d);
    },
  },
  {
    id: 'mbank',
    name: 'mBank',
    shortName: 'mBank',
    extension: 'csv',
    generate: (rows) => rows.map(r => {
      const a = r.amount.toFixed(2).replace('.', ',');
      return `${r.iban.replace(/\s/g, '')};${a};${r.name};;${r.title}`;
    }).join('\n'),
  },
  {
    id: 'pko_bp',
    name: 'PKO Bank Polski',
    shortName: 'PKO BP',
    extension: 'csv',
    generate: (rows) => generateCSV(rows, ';', ''),
  },
  {
    id: 'ing',
    name: 'ING Bank Śląski',
    shortName: 'ING',
    extension: 'csv',
    generate: (rows) => rows.map(r => {
      const a = r.amount.toFixed(2).replace('.', ',');
      return `${r.iban.replace(/\s/g, '')};${a};PLN;${r.name};${r.title}`;
    }).join('\n'),
  },
  {
    id: 'universal',
    name: 'Format uniwersalny (CSV)',
    shortName: 'CSV',
    extension: 'csv',
    generate: (rows) => {
      const header = 'Odbiorca;IBAN;Kwota;Tytuł';
      const body = rows.map(r => {
        const a = r.amount.toFixed(2).replace('.', ',');
        return `${r.name};${r.iban.replace(/\s/g, '')};${a};${r.title}`;
      }).join('\n');
      return header + '\n' + body;
    },
  },
];

function maskIban(iban: string): string {
  const clean = iban.replace(/\s/g, '');
  if (clean.length < 8) return '••••••••••••••••••••••••••';
  return '••' + clean.slice(2, 6) + '••••••••••••••' + clean.slice(-4);
}

export function BankTransferExportDialog({
  open,
  onOpenChange,
  fleetId,
  settlements,
  periodLabel,
  weekStart,
}: BankTransferExportDialogProps) {
  const [selectedBank, setSelectedBank] = useState('santander');
  const [senderAccount, setSenderAccount] = useState('');
  const [savedSenderAccount, setSavedSenderAccount] = useState('');
  const [editingSender, setEditingSender] = useState(false);
  const [loading, setLoading] = useState(false);
  const [driverRows, setDriverRows] = useState<DriverRow[]>([]);
  const [fleetOptions, setFleetOptions] = useState<FleetOption[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('drivers');
  const [showSettings, setShowSettings] = useState(false);
  const [defaultTitle, setDefaultTitle] = useState('wynajem auta');

  useEffect(() => {
    if (!open) return;
    loadData();
  }, [open, fleetId]);

  const loadData = async () => {
    setLoading(true);
    try {
      // Load fleet sender account & settings
      const { data: fleetData } = await supabase
        .from('fleets')
        .select('*')
        .eq('id', fleetId)
        .single();

      if (fleetData) {
        const saved = fleetData.sender_bank_account || '';
        setSenderAccount(saved);
        setSavedSenderAccount(saved);
        setEditingSender(!saved); // If no account saved, start in edit mode
        setDefaultTitle(fleetData.transfer_title_template || 'wynajem auta');
      }

      // Load ONLY partner fleets (not all fleets!) for fleet assignment
      const { data: partnerships } = await supabase
        .from('driver_fleet_partnerships')
        .select('partner_fleet_id, fleets!driver_fleet_partnerships_partner_fleet_id_fkey(id, name, sender_bank_account)')
        .eq('managing_fleet_id', fleetId)
        .eq('is_active', true);

      const partnerFleets: FleetOption[] = [];
      const seenIds = new Set<string>();
      for (const p of (partnerships || [])) {
        const f = (p as any).fleets;
        if (f && !seenIds.has(f.id)) {
          seenIds.add(f.id);
          partnerFleets.push({ id: f.id, name: f.name, iban: f.sender_bank_account || '' });
        }
      }
      setFleetOptions(partnerFleets);

      // Load drivers
      const { data: driversData } = await supabase
        .from('drivers')
        .select('id, first_name, last_name, iban, bank_account, payment_method, billing_method, fleet_id')
        .eq('fleet_id', fleetId);

      // Load signed contracts
      const { data: contracts } = await supabase
        .from('driver_document_requests')
        .select('driver_id, contract_number')
        .eq('fleet_id', fleetId)
        .eq('template_code', 'RENTAL_CONTRACT')
        .eq('status', 'signed');

      const contractMap = new Map((contracts || []).map((c: any) => [c.driver_id, c.contract_number]));

      const driverMap = new Map((driversData || []).map(d => [d.id, d]));

      const rows: DriverRow[] = settlements
        .filter(s => s.final_payout > 0)
        .map(s => {
          const driver = driverMap.get(s.driver_id);
          const existingIban = getCleanIban(driver);
          const pm = driver?.payment_method || 'transfer';

          return {
            id: s.driver_id,
            name: `${driver?.first_name || ''} ${driver?.last_name || ''}`.trim() || s.driver_name,
            payout: s.final_payout,
            iban: existingIban || driver?.iban || '',
            paymentMode: (pm === 'cash' ? 'cash' : pm === 'fleet' ? 'fleet' : 'transfer') as 'transfer' | 'cash' | 'fleet',
            fleetId: undefined,
            fleetName: undefined,
            contractNumber: contractMap.get(s.driver_id) || null,
            billingMethod: driver?.billing_method || '',
            selected: pm === 'transfer' && !!existingIban,
          };
        })
        .sort((a, b) => a.name.localeCompare(b.name, 'pl'));

      setDriverRows(rows);
    } catch (e) {
      console.error('Error loading transfer data:', e);
    } finally {
      setLoading(false);
    }
  };

  const getCleanIban = (driver: any) => {
    const iban = (driver?.iban || '').replace(/\s/g, '');
    const bankAccount = (driver?.bank_account || '').replace(/\s/g, '');
    return iban.length >= 20 ? iban : bankAccount.length >= 20 ? bankAccount : '';
  };

  const getTransferTitle = (row: DriverRow): string => {
    if (row.billingMethod === 'b2b' || row.billingMethod === 'B2B') {
      return 'zaliczka na fakture';
    }
    if (row.contractNumber) {
      return `wynajem auta umowa nr ${row.contractNumber}`;
    }
    return defaultTitle || 'wynajem auta';
  };

  const updateDriverRow = (id: string, updates: Partial<DriverRow>) => {
    setDriverRows(prev => prev.map(r => r.id === id ? { ...r, ...updates } : r));
  };

  const saveIban = async (driverId: string, iban: string) => {
    const clean = iban.replace(/\s/g, '');
    if (clean.length >= 20) {
      await supabase.from('drivers').update({ iban: clean, bank_account: clean } as any).eq('id', driverId);
    }
  };

  const handleSaveSenderAccount = async () => {
    await supabase.from('fleets').update({ sender_bank_account: senderAccount }).eq('id', fleetId);
    setSavedSenderAccount(senderAccount);
    setEditingSender(false);
    toast.success('Zapisano nr konta nadawcy');
  };

  const filteredDrivers = useMemo(() => {
    if (!searchQuery) return driverRows;
    const q = searchQuery.toLowerCase();
    return driverRows.filter(r => r.name.toLowerCase().includes(q));
  }, [driverRows, searchQuery]);

  const fleetGroupedDrivers = useMemo(() => {
    const groups: Record<string, { fleet: FleetOption; drivers: DriverRow[]; total: number }> = {};
    for (const r of driverRows) {
      if (r.paymentMode === 'fleet' && r.fleetId) {
        if (!groups[r.fleetId]) {
          const fo = fleetOptions.find(f => f.id === r.fleetId);
          groups[r.fleetId] = { fleet: fo || { id: r.fleetId, name: r.fleetName || 'Nieznana' }, drivers: [], total: 0 };
        }
        groups[r.fleetId].drivers.push(r);
        groups[r.fleetId].total += r.payout;
      }
    }
    return Object.values(groups);
  }, [driverRows, fleetOptions]);

  const transferRows = driverRows.filter(r => r.paymentMode === 'transfer' && r.selected);
  const cashRows = driverRows.filter(r => r.paymentMode === 'cash');
  const fleetRows = driverRows.filter(r => r.paymentMode === 'fleet');
  const transferTotal = transferRows.reduce((s, r) => s + r.payout, 0);
  const fleetTotal = fleetRows.reduce((s, r) => s + r.payout, 0);

  const handleExport = async () => {
    if (!senderAccount.replace(/\s/g, '')) {
      toast.error('Wprowadź nr konta nadawcy (floty)');
      return;
    }

    const bank = POLISH_BANKS.find(b => b.id === selectedBank) || POLISH_BANKS[0];

    // Save sender account
    await supabase.from('fleets').update({ sender_bank_account: senderAccount }).eq('id', fleetId);

    // Persist IBAN / payment_method changes
    for (const row of driverRows) {
      const updates: any = {};
      if (row.paymentMode === 'cash') updates.payment_method = 'cash';
      else if (row.paymentMode === 'fleet') updates.payment_method = 'fleet';
      else updates.payment_method = 'transfer';

      const cleanIban = row.iban.replace(/\s/g, '');
      if (cleanIban.length >= 20) {
        updates.iban = cleanIban;
        updates.bank_account = cleanIban;
      }
      await supabase.from('drivers').update(updates).eq('id', row.id);
    }

    const individualTransfers: TransferRow[] = transferRows
      .filter(r => r.iban.replace(/\s/g, '').length >= 20)
      .map(r => ({
        iban: r.iban,
        amount: r.payout,
        name: r.name,
        title: getTransferTitle(r),
      }));

    for (const group of fleetGroupedDrivers) {
      const fleetIban = group.fleet.iban;
      if (fleetIban && fleetIban.replace(/\s/g, '').length >= 20) {
        individualTransfers.push({
          iban: fleetIban,
          amount: group.total,
          name: group.fleet.name,
          title: `rozliczenie floty ${periodLabel}`,
        });
      }
    }

    if (individualTransfers.length === 0) {
      toast.info('Brak przelewów do wygenerowania');
      return;
    }

    const dateStr = weekStart ? format(new Date(weekStart), 'dd-MM-yyyy') : format(new Date(), 'dd-MM-yyyy');
    const content = bank.generate(individualTransfers, senderAccount, dateStr);

    const mondayDate = weekStart
      ? format(new Date(weekStart), 'dd.MM.yyyy')
      : format(new Date(), 'dd.MM.yyyy');

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${mondayDate}_Przelewy_${bank.shortName}.${bank.extension}`;
    link.click();

    toast.success(`Wygenerowano ${individualTransfers.length} przelewów (${bank.name})`);
    onOpenChange(false);
  };

  const selectAllTransfer = (checked: boolean) => {
    setDriverRows(prev => prev.map(r => r.paymentMode === 'transfer' ? { ...r, selected: checked } : r));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Generuj przelewy
          </DialogTitle>
          <DialogDescription>
            Zarządzaj wypłatami kierowców: przelew, gotówka lub flota. Okres: {periodLabel}
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="drivers" className="gap-1.5">
              <Users className="h-4 w-4" />
              Kierowcy ({driverRows.length})
            </TabsTrigger>
            <TabsTrigger value="fleets" className="gap-1.5">
              <Truck className="h-4 w-4" />
              Floty ({fleetGroupedDrivers.length})
            </TabsTrigger>
          </TabsList>

          {/* ── TAB: KIEROWCY ── */}
          <TabsContent value="drivers" className="space-y-3 mt-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Szukaj kierowcy..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="pl-8 h-8 text-sm"
              />
            </div>

            <div className="flex flex-wrap gap-2 text-xs">
              <Badge variant="outline" className="gap-1">
                <Banknote className="h-3 w-3" />
                Przelewy: {transferRows.length} = {transferTotal.toFixed(2)} zł
              </Badge>
              <Badge variant="secondary" className="gap-1">
                Gotówka: {cashRows.length}
              </Badge>
              <Badge variant="secondary" className="gap-1">
                <Truck className="h-3 w-3" />
                Floty: {fleetRows.length} = {fleetTotal.toFixed(2)} zł
              </Badge>
            </div>

            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Checkbox
                checked={transferRows.length > 0 && transferRows.length === driverRows.filter(r => r.paymentMode === 'transfer').length}
                onCheckedChange={(c) => selectAllTransfer(!!c)}
              />
              <span>Zaznacz wszystkich (przelew)</span>
            </div>

            <div className="space-y-1 max-h-[350px] overflow-y-auto pr-1">
              {filteredDrivers.map(row => (
                <div
                  key={row.id}
                  className="flex items-center gap-2 p-2 rounded-lg border text-xs hover:bg-muted/50 transition-colors"
                >
                  <Checkbox
                    checked={row.selected && row.paymentMode === 'transfer'}
                    disabled={row.paymentMode !== 'transfer'}
                    onCheckedChange={c => updateDriverRow(row.id, { selected: !!c })}
                  />

                  <span className="w-[130px] truncate font-medium">{row.name}</span>

                  <span className="w-[70px] text-right font-semibold text-primary">
                    {row.payout.toFixed(2)} zł
                  </span>

                  <Input
                    placeholder="Nr konta (26 cyfr)"
                    value={row.iban}
                    onChange={e => updateDriverRow(row.id, { iban: e.target.value })}
                    onBlur={() => saveIban(row.id, row.iban)}
                    disabled={row.paymentMode !== 'transfer'}
                    className="h-7 text-xs flex-1 min-w-[140px] font-mono"
                  />

                  <Select
                    value={row.paymentMode}
                    onValueChange={(v: 'transfer' | 'cash' | 'fleet') => {
                      updateDriverRow(row.id, {
                        paymentMode: v,
                        selected: v === 'transfer' && row.iban.replace(/\s/g, '').length >= 20,
                      });
                    }}
                  >
                    <SelectTrigger className="h-7 w-[100px] text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="transfer">Przelew</SelectItem>
                      <SelectItem value="cash">Gotówka</SelectItem>
                      <SelectItem value="fleet">Flota</SelectItem>
                    </SelectContent>
                  </Select>

                  {/* Fleet selector - only partner fleets */}
                  {row.paymentMode === 'fleet' && (
                    <Select
                      value={row.fleetId || ''}
                      onValueChange={v => {
                        const fleet = fleetOptions.find(f => f.id === v);
                        updateDriverRow(row.id, { fleetId: v, fleetName: fleet?.name });
                      }}
                    >
                      <SelectTrigger className="h-7 w-[110px] text-xs">
                        <SelectValue placeholder="Wybierz..." />
                      </SelectTrigger>
                      <SelectContent>
                        {fleetOptions.length === 0 ? (
                          <div className="p-2 text-xs text-muted-foreground text-center">
                            Brak flot partnerskich. Dodaj w zakładce "Floty partnerskie".
                          </div>
                        ) : (
                          fleetOptions.map(f => (
                            <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              ))}
            </div>
          </TabsContent>

          {/* ── TAB: FLOTY ── */}
          <TabsContent value="fleets" className="space-y-3 mt-3">
            {fleetGroupedDrivers.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                <Truck className="h-10 w-10 mx-auto mb-2 opacity-40" />
                <p>Brak kierowców przypisanych do flot</p>
                <p className="text-xs mt-1">Zmień tryb wypłaty na "Flota" w zakładce Kierowcy</p>
              </div>
            ) : (
              fleetGroupedDrivers.map(group => (
                <div key={group.fleet.id} className="border rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Truck className="h-4 w-4 text-primary" />
                      <span className="font-semibold text-sm">{group.fleet.name}</span>
                      <Badge variant="outline" className="text-xs">
                        {group.drivers.length} kierowców
                      </Badge>
                    </div>
                    <span className="font-bold text-primary">
                      {group.total.toFixed(2)} zł
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <Label className="text-xs whitespace-nowrap">Nr konta floty:</Label>
                    <Input
                      placeholder="Nr konta floty (26 cyfr)"
                      value={group.fleet.iban || ''}
                      onChange={e => {
                        const newIban = e.target.value;
                        setFleetOptions(prev => prev.map(f => f.id === group.fleet.id ? { ...f, iban: newIban } : f));
                      }}
                      className="h-7 text-xs font-mono flex-1"
                    />
                  </div>

                  <div className="space-y-1 pl-4 border-l-2 border-muted">
                    {group.drivers.map(d => (
                      <div key={d.id} className="flex items-center justify-between text-xs py-1">
                        <span>{d.name}</span>
                        <span className="font-medium">{d.payout.toFixed(2)} zł</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </TabsContent>
        </Tabs>

        {/* ── BANK & SENDER SETTINGS ── */}
        <div className="space-y-3 border-t pt-3 mt-2">
          {/* Sender account - saved mode with mask */}
          <div className="space-y-1.5">
            <Label className="text-xs">Nr konta nadawcy (Twojej floty)</Label>
            {savedSenderAccount && !editingSender ? (
              <div className="flex items-center gap-2">
                <div className="flex-1 px-3 py-2 rounded-md border bg-muted/30 font-mono text-sm text-muted-foreground">
                  {maskIban(savedSenderAccount)}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1 h-8"
                  onClick={() => setEditingSender(true)}
                >
                  <Edit className="h-3.5 w-3.5" />
                  Edytuj
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Input
                  placeholder="00000000000000000000000000"
                  value={senderAccount}
                  onChange={e => setSenderAccount(e.target.value)}
                  className="font-mono text-sm flex-1"
                />
                <Button
                  variant="default"
                  size="sm"
                  className="gap-1 h-8"
                  onClick={handleSaveSenderAccount}
                  disabled={!senderAccount.replace(/\s/g, '')}
                >
                  <Check className="h-3.5 w-3.5" />
                  Zapisz
                </Button>
              </div>
            )}
          </div>

          {/* Bank selection */}
          <div className="space-y-1.5">
            <Label className="text-xs">Format banku</Label>
            <Select value={selectedBank} onValueChange={setSelectedBank}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {POLISH_BANKS.map(b => (
                  <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Preview */}
          <div className="p-2 bg-muted/50 rounded text-xs text-muted-foreground">
            Do wygenerowania: <strong>{transferRows.length}</strong> przelewów indywidualnych
            {fleetGroupedDrivers.length > 0 && (
              <> + <strong>{fleetGroupedDrivers.length}</strong> przelewów flotowych</>
            )}
            {' '}= <strong>{(transferTotal + fleetTotal).toFixed(2)} zł</strong>
          </div>
        </div>

        <div className="flex justify-between items-center pt-2">
          <Button
            variant="ghost"
            size="sm"
            className="text-xs gap-1"
            onClick={() => setShowSettings(!showSettings)}
          >
            <Settings className="h-3 w-3" />
            {showSettings ? 'Ukryj' : 'Ustawienia'}
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Anuluj
            </Button>
            <Button onClick={handleExport} disabled={loading} className="gap-2">
              <Download className="h-4 w-4" />
              {loading ? 'Generowanie...' : 'Pobierz plik przelewów'}
            </Button>
          </div>
        </div>

        {showSettings && (
          <div className="p-3 bg-muted rounded-lg space-y-2 text-sm">
            <Label className="text-xs">Domyślny tytuł przelewu</Label>
            <Input
              value={defaultTitle}
              onChange={e => setDefaultTitle(e.target.value)}
              placeholder="wynajem auta"
              className="text-sm"
            />
            <Button size="sm" onClick={async () => {
              await supabase.from('fleets').update({ transfer_title_template: defaultTitle }).eq('id', fleetId);
              toast.success('Zapisano ustawienia');
              setShowSettings(false);
            }}>
              Zapisz ustawienia
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
