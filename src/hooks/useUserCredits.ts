import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface UseUserCreditsReturn {
  credits: number;
  loading: boolean;
  refreshCredits: () => Promise<void>;
}

/**
 * Saldo kredytów AI — wyłącznie do odczytu.
 *
 * Wcześniej ten hook sam przyznawał 50 kredytów insertem z przeglądarki, gdy
 * użytkownik nie miał jeszcze wiersza. Jedynym bezpiecznikiem było „wiersz nie
 * istnieje", a polityka RLS pozwalała ten wiersz skasować — czyli bonus dawał się
 * odebrać dowolną liczbę razy. Przyznaniem zajmuje się teraz payment-core, który
 * pilnuje jednorazowości wpisem w księdze, a nie obecnością salda.
 *
 * Hook eksportował też addCredits i deductCredits. Nie miały żadnego konsumenta,
 * a deductCredits i tak odbijało się od RLS przy zapisie do ai_credit_history —
 * usunięte razem z całą ścieżką zapisu z klienta.
 */
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
        return;
      }

      if (data) {
        setCredits(data.credits_balance || 0);
        return;
      }

      // Brak salda — poproś serwer o bonus powitalny. Kwotę i jednorazowość
      // rozstrzyga payment-core; tutaj tylko pokazujemy wynik.
      const { data: claim, error: claimError } = await supabase.functions.invoke("payment-core", {
        body: { action: "welcome_credits_claim" },
      });

      if (claimError) {
        console.error("Error claiming welcome credits:", claimError);
        setCredits(0);
        return;
      }

      setCredits(claim?.balance ?? 0);
      if (claim?.granted) {
        toast.success(`Otrzymałeś ${claim.balance} darmowych kredytów AI! 🎉`);
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

  return {
    credits,
    loading,
    refreshCredits: fetchCredits,
  };
}
