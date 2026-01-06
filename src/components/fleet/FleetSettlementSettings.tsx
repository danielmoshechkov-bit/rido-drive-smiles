import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Plus, Trash2, Settings } from 'lucide-react';

interface FleetFee {
  id: string;
  name: string;
  amount: number;
  vat_rate: number;
  frequency: string;
  type: string;
  is_active: boolean;
  created_at: string;
}

interface FleetSettlementSettingsProps {
  fleetId: string;
}

export const FleetSettlementSettings = ({ fleetId }: FleetSettlementSettingsProps) => {
  const [fees, setFees] = useState<FleetFee[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  
  // Form state
  const [newFee, setNewFee] = useState<{
    name: string;
    amount: string;
    vat_rate: string;
    frequency: 'weekly' | 'monthly';
    type: 'fixed' | 'percent';
  }>({
    name: '',
    amount: '',
    vat_rate: '8',
    frequency: 'weekly',
    type: 'fixed',
  });

  useEffect(() => {
    fetchFees();
  }, [fleetId]);

  const fetchFees = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('fleet_settlement_fees' as any)
        .select('*')
        .eq('fleet_id', fleetId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setFees((data as unknown as FleetFee[]) || []);
    } catch (error) {
      console.error('Error fetching fees:', error);
      setFees([]);
    } finally {
      setLoading(false);
    }
  };

  const handleAddFee = async () => {
    if (!newFee.name || !newFee.amount) {
      toast.error('Wypełnij wszystkie pola');
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from('fleet_settlement_fees' as any)
        .insert({
          fleet_id: fleetId,
          name: newFee.name,
          amount: parseFloat(newFee.amount),
          vat_rate: parseFloat(newFee.vat_rate),
          frequency: newFee.frequency,
          type: newFee.type,
          is_active: true,
        });

      if (error) throw error;

      toast.success('Opłata dodana');
      setDialogOpen(false);
      setNewFee({
        name: '',
        amount: '',
        vat_rate: '8',
        frequency: 'weekly',
        type: 'fixed',
      });
      fetchFees();
    } catch (error: any) {
      console.error('Error adding fee:', error);
      toast.error('Błąd podczas dodawania opłaty');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteFee = async (feeId: string) => {
    if (!confirm('Czy na pewno chcesz usunąć tę opłatę?')) return;

    try {
      const { error } = await supabase
        .from('fleet_settlement_fees' as any)
        .delete()
        .eq('id', feeId);

      if (error) throw error;

      toast.success('Opłata usunięta');
      fetchFees();
    } catch (error) {
      console.error('Error deleting fee:', error);
      toast.error('Błąd podczas usuwania opłaty');
    }
  };

  const toggleFeeActive = async (fee: FleetFee) => {
    try {
      const { error } = await supabase
        .from('fleet_settlement_fees' as any)
        .update({ is_active: !fee.is_active })
        .eq('id', fee.id);

      if (error) throw error;

      toast.success(fee.is_active ? 'Opłata wyłączona' : 'Opłata włączona');
      fetchFees();
    } catch (error) {
      console.error('Error toggling fee:', error);
      toast.error('Błąd podczas zmiany statusu');
    }
  };

  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat('pl-PL', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount) + ' zł';
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                Ustawienia rozliczeń
              </CardTitle>
              <CardDescription>
                Skonfiguruj opłaty i stawki dla swoich kierowców
              </CardDescription>
            </div>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Dodaj opłatę
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Dodaj nową opłatę</DialogTitle>
                  <DialogDescription>
                    Opłata będzie automatycznie odejmowana od rozliczeń kierowców
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="fee-name">Nazwa opłaty</Label>
                    <Input
                      id="fee-name"
                      placeholder="np. Opłata serwisowa"
                      value={newFee.name}
                      onChange={(e) => setNewFee({ ...newFee, name: e.target.value })}
                    />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="fee-type">Typ</Label>
                      <Select
                        value={newFee.type}
                        onValueChange={(v: 'fixed' | 'percent') => setNewFee({ ...newFee, type: v })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="fixed">Kwota stała (zł)</SelectItem>
                          <SelectItem value="percent">Procent (%)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="fee-amount">
                        {newFee.type === 'fixed' ? 'Kwota (zł)' : 'Procent (%)'}
                      </Label>
                      <Input
                        id="fee-amount"
                        type="number"
                        step="0.01"
                        placeholder={newFee.type === 'fixed' ? '50.00' : '5'}
                        value={newFee.amount}
                        onChange={(e) => setNewFee({ ...newFee, amount: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="fee-vat">Stawka VAT (%)</Label>
                      <Select
                        value={newFee.vat_rate}
                        onValueChange={(v) => setNewFee({ ...newFee, vat_rate: v })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="0">0%</SelectItem>
                          <SelectItem value="5">5%</SelectItem>
                          <SelectItem value="8">8%</SelectItem>
                          <SelectItem value="23">23%</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="fee-frequency">Cykliczność</Label>
                      <Select
                        value={newFee.frequency}
                        onValueChange={(v: 'weekly' | 'monthly') => setNewFee({ ...newFee, frequency: v })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="weekly">Co tydzień</SelectItem>
                          <SelectItem value="monthly">Co miesiąc</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setDialogOpen(false)}>
                    Anuluj
                  </Button>
                  <Button onClick={handleAddFee} disabled={saving}>
                    {saving ? 'Zapisywanie...' : 'Dodaj opłatę'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">
              Ładowanie...
            </div>
          ) : fees.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>Brak skonfigurowanych opłat</p>
              <p className="text-sm mt-2">Dodaj opłatę, aby automatycznie odejmować ją od rozliczeń kierowców</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nazwa</TableHead>
                  <TableHead className="text-right">Kwota/Procent</TableHead>
                  <TableHead className="text-right">VAT</TableHead>
                  <TableHead>Cykliczność</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {fees.map((fee) => (
                  <TableRow key={fee.id}>
                    <TableCell className="font-medium">{fee.name}</TableCell>
                    <TableCell className="text-right">
                      {fee.type === 'fixed' 
                        ? formatCurrency(fee.amount)
                        : `${fee.amount}%`
                      }
                    </TableCell>
                    <TableCell className="text-right">{fee.vat_rate}%</TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {fee.frequency === 'weekly' ? 'Co tydzień' : 'Co miesiąc'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={fee.is_active ? 'default' : 'secondary'}
                        className="cursor-pointer"
                        onClick={() => toggleFeeActive(fee)}
                      >
                        {fee.is_active ? 'Aktywna' : 'Nieaktywna'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteFee(fee.id)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
