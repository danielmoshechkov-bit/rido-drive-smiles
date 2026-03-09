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
  FileText,
  Coins,
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

interface TransferRow {
  iban: string;
  amount: number;
  name: string;
  title: string;
}

interface DriverRow {
  id: string;
  name: string;
  displayName: string; // name used in transfer file (company name for B2B)
  payout: number;
  iban: string;
  paymentMode: 'transfer' | 'cash' | 'fleet';
  fleetId?: string;
  fleetName?: string;
  contractNumber?: string | null;
  billingMethod?: string;
  b2bEnabled?: boolean;
  b2bCompanyName?: string;
  b2bVatPayer?: boolean;
  selected: boolean;
}

interface FleetOption {
  id: string;
  name: string;
  iban?: string;
}

// ── Helpers ──

/** Strip Polish diacritics and other non-ASCII chars for bank transfer files */
function stripDiacritics(str: string): string {
  const map: Record<string, string> = {
    'ą': 'a', 'ć': 'c', 'ę': 'e', 'ł': 'l', 'ń': 'n', 'ó': 'o', 'ś': 's', 'ź': 'z', 'ż': 'z',
    'Ą': 'A', 'Ć': 'C', 'Ę': 'E', 'Ł': 'L', 'Ń': 'N', 'Ó': 'O', 'Ś': 'S', 'Ź': 'Z', 'Ż': 'Z',
  };
  return str.replace(/[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/g, ch => map[ch] || ch)
    .replace(/[^\x20-\x7E]/g, ''); // remove any remaining non-ASCII
}

// ── Format generators ──

function generateElixir0(rows: TransferRow[], senderAccount: string, dateStr: string): string {
  const cleanAccount = senderAccount.replace(/\s/g, '').replace(/^PL/i, '');
  const lines: string[] = [];
  lines.push('4120414|1');
  for (const r of rows) {
    const recipientAccount = r.iban.replace(/\s/g, '').replace(/^PL/i, '');
    const amountStr = r.amount.toFixed(2).replace('.', ',');
    const name = stripDiacritics(r.name);
    const title = stripDiacritics(r.title);
    lines.push(`1|${cleanAccount}|${recipientAccount}|${name}|Adres odbiorcy|${amountStr}|1|${title}|${dateStr}|`);
  }
  return lines.join('\n');
}

interface BankFormat {
  id: string;
  name: string;
  shortName: string;
  extension: string;
  generate: (rows: TransferRow[], senderAccount: string, date: string) => string;
}

const POLISH_BANKS: BankFormat[] = [
  {
    id: 'santander',
    name: 'Santander Bank Polska (Elixir-0)',
    shortName: 'Santander',
    extension: 'txt',
    generate: (rows, sender) => {
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
      return `${r.iban.replace(/\s/g, '')};${a};${stripDiacritics(r.name)};;${stripDiacritics(r.title)}`;
    }).join('\n'),
  },
  {
    id: 'pko_bp',
    name: 'PKO Bank Polski',
    shortName: 'PKO BP',
    extension: 'csv',
    generate: (rows) => rows.map(r => {
      const a = r.amount.toFixed(2).replace('.', ',');
      return `${r.iban.replace(/\s/g, '')};${a};${stripDiacritics(r.name)};${stripDiacritics(r.title)}`;
    }).join('\n'),
  },
  {
    id: 'ing',
    name: 'ING Bank Śląski',
    shortName: 'ING',
    extension: 'csv',
    generate: (rows) => rows.map(r => {
      const a = r.amount.toFixed(2).replace('.', ',');
      return `${r.iban.replace(/\s/g, '')};${a};PLN;${stripDiacritics(r.name)};${stripDiacritics(r.title)}`;
    }).join('\n'),
  },
  {
    id: 'universal',
    name: 'Format uniwersalny (CSV)',
    shortName: 'CSV',
    extension: 'csv',
    generate: (rows) => {
      const header = 'Odbiorca;IBAN;Kwota;Tytul';
      const body = rows.map(r => {
        const a = r.amount.toFixed(2).replace('.', ',');
        return `${stripDiacritics(r.name)};${r.iban.replace(/\s/g, '')};${a};${stripDiacritics(r.title)}`;
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
  const [activeTab, setActiveTab] = useState('transfers');
  const [showSettings, setShowSettings] = useState(false);
  const [defaultTitle, setDefaultTitle] = useState('wynajem auta');

  useEffect(() => {
    if (!open) return;
    loadData();
  }, [open, fleetId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const { data: fleetData } = await supabase
        .from('fleets')
        .select('*')
        .eq('id', fleetId)
        .single();

      if (fleetData) {
        const saved = fleetData.sender_bank_account || '';
        setSenderAccount(saved);
        setSavedSenderAccount(saved);
        setEditingSender(!saved);
        setDefaultTitle(fleetData.transfer_title_template || 'wynajem auta');
      }

      // Load ONLY partner fleets
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

      const { data: driversData } = await supabase
        .from('drivers')
        .select('id, first_name, last_name, iban, bank_account, payment_method, billing_method, fleet_id, b2b_enabled, b2b_company_name, b2b_vat_payer')
        .eq('fleet_id', fleetId);

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
          const driver = driverMap.get(s.driver_id) as any;
          const existingIban = getCleanIban(driver);
          const pm = driver?.payment_method || 'transfer';
          const personalName = `${driver?.first_name || ''} ${driver?.last_name || ''}`.trim() || s.driver_name;
          const isB2B = !!(driver?.b2b_enabled);
          const companyName = driver?.b2b_company_name || '';

          return {
            id: s.driver_id,
            name: personalName,
            displayName: isB2B && companyName ? companyName : personalName,
            payout: s.final_payout,
            iban: existingIban || driver?.iban || '',
            paymentMode: (pm === 'cash' ? 'cash' : pm === 'fleet' ? 'fleet' : 'transfer') as DriverRow['paymentMode'],
            fleetId: undefined,
            fleetName: undefined,
            contractNumber: contractMap.get(s.driver_id) || null,
            billingMethod: driver?.billing_method || '',
            b2bEnabled: isB2B,
            b2bCompanyName: companyName,
            b2bVatPayer: !!(driver?.b2b_vat_payer),
            selected: false,
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

  // Filtered by search
  const filteredDrivers = useMemo(() => {
    if (!searchQuery) return driverRows;
    const q = searchQuery.toLowerCase();
    return driverRows.filter(r => r.name.toLowerCase().includes(q));
  }, [driverRows, searchQuery]);

  // Grouped views
  const transferDrivers = useMemo(() => filteredDrivers.filter(r => r.paymentMode === 'transfer'), [filteredDrivers]);
  const cashDrivers = useMemo(() => filteredDrivers.filter(r => r.paymentMode === 'cash'), [filteredDrivers]);
  const fleetDrivers = useMemo(() => filteredDrivers.filter(r => r.paymentMode === 'fleet'), [filteredDrivers]);

  const fleetGroupedDrivers = useMemo(() => {
    const groups: Record<string, { fleet: FleetOption; drivers: DriverRow[]; total: number }> = {};
    for (const r of driverRows.filter(d => d.paymentMode === 'fleet' && d.fleetId)) {
      if (!groups[r.fleetId!]) {
        const fo = fleetOptions.find(f => f.id === r.fleetId);
        groups[r.fleetId!] = { fleet: fo || { id: r.fleetId!, name: r.fleetName || 'Nieznana' }, drivers: [], total: 0 };
      }
      groups[r.fleetId!].drivers.push(r);
      groups[r.fleetId!].total += r.payout;
    }
    return Object.values(groups);
  }, [driverRows, fleetOptions]);

  // Stats
  const selectedTransfers = driverRows.filter(r => r.paymentMode === 'transfer' && r.selected);
  const selectedCash = driverRows.filter(r => r.paymentMode === 'cash' && r.selected);
  const selectedFleetGroups = fleetGroupedDrivers.filter(g => g.drivers.some(d => d.selected));
  const transferTotal = selectedTransfers.reduce((s, r) => s + r.payout, 0);
  const cashTotal = selectedCash.reduce((s, r) => s + r.payout, 0);
  const fleetTotal = fleetGroupedDrivers.reduce((s, g) => s + g.total, 0);

  const selectAll = (mode: 'transfer' | 'cash' | 'fleet', checked: boolean) => {
    setDriverRows(prev => prev.map(r => r.paymentMode === mode ? { ...r, selected: checked } : r));
  };

  // ── EXPORT: bank transfers ──
  const handleExportTransfers = async () => {
    if (!senderAccount.replace(/\s/g, '')) {
      toast.error('Wprowadź nr konta nadawcy (floty)');
      return;
    }
    const bank = POLISH_BANKS.find(b => b.id === selectedBank) || POLISH_BANKS[0];
    await supabase.from('fleets').update({ sender_bank_account: senderAccount }).eq('id', fleetId);

    // Persist payment methods
    for (const row of selectedTransfers) {
      const updates: any = { payment_method: 'transfer' };
      const cleanIban = row.iban.replace(/\s/g, '');
      if (cleanIban.length >= 20) {
        updates.iban = cleanIban;
        updates.bank_account = cleanIban;
      }
      await supabase.from('drivers').update(updates).eq('id', row.id);
    }

    const transfers: TransferRow[] = selectedTransfers
      .filter(r => r.iban.replace(/\s/g, '').length >= 20)
      .map(r => ({ iban: r.iban, amount: r.payout, name: r.name, title: getTransferTitle(r) }));

    // Add fleet aggregate transfers
    for (const group of fleetGroupedDrivers) {
      if (group.drivers.some(d => d.selected)) {
        const fleetIban = group.fleet.iban;
        if (fleetIban && fleetIban.replace(/\s/g, '').length >= 20) {
          transfers.push({
            iban: fleetIban,
            amount: group.total,
            name: group.fleet.name,
            title: 'zaliczka na fakture',
          });
        }
      }
    }

    if (transfers.length === 0) {
      toast.info('Brak przelewów do wygenerowania');
      return;
    }

    const dateStr = weekStart ? format(new Date(weekStart), 'dd-MM-yyyy') : format(new Date(), 'dd-MM-yyyy');
    const content = bank.generate(transfers, senderAccount, dateStr);
    const mondayDate = weekStart ? format(new Date(weekStart), 'dd.MM.yyyy') : format(new Date(), 'dd.MM.yyyy');
    downloadFile(content, `${mondayDate}_Przelewy_${bank.shortName}.${bank.extension}`);
    toast.success(`Wygenerowano ${transfers.length} przelewów (${bank.name})`);
  };

  // ── EXPORT: cash list (KW) ──
  const handleExportCashList = () => {
    if (selectedCash.length === 0) {
      toast.info('Zaznacz kierowców do listy gotówkowej');
      return;
    }

    const mondayDate = weekStart ? format(new Date(weekStart), 'dd.MM.yyyy') : format(new Date(), 'dd.MM.yyyy');
    const lines = [
      `LISTA WYPŁAT GOTÓWKOWYCH - KW`,
      `Okres: ${periodLabel}`,
      `Data: ${mondayDate}`,
      ``,
      `Lp.;Imię i nazwisko;Kwota;Podpis`,
    ];
    selectedCash.forEach((r, i) => {
      lines.push(`${i + 1};${r.name};${r.payout.toFixed(2)} zł;`);
    });
    lines.push(``);
    lines.push(`RAZEM: ${cashTotal.toFixed(2)} zł`);
    lines.push(`Liczba wypłat: ${selectedCash.length}`);

    downloadFile(lines.join('\n'), `${mondayDate}_Wyplaty_KW.csv`);

    // Persist cash payment methods
    for (const row of selectedCash) {
      supabase.from('drivers').update({ payment_method: 'cash' } as any).eq('id', row.id);
    }

    toast.success(`Wygenerowano listę KW: ${selectedCash.length} wypłat`);
  };

  const downloadFile = (content: string, filename: string) => {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
  };

  // ── Render: driver row ──
  const formatIbanDisplay = (iban: string): string => {
    const clean = iban.replace(/\s/g, '').replace(/[^0-9]/g, '');
    if (!clean) return '';
    const parts: string[] = [];
    parts.push(clean.slice(0, 2));
    let rest = clean.slice(2);
    while (rest.length > 0) {
      parts.push(rest.slice(0, 4));
      rest = rest.slice(4);
    }
    return parts.join(' ');
  };

  const handleIbanChange = (id: string, rawValue: string) => {
    const digitsOnly = rawValue.replace(/[^0-9]/g, '').slice(0, 26);
    updateDriverRow(id, { iban: digitsOnly });
  };

  const renderDriverRow = (row: DriverRow, showIban = true, showModeSelector = true) => (
    <div
      key={row.id}
      className="flex items-center gap-2 p-2 rounded-lg border text-xs hover:bg-muted/50 transition-colors"
    >
      <Checkbox
        checked={row.selected}
        onCheckedChange={c => updateDriverRow(row.id, { selected: !!c })}
      />
      <span className="w-[130px] truncate font-medium">{row.name}</span>
      <span className="w-[70px] text-right font-semibold text-primary">
        {row.payout.toFixed(2)} zł
      </span>

      {showIban && row.paymentMode === 'transfer' && (
        <Input
          placeholder="00 0000 0000 0000 0000 0000 0000"
          value={formatIbanDisplay(row.iban)}
          onChange={e => handleIbanChange(row.id, e.target.value)}
          onBlur={() => saveIban(row.id, row.iban)}
          className="h-7 text-[11px] flex-1 min-w-[200px] font-mono tracking-wider text-foreground"
        />
      )}

      {showModeSelector && (
        <Select
          value={row.paymentMode}
          onValueChange={(v: DriverRow['paymentMode']) => {
            updateDriverRow(row.id, {
              paymentMode: v,
              selected: false,
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
      )}

      {row.paymentMode === 'fleet' && (
        <Select
          value={row.fleetId || ''}
          onValueChange={async (v) => {
            const fleet = fleetOptions.find(f => f.id === v);
            updateDriverRow(row.id, { fleetId: v, fleetName: fleet?.name });
            // Persist fleet assignment to DB
            try {
              await supabase.from('drivers').update({ fleet_id: v } as any).eq('id', row.id);
              // Also create partnership if not exists
              const { data: existing } = await supabase
                .from('driver_fleet_partnerships')
                .select('id')
                .eq('managing_fleet_id', fleetId)
                .eq('partner_fleet_id', v)
                .maybeSingle();
              if (!existing) {
                await supabase.from('driver_fleet_partnerships').insert({
                  managing_fleet_id: fleetId,
                  partner_fleet_id: v,
                  is_active: true,
                } as any);
              }
            } catch (e) {
              console.error('Error persisting fleet assignment:', e);
            }
          }}
        >
          <SelectTrigger className="h-7 w-[110px] text-xs">
            <SelectValue placeholder="Wybierz..." />
          </SelectTrigger>
          <SelectContent>
            {fleetOptions.length === 0 ? (
              <div className="p-2 text-xs text-muted-foreground text-center">
                Brak flot partnerskich
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
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Generuj przelewy i wypłaty
          </DialogTitle>
          <DialogDescription>
            Zarządzaj wypłatami kierowców: przelew, gotówka lub flota. Okres: {periodLabel}
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="transfers" className="gap-1 text-xs">
              <Banknote className="h-3.5 w-3.5" />
              Przelewy ({transferDrivers.length})
            </TabsTrigger>
            <TabsTrigger value="cash" className="gap-1 text-xs">
              <Coins className="h-3.5 w-3.5" />
              Gotówka ({cashDrivers.length})
            </TabsTrigger>
            <TabsTrigger value="fleets" className="gap-1 text-xs">
              <Truck className="h-3.5 w-3.5" />
              Floty ({fleetGroupedDrivers.length})
            </TabsTrigger>
          </TabsList>

          {/* ── TAB: PRZELEWY ── */}
          <TabsContent value="transfers" className="space-y-3 mt-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Szukaj kierowcy..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="pl-8 h-8 text-sm"
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Checkbox
                  checked={transferDrivers.length > 0 && transferDrivers.every(r => r.selected)}
                  onCheckedChange={c => selectAll('transfer', !!c)}
                />
                <span>Zaznacz wszystkich</span>
              </div>
              <Badge variant="outline" className="text-xs gap-1">
                Zaznaczono: {selectedTransfers.length} = {transferTotal.toFixed(2)} zł
              </Badge>
            </div>

            <div className="space-y-1 max-h-[300px] overflow-y-auto pr-1">
              {transferDrivers.map(row => renderDriverRow(row, true, true))}
              {transferDrivers.length === 0 && (
                <p className="text-center text-sm text-muted-foreground py-4">Brak kierowców z przelewem</p>
              )}
            </div>

            {/* Bank settings */}
            <div className="space-y-2 border-t pt-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Nr konta nadawcy</Label>
                {savedSenderAccount && !editingSender ? (
                  <div className="flex items-center gap-2">
                    <div className="flex-1 px-3 py-2 rounded-md border bg-muted/30 font-mono text-sm text-muted-foreground">
                      {maskIban(savedSenderAccount)}
                    </div>
                    <Button variant="outline" size="sm" className="gap-1 h-8" onClick={() => setEditingSender(true)}>
                      <Edit className="h-3.5 w-3.5" /> Edytuj
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <Input
                      placeholder="00 0000 0000 0000 0000 0000 0000"
                      value={formatIbanDisplay(senderAccount)}
                      onChange={e => {
                        const digitsOnly = e.target.value.replace(/[^0-9]/g, '').slice(0, 26);
                        setSenderAccount(digitsOnly);
                      }}
                      className="font-mono text-[11px] tracking-wider flex-1 text-foreground"
                    />
                    <Button variant="default" size="sm" className="gap-1 h-8" onClick={handleSaveSenderAccount} disabled={!senderAccount.replace(/\s/g, '')}>
                      <Check className="h-3.5 w-3.5" /> Zapisz
                    </Button>
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Format banku</Label>
                <Select value={selectedBank} onValueChange={setSelectedBank}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {POLISH_BANKS.map(b => (
                      <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>Anuluj</Button>
              <Button onClick={handleExportTransfers} disabled={loading || selectedTransfers.length === 0} className="gap-2">
                <Download className="h-4 w-4" />
                Generuj przelewy ({selectedTransfers.length})
              </Button>
            </div>
          </TabsContent>

          {/* ── TAB: GOTÓWKA ── */}
          <TabsContent value="cash" className="space-y-3 mt-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Szukaj kierowcy..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="pl-8 h-8 text-sm"
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Checkbox
                  checked={cashDrivers.length > 0 && cashDrivers.every(r => r.selected)}
                  onCheckedChange={c => selectAll('cash', !!c)}
                />
                <span>Zaznacz wszystkich</span>
              </div>
              <Badge variant="outline" className="text-xs gap-1">
                Zaznaczono: {selectedCash.length} = {cashTotal.toFixed(2)} zł
              </Badge>
            </div>

            <div className="space-y-1 max-h-[350px] overflow-y-auto pr-1">
              {cashDrivers.map(row => renderDriverRow(row, false, true))}
              {cashDrivers.length === 0 && (
                <p className="text-center text-sm text-muted-foreground py-4">Brak kierowców gotówkowych</p>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>Anuluj</Button>
              <Button onClick={handleExportCashList} disabled={selectedCash.length === 0} variant="secondary" className="gap-2">
                <FileText className="h-4 w-4" />
                Generuj listę KW ({selectedCash.length})
              </Button>
            </div>
          </TabsContent>

          {/* ── TAB: FLOTY ── */}
          <TabsContent value="fleets" className="space-y-3 mt-3">
            {fleetGroupedDrivers.length === 0 && fleetDrivers.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                <Truck className="h-10 w-10 mx-auto mb-2 opacity-40" />
                <p>Brak kierowców przypisanych do flot</p>
                <p className="text-xs mt-1">Zmień tryb wypłaty na "Flota" w zakładce Przelewy lub Gotówka</p>
              </div>
            ) : (
              <>
                {/* Unassigned fleet drivers */}
                {fleetDrivers.filter(r => !r.fleetId).length > 0 && (
                  <div className="border rounded-lg p-3 space-y-2 border-destructive/30 bg-destructive/5">
                    <p className="text-xs font-medium text-destructive">Kierowcy bez przypisanej floty:</p>
                    <div className="space-y-1">
                      {fleetDrivers.filter(r => !r.fleetId).map(row => renderDriverRow(row, false, true))}
                    </div>
                  </div>
                )}

                {/* Grouped by fleet */}
                {fleetGroupedDrivers.map(group => (
                  <div key={group.fleet.id} className="border rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Checkbox
                          checked={group.drivers.every(d => d.selected)}
                          onCheckedChange={c => {
                            for (const d of group.drivers) {
                              updateDriverRow(d.id, { selected: !!c });
                            }
                          }}
                        />
                        <Truck className="h-4 w-4 text-primary" />
                        <span className="font-semibold text-sm">{group.fleet.name}</span>
                        <Badge variant="outline" className="text-xs">{group.drivers.length} kier.</Badge>
                      </div>
                      <span className="font-bold text-primary">{group.total.toFixed(2)} zł</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <Label className="text-xs whitespace-nowrap">Nr konta floty:</Label>
                      <Input
                        placeholder="00 0000 0000 0000 0000 0000 0000"
                        value={formatIbanDisplay(group.fleet.iban || '')}
                        onChange={e => {
                          const digitsOnly = e.target.value.replace(/[^0-9]/g, '').slice(0, 26);
                          setFleetOptions(prev => prev.map(f => f.id === group.fleet.id ? { ...f, iban: digitsOnly } : f));
                        }}
                        className="h-7 text-[11px] font-mono tracking-wider flex-1 text-foreground"
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

                    <p className="text-[10px] text-muted-foreground">
                      Tytuł przelewu: <span className="font-medium">zaliczka na fakture</span>
                    </p>
                  </div>
                ))}
              </>
            )}

            {fleetGroupedDrivers.length > 0 && (
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => onOpenChange(false)}>Anuluj</Button>
                <Button onClick={handleExportTransfers} disabled={loading} className="gap-2">
                  <Download className="h-4 w-4" />
                  Generuj przelewy flotowe
                </Button>
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* Settings */}
        <div className="flex justify-start pt-1">
          <Button variant="ghost" size="sm" className="text-xs gap-1" onClick={() => setShowSettings(!showSettings)}>
            <Settings className="h-3 w-3" />
            {showSettings ? 'Ukryj ustawienia' : 'Ustawienia'}
          </Button>
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
