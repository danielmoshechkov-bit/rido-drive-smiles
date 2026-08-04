import { createContext, useCallback, useContext, useState, ReactNode } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertTriangle, MessageSquare, Car, Loader2 } from 'lucide-react';
import { SmsPurchaseModal } from '@/components/SmsPurchaseModal';
import { VehicleLookupCreditsModal } from '@/components/vehicle/VehicleLookupCreditsModal';
import { toast } from 'sonner';

type QuotaKind = 'sms' | 'vehicle_lookup';

interface PendingAction {
  kind: QuotaKind;
  // The function that originally failed; will be retried after top-up
  retry: () => Promise<any> | any;
  // Friendly description for retry confirmation
  retryLabel?: string;
}

interface QuotaGuardCtx {
  /**
   * Wraps an action that consumes a quota. If the call returns a "no credits"
   * error (NO_SMS / NO_CREDITS / sms_balance), the user is prompted to top-up
   * and the action is automatically retried after a successful purchase.
   */
  runWithQuota: <T,>(kind: QuotaKind, action: () => Promise<T>, opts?: { retryLabel?: string }) => Promise<T | null>;
  // Manually open top-up dialogs
  openTopUp: (kind: QuotaKind) => void;
}

const Ctx = createContext<QuotaGuardCtx | null>(null);

export function useQuotaGuard() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useQuotaGuard must be used within QuotaGuardProvider');
  return c;
}

/** Heuristic: detect "no credits / no sms" errors from any function response */
function detectQuotaError(result: any, error: any): QuotaKind | null {
  const blob = JSON.stringify({ result, error: error?.message || error }).toLowerCase();
  if (
    blob.includes('no_credits') ||
    blob.includes('brak kredytów') ||
    blob.includes('brak kredytow') ||
    blob.includes('insufficient_credits')
  ) return 'vehicle_lookup';
  if (
    blob.includes('no_sms') ||
    blob.includes('brak sms') ||
    blob.includes('sms_balance') ||
    blob.includes('insufficient_sms') ||
    blob.includes('brak pakietu sms')
  ) return 'sms';
  return null;
}

export function QuotaGuardProvider({ children }: { children: ReactNode }) {
  const [smsModalOpen, setSmsModalOpen] = useState(false);
  const [vehicleModalOpen, setVehicleModalOpen] = useState(false);
  const [warning, setWarning] = useState<{ kind: QuotaKind } | null>(null);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [retrying, setRetrying] = useState(false);

  const openTopUp = useCallback((kind: QuotaKind) => {
    setWarning({ kind });
  }, []);

  const runWithQuota = useCallback(async <T,>(
    kind: QuotaKind,
    action: () => Promise<T>,
    opts?: { retryLabel?: string }
  ): Promise<T | null> => {
    try {
      const res: any = await action();
      // Edge functions return { error: 'NO_CREDITS' } in body too
      const detected = detectQuotaError(res, null);
      if (detected) {
        setPending({ kind: detected, retry: action, retryLabel: opts?.retryLabel });
        setWarning({ kind: detected });
        return null;
      }
      return res as T;
    } catch (err: any) {
      const detected = detectQuotaError(null, err) || kind;
      setPending({ kind: detected, retry: action, retryLabel: opts?.retryLabel });
      setWarning({ kind: detected });
      return null;
    }
  }, []);

  // After purchase success → ask to retry the original action
  const handlePurchased = useCallback(async (kind: QuotaKind) => {
    if (kind === 'sms') setSmsModalOpen(false);
    else setVehicleModalOpen(false);

    if (!pending) return;
    // Confirm retry
    const ok = window.confirm(
      pending.retryLabel
        ? `Pakiet doładowany. Czy chcesz teraz wykonać: ${pending.retryLabel}?`
        : kind === 'sms'
          ? 'Pakiet SMS doładowany. Czy wysłać teraz wcześniej oczekującą wiadomość SMS?'
          : 'Kredyty doładowane. Czy ponowić sprawdzanie pojazdu?'
    );
    if (!ok) {
      setPending(null);
      return;
    }
    setRetrying(true);
    try {
      await pending.retry();
      toast.success('Akcja wykonana po doładowaniu');
    } catch (e: any) {
      toast.error('Nie udało się wykonać akcji ponownie');
    } finally {
      setRetrying(false);
      setPending(null);
    }
  }, [pending]);

  const handleVehiclePurchase = useCallback(async (_credits: number, _priceNet: number) => {
    toast.error(
      'Zakup kredytów pojazdowych jest wstrzymany do czasu skonfigurowania kanonicznego pakietu po stronie serwera.',
    );
  }, []);

  const handleSmsPurchase = useCallback(async (_count: number, _priceNet: number) => {
    toast.error(
      'Zakup pakietu SMS jest wstrzymany do czasu skonfigurowania kanonicznego pakietu po stronie serwera.',
    );
  }, []);

  return (
    <Ctx.Provider value={{ runWithQuota, openTopUp }}>
      {children}

      {/* Warning dialog */}
      <Dialog open={!!warning} onOpenChange={(o) => !o && setWarning(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              {warning?.kind === 'sms' ? 'Brak pakietu SMS' : 'Brak kredytów na sprawdzanie pojazdu'}
            </DialogTitle>
            <DialogDescription>
              {warning?.kind === 'sms'
                ? 'Nie można wysłać wiadomości SMS – Twój pakiet SMS się skończył. Aby kontynuować, doładuj pakiet.'
                : 'Nie można pobrać danych pojazdu – brak kredytów. Aby kontynuować, doładuj pakiet kredytów.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setWarning(null); setPending(null); }}>
              Anuluj
            </Button>
            <Button
              className="gap-2"
              onClick={() => {
                if (!warning) return;
                if (warning.kind === 'sms') setSmsModalOpen(true);
                else setVehicleModalOpen(true);
                setWarning(null);
              }}
            >
              {warning?.kind === 'sms' ? <MessageSquare className="h-4 w-4" /> : <Car className="h-4 w-4" />}
              Doładuj teraz
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Top-up modals */}
      <SmsPurchaseModal
        open={smsModalOpen}
        onOpenChange={setSmsModalOpen}
        onPurchase={handleSmsPurchase}
      />
      <VehicleLookupCreditsModal
        open={vehicleModalOpen}
        onOpenChange={setVehicleModalOpen}
        onPurchase={handleVehiclePurchase}
      />

      {/* Retrying overlay */}
      {retrying && (
        <div className="fixed inset-0 z-[9999] bg-background/60 backdrop-blur-sm flex items-center justify-center">
          <div className="bg-card border rounded-lg p-6 flex items-center gap-3 shadow-lg">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>Powtarzam akcję po doładowaniu…</span>
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}
