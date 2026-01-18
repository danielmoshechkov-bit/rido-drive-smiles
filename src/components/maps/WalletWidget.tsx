/**
 * GetRido Maps - Wallet Widget
 * Shows user's point balance
 */
import { useState, useEffect } from 'react';
import { Wallet, Loader2, Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { supabase } from '@/integrations/supabase/client';

interface WalletWidgetProps {
  className?: string;
  compact?: boolean;
}

const WalletWidget = ({ className = '', compact = false }: WalletWidgetProps) => {
  const [balance, setBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    const fetchWallet = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        
        if (!user) {
          setLoading(false);
          return;
        }
        
        setUserId(user.id);

        const { data, error } = await supabase
          .from('user_wallets')
          .select('balance')
          .eq('user_id', user.id)
          .single();

        if (error && error.code !== 'PGRST116') { // PGRST116 = no rows
          console.error('[WalletWidget] Error:', error);
        }

        setBalance(data?.balance ?? 0);
      } catch (error) {
        console.error('[WalletWidget] Fetch error:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchWallet();
  }, []);

  // Don't show if not logged in
  if (!userId && !loading) {
    return null;
  }

  if (compact) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge 
              variant="secondary" 
              className={`gap-1.5 cursor-default ${className}`}
            >
              <Wallet className="h-3 w-3 text-amber-500" />
              {loading ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <span className="font-bold">{balance ?? 0}</span>
              )}
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            <p>Saldo GetRido Wallet: {balance ?? 0} pkt</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <div className={`flex items-center gap-2 p-3 bg-gradient-to-r from-amber-500/10 to-amber-500/5 rounded-xl border border-amber-500/20 ${className}`}>
      <div className="h-9 w-9 rounded-full bg-amber-500/20 flex items-center justify-center">
        <Wallet className="h-5 w-5 text-amber-600" />
      </div>
      <div className="flex-1">
        <p className="text-xs text-muted-foreground">GetRido Wallet</p>
        <p className="font-bold text-lg">
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>{balance ?? 0} <span className="text-sm font-normal text-muted-foreground">pkt</span></>
          )}
        </p>
      </div>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="outline" size="icon" disabled className="h-8 w-8">
              <Plus className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Doładuj punkty (wkrótce)</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
};

export default WalletWidget;
