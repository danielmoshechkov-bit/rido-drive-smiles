/**
 * Sekcja „Nabywca" — wspólna dla paragonu ze zlecenia i szybkiego paragonu z Kasy.
 *
 * Zasady zaszyte w jednym miejscu, żeby nie rozjechały się między dialogami:
 *  • błędny NIP BLOKUJE wydruk (paragonu fiskalnego z błędnym numerem nie da się poprawić),
 *  • do 450 zł paragon z NIP jest fakturą uproszczoną, powyżej — tylko ostrzeżenie,
 *  • NIP można zapamiętać przy kliencie, żeby wracał sam przy kolejnych dokumentach.
 */

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Building2, CheckCircle2, FileText, Save, TriangleAlert, User } from 'lucide-react';
import { toast } from 'sonner';
import { useRememberClientNip } from '@/hooks/useFiscal';
import { formatNip, isSimplifiedInvoice, isValidNip, normalizeNip, SIMPLIFIED_INVOICE_LIMIT_GROSZE } from '@/lib/nip';

export type BuyerType = 'individual' | 'company';

export interface BuyerState {
  buyerType: BuyerType;
  nip: string;
  printNip: boolean;
}

interface Props extends BuyerState {
  onChange: (patch: Partial<BuyerState>) => void;
  totalGrosze: number;
  /** Klient z kartoteki — pozwala zapamiętać NIP na przyszłość. */
  client?: { id?: string; nip?: string | null; client_type?: string | null } | null;
  /** Skrót „Wystaw fakturę zamiast paragonu" przy kwocie powyżej progu. */
  onIssueInvoice?: () => void;
}

/** Czy dane nabywcy blokują wydruk (firma + drukowanie NIP + numer niepoprawny). */
export function buyerBlocksPrint(state: BuyerState): boolean {
  const digits = normalizeNip(state.nip);
  return state.buyerType === 'company' && state.printNip && digits.length > 0 && !isValidNip(digits);
}

/** NIP do wysłania na drukarkę — tylko gdy firma, zaznaczone drukowanie i numer poprawny. */
export function buyerNipForPrint(state: BuyerState): string | undefined {
  const digits = normalizeNip(state.nip);
  return state.buyerType === 'company' && state.printNip && isValidNip(digits) ? digits : undefined;
}

export function FiscalBuyerSection({ buyerType, nip, printNip, onChange, totalGrosze, client, onIssueInvoice }: Props) {
  const rememberNip = useRememberClientNip();

  const nipDigits = normalizeNip(nip);
  const nipValid = isValidNip(nipDigits);
  const nipTouched = nipDigits.length > 0;
  const isCompany = buyerType === 'company';
  const blocks = isCompany && printNip && nipTouched && !nipValid;
  const simplified = isSimplifiedInvoice(totalGrosze);
  const canRemember = Boolean(client?.id) && nipValid && normalizeNip(client?.nip ?? '') !== nipDigits;

  return (
    <div className="rounded-lg border p-3 space-y-3">
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-sm text-muted-foreground">Nabywca</span>
        <div className="flex gap-1 rounded-md border p-0.5">
          <Button
            type="button"
            size="sm"
            variant={buyerType === 'individual' ? 'default' : 'ghost'}
            className="h-7 gap-1"
            onClick={() => onChange({ buyerType: 'individual' })}
          >
            <User className="h-3.5 w-3.5" /> Osoba prywatna
          </Button>
          <Button
            type="button"
            size="sm"
            variant={buyerType === 'company' ? 'default' : 'ghost'}
            className="h-7 gap-1"
            onClick={() => onChange({ buyerType: 'company' })}
          >
            <Building2 className="h-3.5 w-3.5" /> Firma
          </Button>
        </div>
      </div>

      {isCompany && (
        <div className="space-y-2">
          <div className="flex items-end gap-3 flex-wrap">
            <div className="space-y-1">
              <Label className="text-xs">NIP nabywcy</Label>
              <Input
                value={nip}
                onChange={(e) => onChange({ nip: e.target.value })}
                placeholder="10 cyfr"
                className={`h-8 w-44 font-mono ${blocks ? 'border-destructive' : ''}`}
              />
            </div>
            <label className="flex items-center gap-2 text-sm pb-1.5 cursor-pointer">
              <Checkbox checked={printNip} onCheckedChange={(v) => onChange({ printNip: v === true })} />
              Drukuj NIP na paragonie
            </label>
            {canRemember && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 gap-1 text-xs pb-1"
                disabled={rememberNip.isPending}
                onClick={async () => {
                  try {
                    await rememberNip.mutateAsync({
                      clientId: client!.id!,
                      nip: nipDigits,
                      setCompany: client?.client_type !== 'company',
                    });
                    toast.success('Zapamiętano NIP przy kliencie.');
                  } catch (e: any) {
                    toast.error(e?.message || 'Nie udało się zapisać NIP-u.');
                  }
                }}
              >
                <Save className="h-3 w-3" /> Zapamiętaj przy kliencie
              </Button>
            )}
          </div>

          {blocks && (
            <p className="text-xs text-destructive">
              Nieprawidłowy NIP (suma kontrolna się nie zgadza). Paragonu z błędnym NIP-em nie da się poprawić —
              popraw numer albo odznacz drukowanie NIP-u.
            </p>
          )}
          {nipValid && <p className="text-xs text-muted-foreground">NIP poprawny: {formatNip(nipDigits)}</p>}
          {isCompany && printNip && !nipTouched && (
            <p className="text-xs text-muted-foreground">Brak NIP-u — paragon wyjdzie bez numeru nabywcy.</p>
          )}

          {simplified ? (
            <Alert>
              <CheckCircle2 className="h-4 w-4" />
              <AlertDescription className="text-xs">
                Paragon z NIP do {(SIMPLIFIED_INVOICE_LIMIT_GROSZE / 100).toFixed(0)} zł jest fakturą uproszczoną —
                nie trzeba wystawiać osobnej faktury.
              </AlertDescription>
            </Alert>
          ) : (
            <Alert>
              <TriangleAlert className="h-4 w-4" />
              <AlertDescription className="text-xs flex items-center justify-between gap-3 flex-wrap">
                <span>
                  Powyżej {(SIMPLIFIED_INVOICE_LIMIT_GROSZE / 100).toFixed(0)} zł paragon z NIP nie zastępuje
                  faktury — firma będzie potrzebowała pełnej faktury.
                </span>
                {onIssueInvoice && (
                  <Button variant="outline" size="sm" className="h-7 gap-1 shrink-0" onClick={onIssueInvoice}>
                    <FileText className="h-3.5 w-3.5" /> Wystaw fakturę zamiast paragonu
                  </Button>
                )}
              </AlertDescription>
            </Alert>
          )}
        </div>
      )}
    </div>
  );
}
