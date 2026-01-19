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
        // Create wallet if not exists
        const { error: insertError } = await supabase
          .from('user_wallets')
          .insert({ 
            user_id: userId, 
            balance: 0,
            coins_balance: 0,
            total_earned: 0,
            total_spent: 0
          });

        if (!insertError) {
          setCoins(0);
        }
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
    if (!userId || amount <= 0) return false;

    try {
      // Update wallet
      const { error: updateError } = await supabase
        .from('user_wallets')
        .update({ 
          coins_balance: coins + amount,
          total_earned: supabase.rpc ? undefined : coins + amount // Would use raw SQL
        })
        .eq('user_id', userId);

      if (updateError) {
        // Try upsert if update fails
        const { error: upsertError } = await supabase
          .from('user_wallets')
          .upsert({ 
            user_id: userId, 
            coins_balance: amount,
            total_earned: amount,
            balance: 0
          });

        if (upsertError) {
          console.error('Error earning coins:', upsertError);
          return false;
        }
      }

      // Log transaction
      await supabase.from('coin_transactions').insert({
        user_id: userId,
        amount,
        type: 'earn',
        source,
        description: description || null,
        reference_id: referenceId || null
      });

      setCoins(prev => prev + amount);
      return true;
    } catch (err) {
      console.error('Earn coins error:', err);
      return false;
    }
  }, [userId, coins]);

  const spendCoins = useCallback(async (
    amount: number, 
    source: string, 
    description?: string,
    referenceId?: string
  ): Promise<boolean> => {
    if (!userId || amount <= 0) return false;
    if (coins < amount) return false;

    try {
      const { error: updateError } = await supabase
        .from('user_wallets')
        .update({ 
          coins_balance: coins - amount
        })
        .eq('user_id', userId);

      if (updateError) {
        console.error('Error spending coins:', updateError);
        return false;
      }

      // Log transaction
      await supabase.from('coin_transactions').insert({
        user_id: userId,
        amount: -amount,
        type: 'spend',
        source,
        description: description || null,
        reference_id: referenceId || null
      });

      setCoins(prev => prev - amount);
      return true;
    } catch (err) {
      console.error('Spend coins error:', err);
      return false;
    }
  }, [userId, coins]);

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