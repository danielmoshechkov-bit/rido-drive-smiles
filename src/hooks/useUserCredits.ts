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
        // Bonus powitalny i rekord salda tworzy wyłącznie idempotentny backend.
        setCredits(0);
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
    void amount;
    void featureKey;
    toast.error("Pobranie kredytów wymaga autoryzowanej operacji serwerowej. Operacja została zablokowana.");
    return false;
  }, [userId]);

  const addCredits = useCallback(async (amount: number): Promise<boolean> => {
    if (!userId) {
      toast.error("Musisz być zalogowany");
      return false;
    }
    void amount;
    toast.error("Dodawanie kredytów z przeglądarki jest zablokowane. Użyj zatwierdzonego zakupu serwerowego.");
    return false;
  }, [userId]);

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
