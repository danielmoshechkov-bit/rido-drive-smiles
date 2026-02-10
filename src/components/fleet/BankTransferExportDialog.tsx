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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Download, Building2, Settings } from 'lucide-react';
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
          id, first_name, last_name, iban, payment_method, billing_method,
          driver_app_users!left(settlement_frequency, payout_requested_at)
        `)
        .eq('fleet_id', fleetId);

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
        return;
      }

      // Generate file content based on bank format
      let content = '';
      const sep = bank.separator;

      // Header row for some banks
      if (bank.id === 'universal') {
        content = `Odbiorca${sep}IBAN${sep}Kwota${sep}Tytuł\n`;
      }

      transferDrivers.forEach(s => {
        const driver = driverMap.get(s.driver_id);
        const iban = (driver?.iban || '').replace(/\s/g, '');
        const amount = bank.amountFormat === 'comma' 
          ? s.final_payout.toFixed(2).replace('.', ',')
          : s.final_payout.toFixed(2);
        
        // Determine title based on billing method
        let title = transferTitle;
        if (driver?.billing_method === 'b2b' || driver?.billing_method === 'B2B') {
          title = `Faktura ${periodLabel}`;
        }

        const driverName = `${driver?.first_name || ''} ${driver?.last_name || ''}`.trim() || s.driver_name;
        
        // Build row based on bank format
        switch (bank.id) {
          case 'mbank':
            content += `${iban}${sep}${amount}${sep}${driverName}${sep}${sep}${title}\n`;
            break;
          case 'pko_bp':
          case 'pekao':
            content += `${iban}${sep}${amount}${sep}${driverName}${sep}${title}\n`;
            break;
          case 'ing':
            content += `${iban}${sep}${amount}${sep}PLN${sep}${driverName}${sep}${title}\n`;
            break;
          case 'santander':
            content += `${iban}${sep}${amount}${sep}${driverName}${sep}${title}\n`;
            break;
          case 'alior':
            // Alior Bank: NR_RACHUNKU|KWOTA|PLN|NAZWA|TYTUŁ - no header, no BOM, | separator
            content += `${iban.replace(/\D/g, '')}|${s.final_payout.toFixed(2)}|PLN|${driverName}|${title.substring(0, 140)}\n`;
            break;
          default:
            content += `${driverName}${sep}${iban}${sep}${amount}${sep}${title}\n`;
        }
      });

      // Create and download file
      const encoding = bank.encoding === 'windows-1250' ? 'windows-1250' : 'utf-8';
      // Alior Bank: no BOM, plain UTF-8
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
      const processedDriverIds = transferDrivers.map(s => s.driver_id);
      await supabase
        .from('driver_app_users')
        .update({ payout_requested_at: null })
        .in('driver_id', processedDriverIds);

      toast.success(`Wyeksportowano ${transferDrivers.length} przelewów w formacie ${bank.name}`);
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
      <DialogContent className="sm:max-w-lg">
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
              placeholder="np. Rozliczenie tygodniowe"
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
            {loading ? 'Generowanie...' : 'Pobierz plik'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
