/**
 * Krok „płatność na terminalu" — wspólny dla paragonu ze zlecenia i szybkiego paragonu.
 *
 * Nie drukujemy paragonu, dopóki płatność nie zostanie potwierdzona. Odrzucenie nie kasuje
 * pozycji — kasjer wraca do wyboru formy płatności i próbuje inaczej (np. BLIK zamiast karty).
 */

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { CheckCircle2, CreditCard, Loader2, TriangleAlert, XCircle } from 'lucide-react';
import { formatPln } from '@/lib/fiscal';
import {
  TERMINAL_METHOD_LABELS,
  TERMINAL_PROVIDERS,
  type TerminalConfig,
  type TerminalMethod,
} from '@/lib/fiscalTerminal';

export type TerminalStepState = 'idle' | 'waiting' | 'approved' | 'declined';

interface Props {
  config: TerminalConfig;
  method: TerminalMethod;
  amountGrosze: number;
  state: TerminalStepState;
  message?: string | null;
  onApproved: () => void;
  onDeclined: () => void;
  onBack: () => void;
}

export function FiscalTerminalStep({
  config,
  method,
  amountGrosze,
  state,
  message,
  onApproved,
  onDeclined,
  onBack,
}: Props) {
  const provider = TERMINAL_PROVIDERS[config.provider];
  const manual = provider.mode === 'manual';

  if (state === 'declined') {
    return (
      <div className="space-y-3">
        <Alert variant="destructive">
          <XCircle className="h-4 w-4" />
          <AlertDescription>
            Płatność {TERMINAL_METHOD_LABELS[method]} nie doszła do skutku
            {message ? ` — ${message}` : '.'} Paragon <b>nie został wydrukowany</b>, więc nic nie trzeba korygować.
          </AlertDescription>
        </Alert>
        <Button variant="outline" onClick={onBack}>
          Wybierz inną formę płatności
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-lg border p-4 space-y-2">
        <div className="flex items-center gap-2 font-medium">
          {state === 'approved' ? (
            <CheckCircle2 className="h-4 w-4 text-green-600" />
          ) : (
            <Loader2 className="h-4 w-4 animate-spin" />
          )}
          {state === 'approved'
            ? 'Płatność potwierdzona'
            : manual
              ? `Zapłata ${TERMINAL_METHOD_LABELS[method]} na terminalu`
              : 'Czekam na odpowiedź terminala…'}
        </div>
        <div className="text-2xl font-bold">{formatPln(amountGrosze)}</div>
        <p className="text-xs text-muted-foreground">
          {manual
            ? `Wprowadź kwotę na terminalu i poczekaj na potwierdzenie transakcji. Paragon wydrukuje się dopiero po zatwierdzeniu.`
            : 'Kwota została wysłana na terminal. Poproś klienta o zbliżenie karty.'}
        </p>
      </div>

      {manual && state === 'waiting' && (
        <div className="flex flex-wrap gap-2">
          <Button onClick={onApproved} className="gap-2">
            <CheckCircle2 className="h-4 w-4" /> Zapłacono — drukuj paragon
          </Button>
          <Button variant="outline" onClick={onDeclined} className="gap-2">
            <TriangleAlert className="h-4 w-4" /> Płatność odrzucona
          </Button>
          <Button variant="ghost" onClick={onBack}>
            Anuluj
          </Button>
        </div>
      )}

      {state === 'waiting' && (
        <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
          <CreditCard className="h-3 w-3" /> {provider.label}
        </p>
      )}
    </div>
  );
}
