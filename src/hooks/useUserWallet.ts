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
  earnCoins: (amount: number, source: string, description?: string, referenceId?: string) => Promise<boolean>;
  spendCoins: (amount: number, source: string, description?: string, referenceId?: string) => Promise<boolean>;
  refreshWallet: () => Promise<void>;
  loadTransactions: (limit?: number) => Promise<void>;
}

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

      if (data) {
        setCoins(data.coins_balance || 0);
      } else {
        // Portfel tworzy wyłącznie zaufana funkcja serwerowa razem z ledgerem.
        setCoins(0);
      }
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

  const earnCoins = useCallback(async (
    amount: number, 
    source: string, 
    description?: string,
    referenceId?: string
  ): Promise<boolean> => {
    void userId;
    void amount;
    void source;
    void description;
    void referenceId;
    console.warn('Przyznawanie monet wymaga autoryzowanej funkcji serwerowej i wpisu w ledgerze.');
    return false;
  }, [userId]);

  const spendCoins = useCallback(async (
    amount: number, 
    source: string, 
    description?: string,
    referenceId?: string
  ): Promise<boolean> => {
    void userId;
    void amount;
    void source;
    void description;
    void referenceId;
    console.warn('Pobieranie monet wymaga autoryzowanej funkcji serwerowej i wpisu w ledgerze.');
    return false;
  }, [userId]);

  const refreshWallet = useCallback(async () => {
    setLoading(true);
    await fetchWallet();
  }, [fetchWallet]);

  return {
    coins,
    loading,
    transactions,
    transactionsLoading,
    earnCoins,
    spendCoins,
    refreshWallet,
    loadTransactions
  };
}
