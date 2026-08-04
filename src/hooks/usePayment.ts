import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface InitiatePaymentParams {
  priceId?: string;
  productRefId?: string;
  /** @deprecated Nie jest wysyłane. Typ pozostaje chwilowo dla zgodności starych wywołań. */
  productType?: string;
  /** @deprecated Kwotę wyznacza wyłącznie katalog serwerowy. */
  amount?: number;
  /** @deprecated Opis tworzy serwer na podstawie katalogu. */
  description?: string;
  /** @deprecated Metadane klienta nie są przyjmowane przez bezpieczną inicjację. */
  metadata?: Record<string, unknown>;
  /** @deprecated Dostawa wymaga kanonicznego checkoutu po stronie serwera. */
  deliveryType?: string;
  /** @deprecated Dostawa wymaga kanonicznego checkoutu po stronie serwera. */
  inpostPointId?: string;
  /** @deprecated Dostawa wymaga kanonicznego checkoutu po stronie serwera. */
  deliveryAddress?: Record<string, unknown>;
  /** @deprecated Saldo portfela rozlicza wyłącznie serwer. */
  walletUsed?: number;
  /** Wywoływane dopiero przez przyszły, zweryfikowany callback płatności. */
  onSuccess?: () => void;
}

const LEGACY_PAYMENT_FLOW_BLOCKED =
  "Ten zakup wymaga bezpiecznego katalogu i serwerowego checkoutu. Płatność nie została uruchomiona.";

const IDEMPOTENCY_PREFIX = "rido:payment-intent:";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function paymentAttemptStorageKey(userId: string, priceId: string) {
  return `${IDEMPOTENCY_PREFIX}${userId}:${priceId}`;
}

function getOrCreateIdempotencyKey(userId: string, priceId: string, fallback: Map<string, string>) {
  const storageKey = paymentAttemptStorageKey(userId, priceId);
  try {
    const stored = window.sessionStorage.getItem(storageKey);
    if (stored && UUID_PATTERN.test(stored)) return { key: stored, storageKey };
    const key = crypto.randomUUID();
    window.sessionStorage.setItem(storageKey, key);
    return { key, storageKey };
  } catch {
    const existing = fallback.get(storageKey);
    if (existing) return { key: existing, storageKey };
    const key = crypto.randomUUID();
    fallback.set(storageKey, key);
    return { key, storageKey };
  }
}

function removeIdempotencyKey(storageKey: string, fallback: Map<string, string>) {
  fallback.delete(storageKey);
  try {
    window.sessionStorage.removeItem(storageKey);
  } catch {
    // Niedostępny storage nie może przerwać bezpiecznego przekierowania.
  }
}

function verifiedPaymentRedirect(rawUrl: unknown): URL {
  if (typeof rawUrl !== "string") throw new Error("Nieprawidłowy adres operatora płatności");
  const paymentUrl = new URL(rawUrl);
  const allowedOrigins = new Set(
    String(import.meta.env.VITE_PAYMENT_REDIRECT_ORIGINS || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
      .flatMap((value) => {
        try { return [new URL(value).origin]; } catch { return []; }
      }),
  );
  if (paymentUrl.protocol !== "https:" || !allowedOrigins.has(paymentUrl.origin)) {
    throw new Error("Adres operatora płatności nie znajduje się na allowliście");
  }
  return paymentUrl;
}

function hasLegacyClientOwnedValues(params: InitiatePaymentParams) {
  return params.productType !== undefined
    || params.productRefId !== undefined
    || params.amount !== undefined
    || params.description !== undefined
    || params.metadata !== undefined
    || params.deliveryType !== undefined
    || params.inpostPointId !== undefined
    || params.deliveryAddress !== undefined
    || params.walletUsed !== undefined;
}

export function usePayment() {
  const [loading, setLoading] = useState(false);
  const inFlight = useRef(false);
  const fallbackIdempotencyKeys = useRef(new Map<string, string>());

  const initiatePayment = useCallback(async (params: InitiatePaymentParams) => {
    if (inFlight.current) {
      toast.error("Inicjowanie płatności jest już w toku");
      return null;
    }

    const priceId = params.priceId?.trim() || null;
    if (!priceId) {
      toast.error("Brak kanonicznego identyfikatora produktu. Płatność została zablokowana.");
      return null;
    }
    if (hasLegacyClientOwnedValues(params)) {
      toast.error(
        params.productType === "marketplace_purchase"
          ? "Marketplace wymaga serwerowej migawki koszyka i dynamicznej wyceny. Checkout został zablokowany."
          : LEGACY_PAYMENT_FLOW_BLOCKED,
      );
      return null;
    }

    inFlight.current = true;
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error("Musisz być zalogowany aby dokonać płatności");
        return null;
      }

      const attempt = getOrCreateIdempotencyKey(user.id, priceId, fallbackIdempotencyKeys.current);

      const { data, error } = await supabase.functions.invoke("payment-core", {
        body: {
          action: "init",
          price_id: priceId,
        },
        headers: { "x-idempotency-key": attempt.key },
      });

      if (error) throw error;

      if (data?.simulated) {
        toast.error("Symulowane płatności są wyłączone ze względów bezpieczeństwa");
        return null;
      }

      if (data?.payment_url) {
        const paymentUrl = verifiedPaymentRedirect(data.payment_url);
        removeIdempotencyKey(attempt.storageKey, fallbackIdempotencyKeys.current);
        window.location.assign(paymentUrl.toString());
        return { paymentId: data.payment_id, simulated: false };
      }

      if (data?.status === "gateway_registration_blocked") {
        toast.error("Operator płatności nie został jeszcze bezpiecznie skonfigurowany. Intencja nie została opłacona.");
        return null;
      }

      toast.error(data?.error || "Błąd inicjowania płatności");
      return null;
    } catch (e: unknown) {
      toast.error("Błąd płatności: " + (e instanceof Error ? e.message : "Nieznany błąd"));
      return null;
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }, []);

  return { initiatePayment, loading };
}

export function useCredits(creditType: string) {
  const [balance, setBalance] = useState(0);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    // Stary model oczekiwał nieistniejących kolumn balance/credit_type.
    // Do czasu wdrożenia serwerowego, tenantowego widoku sald nie zgadujemy
    // wartości z kilku niezgodnych tabel i pokazujemy bezpieczne zero.
    void creditType;
    setBalance(0);
    setLoading(false);
  }, [creditType]);

  useEffect(() => { refresh(); }, [refresh]);

  return { balance, loading, refresh };
}

export async function checkAndDeductCredits(creditType: string, amountNeeded: number) {
  void creditType;
  void amountNeeded;
  toast.error("Pobranie kredytów musi wykonać autoryzowana funkcja serwerowa. Operacja została zablokowana.");
  return { ok: false, balance: 0, error: "server_credit_debit_required" };
}
