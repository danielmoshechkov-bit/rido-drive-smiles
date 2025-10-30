import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Plus, Trash2, Calendar } from 'lucide-react';
import { format } from 'date-fns';

interface AdditionalFee {
  id: string;
  driver_id: string;
  description: string;
  amount: number;
  frequency: string;
  start_date: string;
  end_date: string | null;
  is_active: boolean;
}

interface DriverAdditionalFeesProps {
  isOpen: boolean;
  onClose: () => void;
  driverId: string;
  driverName: string;
}

export const DriverAdditionalFees = ({ 
  isOpen, 
  onClose, 
  driverId, 
  driverName 
}: DriverAdditionalFeesProps) => {
  const [fees, setFees] = useState<AdditionalFee[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newFee, setNewFee] = useState({
    description: '',
    amount: 0,
    frequency: 'weekly' as const,
    start_date: format(new Date(), 'yyyy-MM-dd'),
    end_date: '',
  });

  useEffect(() => {
    if (isOpen) {
      loadFees();
    }
  }, [isOpen, driverId]);

  const loadFees = async () => {
    try {
      const { data, error } = await supabase
        .from('driver_additional_fees')
        .select('*')
        .eq('driver_id', driverId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setFees(data || []);
    } catch (error: any) {
      toast.error('Błąd ładowania opłat: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const addFee = async () => {
    if (!newFee.description || newFee.amount <= 0) {
      toast.error('Wypełnij opis i kwotę');
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();

      const { error } = await supabase
        .from('driver_additional_fees')
        .insert({
          driver_id: driverId,
          description: newFee.description,
          amount: newFee.amount,
          frequency: newFee.frequency,
          start_date: newFee.start_date,
          end_date: newFee.end_date || null,
          is_active: true,
          created_by: user?.id
        });

      if (error) throw error;

      toast.success('Opłata dodana');
      setNewFee({
        description: '',
        amount: 0,
        frequency: 'weekly',
        start_date: format(new Date(), 'yyyy-MM-dd'),
        end_date: '',
      });
      setShowAddForm(false);
      loadFees();
    } catch (error: any) {
      toast.error('Błąd dodawania opłaty: ' + error.message);
    }
  };

  const toggleFeeStatus = async (feeId: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase
        .from('driver_additional_fees')
        .update({ is_active: !currentStatus })
        .eq('id', feeId);

      if (error) throw error;
      toast.success(currentStatus ? 'Opłata dezaktywowana' : 'Opłata aktywowana');
      loadFees();
    } catch (error: any) {
      toast.error('Błąd zmiany statusu: ' + error.message);
    }
  };

  const deleteFee = async (feeId: string) => {
    if (!confirm('Czy na pewno chcesz usunąć tę opłatę?')) return;

    try {
      const { error } = await supabase
        .from('driver_additional_fees')
        .delete()
        .eq('id', feeId);

      if (error) throw error;
      toast.success('Opłata usunięta');
      loadFees();
    } catch (error: any) {
      toast.error('Błąd usuwania opłaty: ' + error.message);
    }
  };

  const getFrequencyLabel = (frequency: string) => {
    switch (frequency) {
      case 'weekly': return 'Co tydzień';
      case 'monthly': return 'Co miesiąc';
      case 'once': return 'Jednorazowo';
      default: return frequency;
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Dodatkowe opłaty - {driverName}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {!showAddForm && (
            <Button onClick={() => setShowAddForm(true)} className="w-full gap-2">
              <Plus className="h-4 w-4" />
              Dodaj nową opłatę
            </Button>
          )}

          {showAddForm && (
            <div className="border rounded-lg p-4 bg-muted/50 space-y-4">
              <div>
                <Label>Opis opłaty</Label>
                <Input
                  value={newFee.description}
                  onChange={(e) => setNewFee({ ...newFee, description: e.target.value })}
                  placeholder="np. Składka ZUS, Ubezpieczenie..."
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Kwota (PLN)</Label>
                  <Input
                    type="number"
                    value={newFee.amount || ''}
                    onChange={(e) => setNewFee({ ...newFee, amount: Number(e.target.value) })}
                  />
                </div>
                <div>
                  <Label>Częstotliwość</Label>
                  <Select
                    value={newFee.frequency}
                    onValueChange={(value: any) => setNewFee({ ...newFee, frequency: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="weekly">Co tydzień</SelectItem>
                      <SelectItem value="monthly">Co miesiąc</SelectItem>
                      <SelectItem value="once">Jednorazowo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Data rozpoczęcia</Label>
                  <Input
                    type="date"
                    value={newFee.start_date}
                    onChange={(e) => setNewFee({ ...newFee, start_date: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Data zakończenia (opcjonalnie)</Label>
                  <Input
                    type="date"
                    value={newFee.end_date}
                    onChange={(e) => setNewFee({ ...newFee, end_date: e.target.value })}
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <Button onClick={addFee}>Dodaj opłatę</Button>
                <Button onClick={() => setShowAddForm(false)} variant="outline">
                  Anuluj
                </Button>
              </div>
            </div>
          )}

          {loading ? (
            <p className="text-center text-muted-foreground py-8">Ładowanie...</p>
          ) : fees.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              Brak dodatkowych opłat dla tego kierowcy
            </p>
          ) : (
            <div className="space-y-2">
              {fees.map((fee) => (
                <div
                  key={fee.id}
                  className={`border rounded-lg p-4 ${
                    !fee.is_active ? 'bg-muted/50 opacity-60' : ''
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-medium">{fee.description}</h4>
                        <span className="text-sm text-muted-foreground">
                          ({getFrequencyLabel(fee.frequency)})
                        </span>
                      </div>
                      <div className="text-lg font-bold text-primary mb-2">
                        {fee.amount.toFixed(2)} PLN
                      </div>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          <span>Od: {format(new Date(fee.start_date), 'dd.MM.yyyy')}</span>
                        </div>
                        {fee.end_date && (
                          <div className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            <span>Do: {format(new Date(fee.end_date), 'dd.MM.yyyy')}</span>
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-2">
                        <Switch
                          checked={fee.is_active}
                          onCheckedChange={() => toggleFeeStatus(fee.id, fee.is_active)}
                        />
                        <Label className="text-xs">
                          {fee.is_active ? 'Aktywna' : 'Nieaktywna'}
                        </Label>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteFee(fee.id)}
                      className="text-red-500 hover:text-red-700"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};