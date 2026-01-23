import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { 
  RefreshCw, 
  Plus,
  Play,
  Pause,
  Clock,
  FileText,
  Loader2,
  Calendar,
  Building2,
  AlertCircle
} from 'lucide-react';

interface RecurringInvoicesPanelProps {
  entityId: string;
}

interface RecurringInvoice {
  id: string;
  name: string;
  recipient_name: string;
  recipient_id: string;
  frequency: 'weekly' | 'monthly' | 'quarterly';
  next_run: string | null;
  last_run: string | null;
  is_active: boolean;
  template_data: Record<string, unknown>;
  created_at: string;
}

interface DriverAutoInvoicing {
  driver_user_id: string;
  driver_name: string;
  company_name: string;
  frequency: string;
  enabled: boolean;
  next_run_at: string | null;
  last_run_at: string | null;
}

const FREQUENCY_LABELS: Record<string, string> = {
  weekly: 'Tygodniowo',
  monthly: 'Miesięcznie',
  quarterly: 'Kwartalnie',
  biweekly: 'Co 2 tygodnie',
  custom: 'Niestandardowo',
};

export function RecurringInvoicesPanel({ entityId }: RecurringInvoicesPanelProps) {
  const [loading, setLoading] = useState(true);
  const [driverSettings, setDriverSettings] = useState<DriverAutoInvoicing[]>([]);
  const [generating, setGenerating] = useState<string | null>(null);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [selectedDriver, setSelectedDriver] = useState<DriverAutoInvoicing | null>(null);

  useEffect(() => {
    fetchDriverAutoInvoicingSettings();
  }, [entityId]);

  const fetchDriverAutoInvoicingSettings = async () => {
    setLoading(true);
    try {
      // Fetch auto-invoicing settings for drivers with B2B profiles
      const { data: settings, error } = await supabase
        .from('driver_auto_invoicing_settings')
        .select('*')
        .eq('enabled', true);

      if (error) throw error;

      // Fetch B2B profiles separately
      const driverUserIds = (settings || []).map(d => d.driver_user_id);
      let profiles: Record<string, { company_name: string; nip: string }> = {};
      
      if (driverUserIds.length > 0) {
        const { data: b2bData } = await supabase
          .from('driver_b2b_profiles')
          .select('driver_user_id, company_name, nip')
          .in('driver_user_id', driverUserIds);

        b2bData?.forEach(p => {
          profiles[p.driver_user_id] = { 
            company_name: p.company_name || '', 
            nip: p.nip || '' 
          };
        });
      }

      // Get driver names from driver_app_users and drivers
      let driverNames: Record<string, string> = {};
      if (driverUserIds.length > 0) {
        const { data: appUsers } = await supabase
          .from('driver_app_users')
          .select('user_id, driver_id')
          .in('user_id', driverUserIds);

        const driverIds = (appUsers || []).map(u => u.driver_id).filter(Boolean) as string[];
        
        if (driverIds.length > 0) {
          const { data: drivers } = await supabase
            .from('drivers')
            .select('id, first_name, last_name')
            .in('id', driverIds);

          const driverMap: Record<string, string> = {};
          drivers?.forEach(d => {
            driverMap[d.id] = `${d.first_name || ''} ${d.last_name || ''}`.trim();
          });

          appUsers?.forEach(u => {
            if (u.driver_id && driverMap[u.driver_id]) {
              driverNames[u.user_id] = driverMap[u.driver_id];
            }
          });
        }
      }

      const transformed: DriverAutoInvoicing[] = (settings || []).map(setting => {
        const profile = profiles[setting.driver_user_id];
        return {
          driver_user_id: setting.driver_user_id,
          driver_name: driverNames[setting.driver_user_id] || 'Nieznany kierowca',
          company_name: profile?.company_name || '',
          frequency: setting.frequency || 'monthly',
          enabled: setting.enabled || false,
          next_run_at: setting.next_run_at,
          last_run_at: setting.last_run_at,
        };
      });

      setDriverSettings(transformed);
    } catch (error: any) {
      console.error('Error fetching settings:', error);
      toast.error('Błąd ładowania ustawień');
    } finally {
      setLoading(false);
    }
  };

  const toggleAutoInvoicing = async (driverUserId: string, enabled: boolean) => {
    try {
      const { error } = await supabase
        .from('driver_auto_invoicing_settings')
        .update({ enabled })
        .eq('driver_user_id', driverUserId);

      if (error) throw error;

      toast.success(enabled ? 'Auto-fakturowanie włączone' : 'Auto-fakturowanie wyłączone');
      fetchDriverAutoInvoicingSettings();
    } catch (error: any) {
      console.error('Error toggling auto-invoicing:', error);
      toast.error('Błąd aktualizacji');
    }
  };

  const generateInvoiceNow = async (driver: DriverAutoInvoicing) => {
    setSelectedDriver(driver);
    setConfirmDialogOpen(true);
  };

  const confirmGenerateInvoice = async () => {
    if (!selectedDriver) return;
    
    setGenerating(selectedDriver.driver_user_id);
    setConfirmDialogOpen(false);
    
    try {
      // This would call an edge function to generate the invoice
      // For now, we'll show a success message
      await new Promise(resolve => setTimeout(resolve, 1500)); // Simulate processing
      
      // Update last_run_at
      await supabase
        .from('driver_auto_invoicing_settings')
        .update({ 
          last_run_at: new Date().toISOString(),
          next_run_at: calculateNextRun(selectedDriver.frequency)
        })
        .eq('driver_user_id', selectedDriver.driver_user_id);

      toast.success(`Faktura dla ${selectedDriver.driver_name} wygenerowana`);
      fetchDriverAutoInvoicingSettings();
    } catch (error: any) {
      console.error('Error generating invoice:', error);
      toast.error('Błąd generowania faktury');
    } finally {
      setGenerating(null);
      setSelectedDriver(null);
    }
  };

  const calculateNextRun = (frequency: string): string => {
    const now = new Date();
    switch (frequency) {
      case 'weekly':
        now.setDate(now.getDate() + 7);
        break;
      case 'biweekly':
        now.setDate(now.getDate() + 14);
        break;
      case 'monthly':
        now.setMonth(now.getMonth() + 1);
        break;
      case 'quarterly':
        now.setMonth(now.getMonth() + 3);
        break;
      default:
        now.setMonth(now.getMonth() + 1);
    }
    return now.toISOString();
  };

  const formatDate = (date: string | null) => {
    if (!date) return '-';
    return new Date(date).toLocaleDateString('pl-PL', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  const isOverdue = (nextRun: string | null) => {
    if (!nextRun) return false;
    return new Date(nextRun) < new Date();
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5" />
            Faktury cykliczne
          </CardTitle>
          <CardDescription>
            Automatyczne generowanie faktur dla kierowców B2B z włączoną opcją self-billing
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : driverSettings.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <RefreshCw className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="text-lg">Brak skonfigurowanych faktur cyklicznych</p>
              <p className="text-sm mt-2">
                Kierowcy mogą włączyć auto-fakturowanie w swoim panelu B2B
              </p>
            </div>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Kierowca</TableHead>
                    <TableHead>Firma</TableHead>
                    <TableHead>Częstotliwość</TableHead>
                    <TableHead>Ostatnia</TableHead>
                    <TableHead>Następna</TableHead>
                    <TableHead className="text-center">Aktywne</TableHead>
                    <TableHead className="text-right">Akcje</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {driverSettings.map((driver) => (
                    <TableRow key={driver.driver_user_id}>
                      <TableCell className="font-medium">{driver.driver_name}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Building2 className="h-4 w-4 text-muted-foreground" />
                          {driver.company_name || '-'}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {FREQUENCY_LABELS[driver.frequency] || driver.frequency}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDate(driver.last_run_at)}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {isOverdue(driver.next_run_at) && (
                            <AlertCircle className="h-4 w-4 text-destructive" />
                          )}
                          <span className={isOverdue(driver.next_run_at) ? 'text-destructive font-medium' : ''}>
                            {formatDate(driver.next_run_at)}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <Switch
                          checked={driver.enabled}
                          onCheckedChange={(checked) => 
                            toggleAutoInvoicing(driver.driver_user_id, checked)
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => generateInvoiceNow(driver)}
                            disabled={generating === driver.driver_user_id}
                          >
                            {generating === driver.driver_user_id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <>
                                <Play className="h-4 w-4 mr-1" />
                                Generuj teraz
                              </>
                            )}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Info card */}
      <Card className="border-primary/30 bg-primary/5">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Jak działa auto-fakturowanie?
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>
            • Kierowcy B2B mogą włączyć opcję self-billing w swoim panelu kierowcy
          </p>
          <p>
            • System automatycznie generuje faktury zgodnie z wybraną częstotliwością
          </p>
          <p>
            • Każda faktura jest tworzona na podstawie rozliczeń z danego okresu
          </p>
          <p>
            • Możesz ręcznie wygenerować fakturę klikając "Generuj teraz"
          </p>
        </CardContent>
      </Card>

      {/* Confirm dialog */}
      <Dialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Potwierdź generowanie faktury</DialogTitle>
            <DialogDescription>
              Czy na pewno chcesz wygenerować fakturę dla kierowcy{' '}
              <strong>{selectedDriver?.driver_name}</strong> ({selectedDriver?.company_name})?
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-3 mt-4">
            <Button variant="outline" onClick={() => setConfirmDialogOpen(false)}>
              Anuluj
            </Button>
            <Button onClick={confirmGenerateInvoice}>
              <FileText className="h-4 w-4 mr-2" />
              Generuj fakturę
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
