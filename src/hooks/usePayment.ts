import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface InitiatePaymentParams {
  productType: string;
  productRefId?: string;
  amount: number;
  description: string;
  metadata?: Record<string, any>;
  deliveryType?: string;
  inpostPointId?: string;
  deliveryAddress?: Record<string, any>;
  onSuccess?: () => void;
}

export function usePayment() {
  const [loading, setLoading] = useState(false);

  const initiatePayment = useCallback(async (params: InitiatePaymentParams) => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error("Musisz być zalogowany aby dokonać płatności");
        return null;
      }

      const { data, error } = await supabase.functions.invoke("payment-core", {
        body: {
          action: "init",
          user_id: user.id,
          product_type: params.productType,
          product_ref_id: params.productRefId || null,
          amount: params.amount,
          description: params.description,
          metadata: params.metadata || {},
          delivery_type: params.deliveryType || null,
          inpost_point_id: params.inpostPointId || null,
          delivery_address: params.deliveryAddress || null,
          return_url: window.location.origin + "/payment/success",
        },
      });

      if (error) throw error;

      if (data?.simulated) {
        // Payment was simulated (no gateway configured)
        toast.success("Płatność zrealizowana!");
        params.onSuccess?.();
        return { paymentId: data.payment_id, simulated: true };
      }

      if (data?.payment_url) {
        window.location.href = data.payment_url;
        return { paymentId: data.payment_id, simulated: false };
      }

      toast.error(data?.error || "Błąd inicjowania płatności");
      return null;
    } catch (e: any) {
      toast.error("Błąd płatności: " + (e.message || "Nieznany błąd"));
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return { initiatePayment, loading };
}

export function useCredits(creditType: string) {
  const [balance, setBalance] = useState(0);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }

      const { data } = await supabase
        .from("user_credits")
        .select("balance")
        .eq("user_id", user.id)
        .eq("credit_type", creditType)
        .maybeSingle();

      setBalance(data?.balance || 0);
    } catch { /* ignore */ }
    setLoading(false);
  }, [creditType]);

  useEffect(() => { refresh(); }, [refresh]);

  return { balance, loading, refresh };
}

export async function checkAndDeductCredits(creditType: string, amountNeeded: number) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, balance: 0 };

  const { data, error } = await supabase.functions.invoke("payment-core", {
    body: {
      action: "credits_check",
      user_id: user.id,
      credit_type: creditType,
      amount_needed: amountNeeded,
    },
  });

  if (error) {
    toast.error("Błąd sprawdzania kredytów");
    return { ok: false, balance: 0 };
  }

  return data;
}
