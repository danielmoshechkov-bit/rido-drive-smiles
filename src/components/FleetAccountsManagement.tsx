import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Plus, Trash2, Edit } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface Fleet {
  id: string;
  name: string;
}

interface FleetAccount {
  user_id: string;
  email: string;
  fleet_id: string;
  fleet_name: string;
  roles: string[];
}

export function FleetAccountsManagement() {
  const [fleets, setFleets] = useState<Fleet[]>([]);
  const [accounts, setAccounts] = useState<FleetAccount[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  
  const [formData, setFormData] = useState({
    email: '',
    phone: '',
    fleet_id: '',
    is_settlement: false,
    is_rental: false,
  });

  useEffect(() => {
    fetchFleets();
    fetchAccounts();
  }, []);

  const fetchFleets = async () => {
    const { data, error } = await supabase
      .from('fleets')
      .select('id, name')
      .order('name');

    if (error) {
      toast.error('Błąd ładowania flot: ' + error.message);
      return;
    }

    setFleets(data || []);
  };

  const fetchAccounts = async () => {
    try {
      const { data: userRoles, error } = await supabase
        .from('user_roles')
        .select(`
          user_id,
          role,
          fleet_id,
          fleets!inner(name)
        `)
        .in('role', ['fleet_settlement', 'fleet_rental']);

      if (error) throw error;

      // Grupuj według użytkownika
      const accountsMap = new Map<string, FleetAccount>();

      for (const ur of userRoles || []) {
        const key = `${ur.user_id}-${ur.fleet_id}`;
        if (!accountsMap.has(key)) {
          // Pobierz email użytkownika
          const { data: authData } = await supabase.auth.admin.getUserById(ur.user_id);
          
          accountsMap.set(key, {
            user_id: ur.user_id,
            email: authData?.user?.email || 'N/A',
            fleet_id: ur.fleet_id,
            fleet_name: (ur.fleets as any).name,
            roles: [ur.role],
          });
        } else {
          const account = accountsMap.get(key)!;
          account.roles.push(ur.role);
        }
      }

      setAccounts(Array.from(accountsMap.values()));
    } catch (error: any) {
      toast.error('Błąd ładowania kont: ' + error.message);
    }
  };

  const handleCreate = async () => {
    if (!formData.email || !formData.fleet_id) {
      toast.error('Wypełnij wymagane pola');
      return;
    }

    if (!formData.is_settlement && !formData.is_rental) {
      toast.error('Wybierz przynajmniej jeden typ konta');
      return;
    }

    setLoading(true);
    try {
      // Wywołaj edge function do utworzenia konta
      const roles = [];
      if (formData.is_settlement) roles.push('fleet_settlement');
      if (formData.is_rental) roles.push('fleet_rental');

      const { data, error } = await supabase.functions.invoke('create-fleet-account', {
        body: {
          email: formData.email,
          phone: formData.phone || null,
          fleet_id: formData.fleet_id,
          roles,
        },
      });

      if (error) throw error;

      toast.success('Konto flotowe zostało utworzone');
      setIsModalOpen(false);
      setFormData({ email: '', phone: '', fleet_id: '', is_settlement: false, is_rental: false });
      fetchAccounts();
    } catch (error: any) {
      toast.error('Błąd tworzenia konta: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (userId: string, fleetId: string) => {
    if (!confirm('Czy na pewno chcesz usunąć to konto?')) return;

    try {
      const { error } = await supabase
        .from('user_roles')
        .delete()
        .eq('user_id', userId)
        .eq('fleet_id', fleetId);

      if (error) throw error;

      toast.success('Konto zostało usunięte');
      fetchAccounts();
    } catch (error: any) {
      toast.error('Błąd usuwania konta: ' + error.message);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Konta flotowe</CardTitle>
        <Button onClick={() => setIsModalOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Dodaj konto flotowe
        </Button>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>Flota</TableHead>
              <TableHead>Typ konta</TableHead>
              <TableHead className="text-right">Akcje</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {accounts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground">
                  Brak kont flotowych
                </TableCell>
              </TableRow>
            ) : (
              accounts.map((account) => (
                <TableRow key={`${account.user_id}-${account.fleet_id}`}>
                  <TableCell>{account.email}</TableCell>
                  <TableCell>{account.fleet_name}</TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      {account.roles.includes('fleet_settlement') && (
                        <Badge variant="outline">Rozliczeniowy</Badge>
                      )}
                      {account.roles.includes('fleet_rental') && (
                        <Badge variant="outline">Wynajmujący</Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(account.user_id, account.fleet_id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Utwórz konto flotowe</DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              <div>
                <Label>Email *</Label>
                <Input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="email@example.com"
                />
              </div>

              <div>
                <Label>Telefon (opcjonalnie)</Label>
                <Input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="+48 123 456 789"
                />
              </div>

              <div>
                <Label>Flota *</Label>
                <Select value={formData.fleet_id} onValueChange={(value) => setFormData({ ...formData, fleet_id: value })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Wybierz flotę" />
                  </SelectTrigger>
                  <SelectContent>
                    {fleets.map((fleet) => (
                      <SelectItem key={fleet.id} value={fleet.id}>
                        {fleet.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Typ konta *</Label>
                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={formData.is_settlement}
                    onCheckedChange={(checked) => setFormData({ ...formData, is_settlement: !!checked })}
                  />
                  <Label className="font-normal">Rozliczeniowy (widzi pełne rozliczenia)</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={formData.is_rental}
                    onCheckedChange={(checked) => setFormData({ ...formData, is_rental: !!checked })}
                  />
                  <Label className="font-normal">Wynajmujący (widzi pokrycie wynajmu)</Label>
                </div>
              </div>

              <Button onClick={handleCreate} disabled={loading} className="w-full">
                {loading ? 'Tworzenie...' : 'Utwórz konto'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
