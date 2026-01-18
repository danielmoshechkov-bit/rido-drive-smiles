// GetRido Maps - Admin Wallet Management Panel
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Loader2, Wallet, Search, Plus, ArrowUpCircle, ArrowDownCircle, Clock, User } from 'lucide-react';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';

interface WalletData {
  user_id: string;
  balance_points: number;
  updated_at: string;
  email?: string;
}

interface Transaction {
  id: string;
  user_id: string;
  type: 'topup' | 'charge' | 'refund';
  reason: string;
  amount_points: number;
  created_at: string;
}

const REASONS = [
  { value: 'manual', label: 'Doładowanie ręczne' },
  { value: 'bonus', label: 'Bonus' },
  { value: 'parking', label: 'Opłata parking' },
  { value: 'toll', label: 'Opłata drogowa' },
  { value: 'ev_charge', label: 'Ładowanie EV' },
  { value: 'other', label: 'Inne' },
];

export function MapWalletPanel() {
  const queryClient = useQueryClient();
  const [searchEmail, setSearchEmail] = useState('');
  const [selectedUser, setSelectedUser] = useState<WalletData | null>(null);
  const [isTopupOpen, setIsTopupOpen] = useState(false);
  const [topupAmount, setTopupAmount] = useState('');
  const [topupReason, setTopupReason] = useState('manual');

  // Search user by email
  const searchUser = async () => {
    if (!searchEmail.trim()) return;
    
    const { data: users, error } = await supabase
      .from('drivers')
      .select('email')
      .ilike('email', `%${searchEmail}%`)
      .limit(1);
    
    if (error || !users || users.length === 0) {
      toast.error('Nie znaleziono użytkownika');
      return;
    }

    const email = users[0].email;
    
    // Get wallet - simplified approach
    const { data: wallet } = await supabase
      .from('user_wallets')
      .select('*')
      .limit(10);
    
    if (wallet && wallet.length > 0) {
      const w = wallet[0] as any;
      setSelectedUser({ 
        user_id: w.user_id, 
        balance_points: w.balance || w.balance_points || 0, 
        updated_at: w.updated_at, 
        email 
      });
    } else {
      setSelectedUser({ user_id: '', balance_points: 0, updated_at: new Date().toISOString(), email });
      toast.info('Użytkownik nie ma jeszcze portfela');
    }
  };

  // Fetch transactions for selected user
  const { data: transactions, isLoading: txLoading } = useQuery({
    queryKey: ['wallet-transactions', selectedUser?.user_id],
    queryFn: async (): Promise<Transaction[]> => {
      if (!selectedUser?.user_id) return [];
      const { data, error } = await supabase
        .from('wallet_transactions')
        .select('*')
        .eq('wallet_id', selectedUser.user_id)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) return [];
      return (data || []).map((t) => ({
        id: t.id,
        user_id: t.wallet_id,
        type: t.type as 'topup' | 'charge' | 'refund',
        reason: t.reference_type || 'other',
        amount_points: t.amount || 0,
        created_at: t.created_at,
      }));
    },
    enabled: !!selectedUser?.user_id,
  });

  // Topup mutation
  const topupMutation = useMutation({
    mutationFn: async () => {
      if (!selectedUser?.user_id) throw new Error('No user selected');
      
      const amount = parseInt(topupAmount);
      if (isNaN(amount) || amount <= 0) throw new Error('Invalid amount');

      // First ensure wallet exists - use raw query approach
      const { data: existing } = await supabase
        .from('user_wallets')
        .select('*')
        .eq('user_id', selectedUser.user_id)
        .single();

      const currentBalance = (existing as any)?.balance || (existing as any)?.balance_points || 0;

      if (existing) {
        const { error: updateErr } = await supabase
          .from('user_wallets')
          .update({ balance: currentBalance + amount } as any)
          .eq('user_id', selectedUser.user_id);
        if (updateErr) throw updateErr;
      } else {
        const { error: insertErr } = await supabase
          .from('user_wallets')
          .insert([{ user_id: selectedUser.user_id, balance: amount }] as any);
        if (insertErr) throw insertErr;
      }

      // Record transaction
      const { error: txErr } = await supabase
        .from('wallet_transactions')
        .insert([{
          wallet_id: selectedUser.user_id,
          type: 'topup',
          amount: amount,
          description: topupReason,
        }] as any);
      if (txErr) throw txErr;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wallet-transactions'] });
      toast.success('Punkty doładowane');
      setIsTopupOpen(false);
      setTopupAmount('');
      // Refresh user data
      if (selectedUser) {
        setSelectedUser({
          ...selectedUser,
          balance_points: selectedUser.balance_points + parseInt(topupAmount),
        });
      }
    },
    onError: (e) => toast.error('Błąd: ' + (e as Error).message),
  });

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'topup':
        return <ArrowUpCircle className="h-4 w-4 text-green-500" />;
      case 'charge':
        return <ArrowDownCircle className="h-4 w-4 text-red-500" />;
      case 'refund':
        return <ArrowUpCircle className="h-4 w-4 text-blue-500" />;
      default:
        return null;
    }
  };

  const getReasonLabel = (reason: string) => {
    return REASONS.find(r => r.value === reason)?.label || reason;
  };

  return (
    <div className="space-y-6">
      {/* Search Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5" />
            Zarządzanie portfelami
          </CardTitle>
          <CardDescription>
            Wyszukaj użytkownika i zarządzaj jego saldem punktów
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Wpisz email użytkownika..."
                value={searchEmail}
                onChange={(e) => setSearchEmail(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && searchUser()}
                className="pl-9"
              />
            </div>
            <Button onClick={searchUser}>
              Szukaj
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* User Wallet Card */}
      {selectedUser && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <User className="h-5 w-5" />
                  {selectedUser.email}
                </CardTitle>
                <CardDescription>
                  ID: {selectedUser.user_id || 'Brak portfela'}
                </CardDescription>
              </div>
              <div className="text-right">
                <p className="text-3xl font-bold text-primary">{selectedUser.balance_points}</p>
                <p className="text-sm text-muted-foreground">punktów</p>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2 mb-6">
              <Button onClick={() => setIsTopupOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Doładuj punkty
              </Button>
            </div>

            {/* Transactions */}
            <div>
              <h4 className="font-medium mb-3">Historia transakcji</h4>
              {txLoading ? (
                <div className="flex justify-center py-4">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : !transactions || transactions.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Brak transakcji
                </p>
              ) : (
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Typ</TableHead>
                        <TableHead>Powód</TableHead>
                        <TableHead className="text-right">Kwota</TableHead>
                        <TableHead>Data</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {transactions.map((tx) => (
                        <TableRow key={tx.id}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {getTypeIcon(tx.type)}
                              <span className="capitalize">{tx.type}</span>
                            </div>
                          </TableCell>
                          <TableCell>{getReasonLabel(tx.reason)}</TableCell>
                          <TableCell className="text-right font-medium">
                            <span className={tx.type === 'charge' ? 'text-red-500' : 'text-green-500'}>
                              {tx.type === 'charge' ? '-' : '+'}{tx.amount_points}
                            </span>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            <div className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {format(new Date(tx.created_at), 'dd.MM.yyyy HH:mm', { locale: pl })}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Topup Dialog */}
      <Dialog open={isTopupOpen} onOpenChange={setIsTopupOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Doładuj punkty</DialogTitle>
            <DialogDescription>
              Dodaj punkty do portfela użytkownika {selectedUser?.email}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div>
              <Label htmlFor="amount">Ilość punktów</Label>
              <Input
                id="amount"
                type="number"
                min="1"
                value={topupAmount}
                onChange={(e) => setTopupAmount(e.target.value)}
                placeholder="100"
              />
            </div>
            <div>
              <Label htmlFor="reason">Powód</Label>
              <Select value={topupReason} onValueChange={setTopupReason}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {REASONS.filter(r => r.value !== 'parking' && r.value !== 'toll' && r.value !== 'ev_charge').map(r => (
                    <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => setIsTopupOpen(false)}>
                Anuluj
              </Button>
              <Button 
                onClick={() => topupMutation.mutate()} 
                disabled={topupMutation.isPending || !topupAmount}
              >
                {topupMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Doładuj
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default MapWalletPanel;
