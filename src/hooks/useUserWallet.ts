import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface CoinTransaction {
  id: string;
  amount: number;
  type: 'earn' | 'spend' | 'bonus' | 'refund';
  source: string;
  description: string | null;
  reference_id: string | null;
  created_at: string;
}

interface UseUserWalletReturn {
  coins: number;
  loading: boolean;
  transactions: CoinTransaction[];
  transactionsLoading: boolean;
  refreshWallet: () => Promise<void>;
  loadTransactions: (limit?: number) => Promise<void>;
}

/**
 * Portfel monet — wyłącznie do odczytu.
 *
 * Hook zakładał wcześniej wiersz portfela insertem z przeglądarki i eksportował
 * earnCoins/spendCoins zmieniające saldo bezpośrednio. Żadna z tych funkcji nie
 * miała konsumenta (WalletTab czyta tylko saldo i historię), a każda była drogą
 * do dopisania sobie środków. Zakładanie portfela przejął trigger na auth.users.
 */
export function useUserWallet(userId?: string): UseUserWalletReturn {
  const [coins, setCoins] = useState(0);
  const [loading, setLoading] = useState(true);
  const [transactions, setTransactions] = useState<CoinTransaction[]>([]);
  const [transactionsLoading, setTransactionsLoading] = useState(false);

  const fetchWallet = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('user_wallets')
        .select('coins_balance')
        .eq('user_id', userId)
        .maybeSingle();

      if (error) {
        console.error('Error fetching wallet:', error);
        setCoins(0);
        return;
      }

      // Brak wiersza to po prostu zerowe saldo. Portfel zakłada trigger na
      // auth.users — klient nie zapisuje już nic do user_wallets.
      setCoins(data?.coins_balance || 0);
    } catch (err) {
      console.error('Wallet fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchWallet();
  }, [fetchWallet]);

  const loadTransactions = useCallback(async (limit = 50) => {
    if (!userId) return;

    setTransactionsLoading(true);
    try {
      const { data, error } = await supabase
        .from('coin_transactions')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        console.error('Error loading transactions:', error);
        return;
      }

      setTransactions((data || []) as CoinTransaction[]);
    } catch (err) {
      console.error('Transactions load error:', err);
    } finally {
      setTransactionsLoading(false);
    }
  }, [userId]);

  return {
    coins,
    loading,
    transactions,
    transactionsLoading,
    refreshWallet,
    loadTransactions
  };
}