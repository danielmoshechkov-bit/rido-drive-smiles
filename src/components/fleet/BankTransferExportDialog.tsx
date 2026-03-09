import { useState, useEffect } from 'react';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Download, Building2, Settings, AlertTriangle } from 'lucide-react';
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
  separator: string;
  encoding: string;
  dateFormat: string;
  amountFormat: 'comma' | 'dot';
  columns: string[];
  extension: string;
}

interface MissingAccountDriver {
  id: string;
  name: string;
  payout: number;
  iban: string;
  switchToCash: boolean;
  switchToFleet: boolean;
  partnerFleetId?: string;
  partnerFleetName?: string;
}

interface PartnerFleet {
  id: string;
  name: string;
}

const POLISH_BANKS: BankFormat[] = [
  {
    id: 'mbank',
    name: 'mBank',
    shortName: 'mBank',
    separator: ';',
    encoding: 'utf-8',
    dateFormat: 'yyyy-MM-dd',
    amountFormat: 'comma',
    columns: ['account', 'amount', 'name', 'address', 'title'],
    extension: 'csv'
  },
  {
    id: 'pko_bp',
    name: 'PKO Bank Polski',
    shortName: 'PKO BP',
    separator: ';',
    encoding: 'windows-1250',
    dateFormat: 'dd.MM.yyyy',
    amountFormat: 'comma',
    columns: ['account', 'amount', 'name', 'title'],
    extension: 'csv'
  },
  {
    id: 'ing',
    name: 'ING Bank Śląski',
    shortName: 'ING',
    separator: ';',
    encoding: 'utf-8',
    dateFormat: 'yyyy-MM-dd',
    amountFormat: 'comma',
    columns: ['account', 'amount', 'currency', 'name', 'title'],
    extension: 'csv'
  },
  {
    id: 'santander',
    name: 'Santander Bank Polska',
    shortName: 'Santander',
    separator: ';',
    encoding: 'windows-1250',
    dateFormat: 'dd-MM-yyyy',
    amountFormat: 'comma',
    columns: ['account', 'amount', 'name', 'title'],
    extension: 'txt'
  },
  {
    id: 'bnp_paribas',
    name: 'BNP Paribas Bank Polska',
    shortName: 'BNP Paribas',
    separator: ';',
    encoding: 'utf-8',
    dateFormat: 'yyyy-MM-dd',
    amountFormat: 'comma',
    columns: ['account', 'amount', 'name', 'title'],
    extension: 'csv'
  },
  {
    id: 'pekao',
    name: 'Bank Pekao SA',
    shortName: 'Pekao',
    separator: ';',
    encoding: 'windows-1250',
    dateFormat: 'dd.MM.yyyy',
    amountFormat: 'comma',
    columns: ['account', 'amount', 'name', 'address', 'title'],
    extension: 'csv'
  },
  {
    id: 'millennium',
    name: 'Bank Millennium',
    shortName: 'Millennium',
    separator: ';',
    encoding: 'utf-8',
    dateFormat: 'yyyy-MM-dd',
    amountFormat: 'comma',
    columns: ['account', 'amount', 'name', 'title'],
    extension: 'csv'
  },
  {
    id: 'alior',
    name: 'Alior Bank',
    shortName: 'Alior',
    separator: '|',
    encoding: 'utf-8',
    dateFormat: 'yyyy-MM-dd',
    amountFormat: 'dot',
    columns: ['account', 'amount', 'currency', 'name', 'title'],
    extension: 'txt'
  },
  {
    id: 'universal',
    name: 'Format uniwersalny (CSV)',
    shortName: 'CSV',
    separator: ';',
    encoding: 'utf-8',
    dateFormat: 'yyyy-MM-dd',
    amountFormat: 'comma',
    columns: ['name', 'account', 'amount', 'title'],
    extension: 'csv'
  }
];

