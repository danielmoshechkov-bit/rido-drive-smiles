import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface UseUserCreditsReturn {
  credits: number;
  loading: boolean;
  deductCredits: (amount: number, featureKey: string) => Promise<boolean>;
  addCredits: (amount: number) => Promise<boolean>;
  refreshCredits: () => Promise<void>;
}

export function useUserCredits(userId?: string): UseUserCreditsReturn {
  const [credits, setCredits] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchCredits = useCallback(async () => {
    if (!userId) {
      setCredits(0);
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from("user_credits")
        .select("credits_balance")
        .eq("user_id", userId)
        .maybeSingle();

      if (error && error.code !== "PGRST116") {
        console.error("Error fetching credits:", error);
        setCredits(0);
      } else if (data) {
        setCredits(data.credits_balance || 0);
      } else {
        // Create initial credits record with bonus credits
        const { data: newData, error: insertError } = await supabase
          .from("user_credits")
          .insert({ user_id: userId, credits_balance: 50 }) // 50 free credits for new users
          .select("credits_balance")
          .single();

        if (!insertError && newData) {
          setCredits(newData.credits_balance);
          toast.success("Otrzymałeś 50 darmowych kredytów AI! 🎉");
        } else {
          setCredits(0);
        }
      }
    } catch (err) {
      console.error("Error in fetchCredits:", err);
      setCredits(0);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchCredits();
  }, [fetchCredits]);

  const deductCredits = useCallback(async (amount: number, featureKey: string): Promise<boolean> => {
    if (!userId) {
      toast.error("Musisz być zalogowany");
      return false;
    }

    if (credits < amount) {
      toast.error(`Niewystarczająca ilość kredytów. Potrzebujesz ${amount}, masz ${credits}.`);
      return false;
    }

    try {
      const newBalance = credits - amount;
      
      const { error } = await supabase
        .from("user_credits")
        .update({ 
          credits_balance: newBalance,
          updated_at: new Date().toISOString()
        })
        .eq("user_id", userId);

      if (error) {
        console.error("Error deducting credits:", error);
        toast.error("Błąd podczas pobierania kredytów");
        return false;
      }

      // Log the usage
      await supabase.from("ai_credit_history").insert({
        user_id: userId,
        query_type: featureKey,
        credits_used: amount,
        was_free: false,
      });

      setCredits(newBalance);
      return true;
    } catch (err) {
      console.error("Error in deductCredits:", err);
      toast.error("Błąd podczas pobierania kredytów");
      return false;
    }
  }, [userId, credits]);

  const addCredits = useCallback(async (amount: number): Promise<boolean> => {
    if (!userId) {
      toast.error("Musisz być zalogowany");
      return false;
    }

    try {
      const newBalance = credits + amount;
      
      const { error } = await supabase
        .from("user_credits")
        .update({ 
          credits_balance: newBalance,
          updated_at: new Date().toISOString()
        })
        .eq("user_id", userId);

      if (error) {
        console.error("Error adding credits:", error);
        toast.error("Błąd podczas dodawania kredytów");
        return false;
      }

      setCredits(newBalance);
      toast.success(`Dodano ${amount} kredytów!`);
      return true;
    } catch (err) {
      console.error("Error in addCredits:", err);
      toast.error("Błąd podczas dodawania kredytów");
      return false;
    }
  }, [userId, credits]);

  const refreshCredits = useCallback(async () => {
    setLoading(true);
    await fetchCredits();
  }, [fetchCredits]);

  return {
    credits,
    loading,
    deductCredits,
    addCredits,
    refreshCredits,
  };
}
