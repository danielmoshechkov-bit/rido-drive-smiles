import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Search, User, Mail, Phone, Hash } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface ManualMatchModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  alertId: string;
  alertMetadata: any;
  onMatchComplete: () => void;
}

export const ManualMatchModal = ({ open, onOpenChange, alertId, alertMetadata, onMatchComplete }: ManualMatchModalProps) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [drivers, setDrivers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [matching, setMatching] = useState(false);

  const csvRow = alertMetadata?.row || {};

  useEffect(() => {
    if (open) {
      fetchDrivers();
    }
  }, [open]);

  const fetchDrivers = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('drivers')
        .select(`
          *,
          driver_platform_ids(platform, platform_id)
        `)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      setDrivers(data || []);
    } catch (error) {
      console.error('Error fetching drivers:', error);
      toast.error('Nie udało się pobrać listy kierowców');
    } finally {
      setLoading(false);
    }
  };

  const filteredDrivers = drivers.filter(driver => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    const fullName = `${driver.first_name} ${driver.last_name}`.toLowerCase();
    const email = driver.email?.toLowerCase() || '';
    const phone = driver.phone?.toLowerCase() || '';
    const platformIds = driver.driver_platform_ids?.map((p: any) => p.platform_id.toLowerCase()) || [];
    
    return (
      fullName.includes(query) ||
      email.includes(query) ||
      phone.includes(query) ||
      platformIds.some((id: string) => id.includes(query))
    );
  });

  const handleMatch = async (driverId: string) => {
    setMatching(true);
    try {
      // 1. Create settlement for matched driver
      const { error: settlementError } = await supabase
        .from('settlements')
        .insert({
          driver_id: driverId,
          period_from: alertMetadata.period_from,
          period_to: alertMetadata.period_to,
          platform: 'main',
          source: 'manual_match',
          amounts: alertMetadata.amounts || {},
          raw: csvRow,
          raw_row_id: `manual_${driverId}_${Date.now()}`
        });

      if (settlementError) throw settlementError;

      // 2. Save manual match for learning
      const matchKey = csvRow.uber_id ? 'uber_id' : csvRow.bolt_id ? 'bolt_id' : csvRow.freenow_id ? 'freenow_id' : csvRow.email ? 'email' : 'name';
      const matchValue = csvRow[matchKey] || `${csvRow.first_name} ${csvRow.last_name}`;

      await supabase
        .from('manual_driver_matches')
        .insert({
          driver_id: driverId,
          match_key: matchKey,
          match_value: matchValue,
          platform: 'main'
        });

      // 3. Mark alert as resolved
      const { error: alertError } = await supabase
        .from('system_alerts')
        .update({ 
          status: 'resolved',
          resolved_at: new Date().toISOString()
        })
        .eq('id', alertId);

      if (alertError) throw alertError;

      toast.success('Kierowca został dopasowany pomyślnie');
      onMatchComplete();
      onOpenChange(false);
    } catch (error) {
      console.error('Error matching driver:', error);
      toast.error('Nie udało się dopasować kierowcy');
    } finally {
      setMatching(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>Dopasuj kierowcę ręcznie</DialogTitle>
          <DialogDescription>
            Wybierz kierowcę, który odpowiada poniższym danym z CSV
          </DialogDescription>
        </DialogHeader>

        {/* CSV Row Data */}
        <div className="p-4 bg-muted rounded-lg space-y-2">
          <h3 className="font-semibold text-sm">Dane z CSV:</h3>
          <div className="grid grid-cols-2 gap-2 text-sm">
            {csvRow.email && (
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <span>{csvRow.email}</span>
              </div>
            )}
            {csvRow.bolt_id && (
              <div className="flex items-center gap-2">
                <Hash className="h-4 w-4 text-muted-foreground" />
                <span>Bolt ID: {csvRow.bolt_id}</span>
              </div>
            )}
            {csvRow.uber_id && (
              <div className="flex items-center gap-2">
                <Hash className="h-4 w-4 text-muted-foreground" />
                <span>Uber ID: {csvRow.uber_id}</span>
              </div>
            )}
            {csvRow.freenow_id && (
              <div className="flex items-center gap-2">
                <Hash className="h-4 w-4 text-muted-foreground" />
                <span>FreeNow ID: {csvRow.freenow_id}</span>
              </div>
            )}
            {csvRow.full_name && (
              <div className="flex items-center gap-2 col-span-2">
                <User className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">{csvRow.full_name}</span>
              </div>
            )}
          </div>
        </div>

        {/* Search */}
        <div className="space-y-2">
          <Label htmlFor="search">Wyszukaj kierowcę</Label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              id="search"
              placeholder="Szukaj po nazwisku, email, telefon, ID platform..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        {/* Drivers List */}
        <ScrollArea className="h-[300px] pr-4">
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">Ładowanie...</div>
          ) : filteredDrivers.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Nie znaleziono kierowców
            </div>
          ) : (
            <div className="space-y-2">
              {filteredDrivers.map((driver) => (
                <div
                  key={driver.id}
                  className="p-3 border rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 space-y-1">
                      <div className="font-medium">
                        {driver.first_name} {driver.last_name}
                      </div>
                      <div className="text-sm text-muted-foreground space-y-1">
                        {driver.email && (
                          <div className="flex items-center gap-2">
                            <Mail className="h-3 w-3" />
                            <span>{driver.email}</span>
                          </div>
                        )}
                        {driver.phone && (
                          <div className="flex items-center gap-2">
                            <Phone className="h-3 w-3" />
                            <span>{driver.phone}</span>
                          </div>
                        )}
                      </div>
                      <div className="flex gap-1 flex-wrap mt-2">
                        {driver.driver_platform_ids?.map((p: any, i: number) => (
                          <Badge key={i} variant="outline" className="text-xs">
                            {p.platform}: {p.platform_id}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => handleMatch(driver.id)}
                      disabled={matching}
                    >
                      Połącz
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};