export function BankTransferExportDialog({
  open,
  onOpenChange,
  fleetId,
  settlements,
  periodLabel,
  weekStart
}: BankTransferExportDialogProps) {
  const [selectedBank, setSelectedBank] = useState<string>('universal');
  const [transferTitle, setTransferTitle] = useState<string>('');
  const [showSettings, setShowSettings] = useState(false);
  const [loading, setLoading] = useState(false);
  const [missingAccounts, setMissingAccounts] = useState<MissingAccountDriver[]>([]);
  const [showMissingAccounts, setShowMissingAccounts] = useState(false);
  const [partnerFleets, setPartnerFleets] = useState<PartnerFleet[]>([]);

  // Load fleet settings for default transfer title
  useEffect(() => {
    const loadFleetSettings = async () => {
      const { data } = await supabase
        .from('fleets')
        .select('*')
        .eq('id', fleetId)
        .single();
      
      if (data && (data as any).transfer_title_template) {
        setTransferTitle((data as any).transfer_title_template);
      } else {
        setTransferTitle('wynajem auta');
      }
    };
    
    if (open) {
      loadFleetSettings();
      setMissingAccounts([]);
      setShowMissingAccounts(false);
      // Load partner fleets
      supabase
        .from('driver_fleet_partnerships')
        .select('partner_fleet_id, fleets!driver_fleet_partnerships_partner_fleet_id_fkey(id, name)')
        .eq('managing_fleet_id', fleetId)
        .eq('is_active', true)
        .then(({ data }) => {
          if (data) {
            const fleets = data
              .map((p: any) => ({ id: p.fleets?.id, name: p.fleets?.name }))
              .filter((f: any) => f.id && f.name);
            // Deduplicate
            const unique = Array.from(new Map(fleets.map((f: any) => [f.id, f])).values()) as PartnerFleet[];
            setPartnerFleets(unique);
          }
        });
    }
  }, [open, fleetId, periodLabel]);

  const handleExport = async () => {
    setLoading(true);
    try {
      const bank = POLISH_BANKS.find(b => b.id === selectedBank) || POLISH_BANKS[POLISH_BANKS.length - 1];
      
      // Get drivers with IBAN and payment method
      const { data: driversData } = await supabase
        .from('drivers')
        .select(`
          id, first_name, last_name, iban, bank_account, payment_method, billing_method,
          driver_app_users!left(settlement_frequency, payout_requested_at)
        `)
        .eq('fleet_id', fleetId);

      // Get signed rental contracts for transfer title
      const { data: signedContracts } = await supabase
        .from('driver_document_requests')
        .select('driver_id, contract_number')
        .eq('fleet_id', fleetId)
        .eq('template_code', 'RENTAL_CONTRACT')
        .eq('status', 'signed');

      const contractMap = new Map(
        (signedContracts || []).map(c => [c.driver_id, c.contract_number])
      );

      if (!driversData) {
        toast.error('Brak danych kierowców');
        return;
      }

      const driverMap = new Map(driversData.map(d => [d.id, d as any]));

      // Filter drivers with transfer payment and positive payout
      const transferDrivers = settlements.filter(s => {
        const driver = driverMap.get(s.driver_id);
        if (!driver) return false;
        if (driver.payment_method !== 'transfer') return false;
        if (s.final_payout <= 0) return false;
        
        const appUser = driver.driver_app_users?.[0];
        const isWeekly = !appUser?.settlement_frequency || appUser.settlement_frequency === 'weekly';
        const requestedPayout = !!appUser?.payout_requested_at;
        
        return isWeekly || requestedPayout;
      });

      if (transferDrivers.length === 0) {
        toast.info('Brak kierowców z przelewem do eksportu');
        setLoading(false);
        return;
      }

      // Check for missing bank accounts (check both iban and bank_account fields)
      const getDriverIban = (driver: any) => {
        const iban = (driver?.iban || '').replace(/\s/g, '');
        const bankAccount = (driver?.bank_account || '').replace(/\s/g, '');
        return iban.length >= 20 ? iban : (bankAccount.length >= 20 ? bankAccount : '');
      };

      const driversWithoutIban = transferDrivers.filter(s => {
        const driver = driverMap.get(s.driver_id);
        return !getDriverIban(driver);
      });

      if (driversWithoutIban.length > 0 && !showMissingAccounts) {
        // Show missing accounts panel
        setMissingAccounts(driversWithoutIban.map(s => {
          const driver = driverMap.get(s.driver_id);
          return {
            id: s.driver_id,
            name: `${driver?.first_name || ''} ${driver?.last_name || ''}`.trim() || s.driver_name,
            payout: s.final_payout,
            iban: driver?.iban || '',
            switchToCash: false,
            switchToFleet: false,
          };
        }));
        setShowMissingAccounts(true);
        setLoading(false);
        return;
      }

      // If showing missing accounts, apply changes first
      if (showMissingAccounts && missingAccounts.length > 0) {
        for (const ma of missingAccounts) {
          if (ma.switchToCash) {
            await supabase.from('drivers').update({ payment_method: 'cash' }).eq('id', ma.id);
          } else if (ma.iban.replace(/\s/g, '').length >= 20) {
            await supabase.from('drivers').update({ iban: ma.iban, bank_account: ma.iban } as any).eq('id', ma.id);
          }
        }
        // Re-fetch drivers
        const { data: updatedDrivers } = await supabase
          .from('drivers')
          .select('id, first_name, last_name, iban, bank_account, payment_method, billing_method, driver_app_users!left(settlement_frequency, payout_requested_at)')
          .eq('fleet_id', fleetId);
        if (updatedDrivers) {
          driversData.length = 0;
          driversData.push(...updatedDrivers);
          driverMap.clear();
          updatedDrivers.forEach(d => driverMap.set(d.id, d as any));
        }
      }

      // Re-filter after potential updates (exclude switched-to-cash and still missing iban)
      const finalTransferDrivers = transferDrivers.filter(s => {
        const driver = driverMap.get(s.driver_id);
        if (!driver) return false;
        if (driver.payment_method !== 'transfer') return false;
        return !!getDriverIban(driver);
      });

      if (finalTransferDrivers.length === 0) {
        toast.info('Brak kierowców z prawidłowym nr konta do eksportu');
        setLoading(false);
        return;
      }

      // Generate file content based on bank format
      let content = '';

      // Header row for some banks
      if (bank.id === 'universal') {
        content = `Odbiorca${bank.separator}IBAN${bank.separator}Kwota${bank.separator}Tytuł\n`;
      }

      finalTransferDrivers.forEach(s => {
        const driver = driverMap.get(s.driver_id);
        const iban = getDriverIban(driver);
        const amount = bank.amountFormat === 'comma'
          ? s.final_payout.toFixed(2).replace('.', ',')
          : s.final_payout.toFixed(2);
        
        // Determine title: signed contract number > B2B invoice > default
        let title = transferTitle;
        const contractNumber = contractMap.get(s.driver_id);
        if (contractNumber) {
          title = `Umowa najmu auta nr ${contractNumber}`;
        } else if (driver?.billing_method === 'b2b' || driver?.billing_method === 'B2B') {
          title = `Faktura ${periodLabel}`;
        }

        const driverName = `${driver?.first_name || ''} ${driver?.last_name || ''}`.trim() || s.driver_name;
        
        // Build row based on bank format
        switch (bank.id) {
          case 'mbank':
            content += `${iban}${bank.separator}${amount}${bank.separator}${driverName}${bank.separator}${bank.separator}${title}\n`;
            break;
          case 'pko_bp':
          case 'pekao':
            content += `${iban}${bank.separator}${amount}${bank.separator}${driverName}${bank.separator}${title}\n`;
            break;
          case 'ing':
            content += `${iban}${bank.separator}${amount}${bank.separator}PLN${bank.separator}${driverName}${bank.separator}${title}\n`;
            break;
          case 'santander':
            content += `${iban}${bank.separator}${amount}${bank.separator}${driverName}${bank.separator}${title}\n`;
            break;
          case 'alior':
            content += `${iban.replace(/\D/g, '')}|${s.final_payout.toFixed(2)}|PLN|${driverName}|${title.substring(0, 140)}\n`;
            break;
          default:
            content += `${driverName}${bank.separator}${iban}${bank.separator}${amount}${bank.separator}${title}\n`;
        }
      });

      // Create and download file
      const encoding = bank.encoding === 'windows-1250' ? 'windows-1250' : 'utf-8';
      const bom = (encoding === 'utf-8' && bank.id !== 'alior') ? '\ufeff' : '';
      const blob = new Blob([bom + content.trimEnd() + (bank.id === 'alior' ? '' : '\n')], { 
        type: `text/${bank.extension};charset=${encoding}` 
      });
      
      const mondayDate = weekStart 
        ? format(new Date(weekStart), 'dd.MM.yyyy')
        : format(new Date(), 'dd.MM.yyyy');
      
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `${mondayDate}_Przelewy_${bank.shortName}.${bank.extension}`;
      link.click();

      // Clear payout_requested_at for processed drivers
      const processedDriverIds = finalTransferDrivers.map(s => s.driver_id);
      await supabase
        .from('driver_app_users')
        .update({ payout_requested_at: null })
        .in('driver_id', processedDriverIds);

      toast.success(`Wyeksportowano ${finalTransferDrivers.length} przelewów w formacie ${bank.name}`);
      onOpenChange(false);
    } catch (error) {
      console.error('Error exporting transfers:', error);
      toast.error('Błąd podczas eksportu');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveDefaultTitle = async () => {
    try {
      await supabase
        .from('fleets')
        .update({ transfer_title_template: transferTitle } as any)
        .eq('id', fleetId);
      
      toast.success('Zapisano domyślny tytuł przelewu');
      setShowSettings(false);
    } catch (error) {
      toast.error('Błąd zapisu ustawień');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Generuj listę przelewów
          </DialogTitle>
          <DialogDescription>
            Wybierz swój bank, aby wygenerować plik importu przelewów w odpowiednim formacie.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Missing accounts warning */}
          {showMissingAccounts && missingAccounts.length > 0 && (
            <div className="p-3 rounded-lg border border-amber-300 bg-amber-50 space-y-3">
              <div className="flex items-center gap-2 text-amber-800 font-medium text-sm">
                <AlertTriangle className="h-4 w-4" />
                {missingAccounts.length} kierowców bez nr konta
              </div>
              <p className="text-xs text-amber-700">
                Wpisz nr konta lub zaznacz "Gotówka" aby zmienić sposób wypłaty.
              </p>
              <div className="space-y-2 max-h-[200px] overflow-y-auto">
                {missingAccounts.map((ma, idx) => (
                  <div key={ma.id} className="flex items-center gap-2 text-xs">
                    <span className="w-[120px] truncate font-medium">{ma.name}</span>
                    <span className="text-muted-foreground w-[60px] text-right">{ma.payout.toFixed(2)} zł</span>
                    <Input
                      placeholder="Nr konta (26 cyfr)"
                      value={ma.iban}
                      onChange={(e) => {
                        const newIban = e.target.value;
                        setMissingAccounts(prev => prev.map((m, i) => 
                          i === idx ? { ...m, iban: newIban, switchToCash: false } : m
                        ));
                      }}
                      onBlur={async () => {
                        // Auto-save IBAN when valid (26+ digits)
                        const cleanIban = ma.iban.replace(/\s/g, '');
                        if (cleanIban.length >= 20 && !ma.switchToCash) {
                          await supabase.from('drivers').update({ iban: ma.iban, bank_account: ma.iban } as any).eq('id', ma.id);
                        }
                      }}
                      disabled={ma.switchToCash}
                      className="h-7 text-xs flex-1"
                    />
                    <div className="flex items-center gap-1 whitespace-nowrap">
                      <Checkbox
                        checked={ma.switchToCash}
                        onCheckedChange={(checked) => {
                          setMissingAccounts(prev => prev.map((m, i) => 
                            i === idx ? { ...m, switchToCash: !!checked } : m
                          ));
                        }}
                      />
                      <span className="text-xs">Gotówka</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Bank Selection */}
          <div className="space-y-2">
            <Label>Bank</Label>
            <Select value={selectedBank} onValueChange={setSelectedBank}>
              <SelectTrigger>
                <SelectValue placeholder="Wybierz bank" />
              </SelectTrigger>
              <SelectContent>
                {POLISH_BANKS.map(bank => (
                  <SelectItem key={bank.id} value={bank.id}>
                    {bank.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Transfer Title */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Tytuł przelewu</Label>
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-7 text-xs gap-1"
                onClick={() => setShowSettings(!showSettings)}
              >
                <Settings className="h-3 w-3" />
                Zapisz jako domyślny
              </Button>
            </div>
            <Input
              value={transferTitle}
              onChange={(e) => setTransferTitle(e.target.value)}
              placeholder="np. wynajem auta"
            />
            <p className="text-xs text-muted-foreground">
              Dla kierowców B2B tytuł zostanie automatycznie zmieniony na "Faktura"
            </p>
          </div>

          {showSettings && (
            <div className="p-3 bg-muted rounded-lg space-y-2">
              <p className="text-sm">
                Zapisać "{transferTitle}" jako domyślny tytuł przelewu dla tej floty?
              </p>
              <div className="flex gap-2">
                <Button size="sm" onClick={handleSaveDefaultTitle}>
                  Zapisz
                </Button>
                <Button size="sm" variant="outline" onClick={() => setShowSettings(false)}>
                  Anuluj
                </Button>
              </div>
            </div>
          )}

          {/* Preview info */}
          <div className="p-3 bg-muted/50 rounded-lg text-sm">
            <p className="font-medium">Podgląd:</p>
            <p className="text-muted-foreground">
              {settlements.filter(s => s.final_payout > 0).length} kierowców z dodatnim saldem
            </p>
            <p className="text-muted-foreground">
              Okres: {periodLabel}
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Anuluj
          </Button>
          <Button onClick={handleExport} disabled={loading} className="gap-2">
            <Download className="h-4 w-4" />
            {loading ? 'Generowanie...' : showMissingAccounts ? 'Zapisz i generuj' : 'Pobierz plik'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
