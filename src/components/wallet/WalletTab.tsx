import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useUserWallet, CoinTransaction } from '@/hooks/useUserWallet';
import { Coins, TrendingUp, TrendingDown, Gift, RefreshCw, History, Plus } from 'lucide-react';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';
import { supabase } from '@/integrations/supabase/client';

interface WalletTabProps {
  className?: string;
}

export function WalletTab({ className }: WalletTabProps) {
  const [userId, setUserId] = useState<string | undefined>();
  
  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) setUserId(user.id);
    };
    getUser();
  }, []);

  const { 
    coins, 
    loading, 
    transactions, 
    transactionsLoading,
    loadTransactions,
    refreshWallet 
  } = useUserWallet(userId);

  useEffect(() => {
    if (userId) {
      loadTransactions(20);
    }
  }, [userId, loadTransactions]);

  const getTransactionIcon = (type: string) => {
    switch (type) {
      case 'earn':
        return <TrendingUp className="h-4 w-4 text-green-500" />;
      case 'spend':
        return <TrendingDown className="h-4 w-4 text-red-500" />;
      case 'bonus':
        return <Gift className="h-4 w-4 text-purple-500" />;
      case 'refund':
        return <RefreshCw className="h-4 w-4 text-blue-500" />;
      default:
        return <Coins className="h-4 w-4" />;
    }
  };

  const getTransactionBadge = (type: string) => {
    switch (type) {
      case 'earn':
        return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">Zarobione</Badge>;
      case 'spend':
        return <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">Wydane</Badge>;
      case 'bonus':
        return <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">Bonus</Badge>;
      case 'refund':
        return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">Zwrot</Badge>;
      default:
        return <Badge variant="secondary">{type}</Badge>;
    }
  };

  const getSourceLabel = (source: string) => {
    const labels: Record<string, string> = {
      referral: 'Polecenie',
      purchase: 'Zakup',
      ai_feature: 'Funkcja AI',
      loyalty: 'Program lojalnościowy',
      promo: 'Promocja',
      registration_bonus: 'Bonus rejestracyjny'
    };
    return labels[source] || source;
  };

  if (loading) {
    return (
      <div className={className}>
        <div className="grid gap-6">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className={className}>
      <div className="grid gap-6">
        {/* Balance Card */}
        <Card className="bg-gradient-to-br from-primary/10 via-primary/5 to-background border-primary/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Coins className="h-6 w-6 text-primary" />
              Twój portfel Rido
            </CardTitle>
            <CardDescription>
              Monety Rido możesz wykorzystać na funkcje AI i usługi premium
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-4xl font-bold text-primary">{coins.toLocaleString()}</p>
                <p className="text-sm text-muted-foreground mt-1">Rido Coins</p>
              </div>
              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => {
                    refreshWallet();
                    loadTransactions(20);
                  }}
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Odśwież
                </Button>
                <Button size="sm" disabled>
                  <Plus className="h-4 w-4 mr-2" />
                  Doładuj
                  <Badge variant="secondary" className="ml-2 text-xs">Wkrótce</Badge>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Transaction History */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              Historia transakcji
            </CardTitle>
            <CardDescription>
              Ostatnie operacje na Twoim portfelu
            </CardDescription>
          </CardHeader>
          <CardContent>
            {transactionsLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : transactions.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Coins className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>Brak transakcji</p>
                <p className="text-sm">Twoje transakcje pojawią się tutaj</p>
              </div>
            ) : (
              <div className="space-y-3">
                {transactions.map((tx) => (
                  <div 
                    key={tx.id} 
                    className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                        {getTransactionIcon(tx.type)}
                      </div>
                      <div>
                        <p className="font-medium text-sm">
                          {tx.description || getSourceLabel(tx.source)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(tx.created_at), 'd MMM yyyy, HH:mm', { locale: pl })}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {getTransactionBadge(tx.type)}
                      <span className={`font-semibold ${tx.amount > 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {tx.amount > 0 ? '+' : ''}{tx.amount}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}