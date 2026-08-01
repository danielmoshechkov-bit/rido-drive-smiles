/**
 * Korekta oczywistej pomyłki — ewidencja ODRĘBNA od zwrotów.
 *
 * Rozporządzenie MF rozdziela dwa przypadki i zabrania ich łączenia:
 *   • klient oddaje towar / uznana reklamacja → ewidencja zwrotów (FiscalReturnDialog)
 *   • kasjer nabił błędnie                    → ewidencja pomyłek (ten dialog)
 *
 * Po zarejestrowaniu pomyłki procedura wymaga zaewidencjonowania sprzedaży NA NOWO
 * w prawidłowej wysokości — dlatego zlecenie zostaje odblokowane do ponownej fiskalizacji.
 * Błędny paragon zostaje w logu: obrót trafił do pamięci fiskalnej i nie da się go cofnąć.
 */

import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, TriangleAlert, CheckCircle2, FileWarning, Receipt } from 'lucide-react';
import { toast } from 'sonner';
import { useRegisterCorrection, FiscalError, type FiscalReceiptRow } from '@/hooks/useFiscal';
import { formatPln } from '@/lib/fiscal';
import { useVoidReceiptPayment } from '@/hooks/useFiscalCash';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  providerId: string;
  receipt: FiscalReceiptRow | null;
  documentLabel?: string;
  /**
   * Domknięcie procedury: po wpisie do ewidencji sprzedaż musi zostać zaewidencjonowana
   * PONOWNIE w prawidłowej wysokości — bez tego korekta jest niepełna.
   */
  onIssueCorrectedReceipt?: () => void;
}

export function FiscalCorrectionDialog({
  open,
  onOpenChange,
  providerId,
  receipt,
  documentLabel,
  onIssueCorrectedReceipt,
}: Props) {
  const registerCorrection = useRegisterCorrection(providerId);
  const voidPayment = useVoidReceiptPayment(providerId);
  const [reasonNote, setReasonNote] = useState('');
  const [attached, setAttached] = useState(false);
  const [saved, setSaved] = useState<{ correction_number: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setReasonNote('');
    setAttached(false);
    setSaved(null);
    setError(null);
  }, [open, receipt?.id]);

  const handleSave = async () => {
    if (!receipt) return;
    setError(null);
    try {
      const result = await registerCorrection.mutateAsync({
        receiptId: receipt.id,
        reasonNote: reasonNote.trim(),
        originalReceiptAttached: attached,
      });
      setSaved(result.correction);
      toast.success(`Pomyłka zapisana w ewidencji (${result.correction.correction_number}).`);

      // Storno wpłaty, nie wypłata: przy błędnym nabiciu te pieniądze nigdy nie wpłynęły
      // w tej wysokości, więc wydatek zafałszowałby kasę.
      try {
        const voided = await voidPayment.mutateAsync({
          receiptId: receipt.id,
          correctionNumber: result.correction.correction_number,
        });
        if (voided.voided > 0) {
          toast.success('Wpłata z błędnego paragonu wystornowana w kasie.');
        }
      } catch (cashError: any) {
        toast.error(`Korekta zapisana, ale storno wpłaty nie przeszło: ${cashError?.message ?? ''}`);
      }
    } catch (e) {
      setError((e as FiscalError).message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileWarning className="h-5 w-5" /> Korekta oczywistej pomyłki
          </DialogTitle>
          <DialogDescription>
            Paragon nr {receipt?.printer_receipt_number ?? '—'} na {formatPln(receipt?.total_grosze ?? 0)}
            {documentLabel ? ` (${documentLabel})` : ''}
          </DialogDescription>
        </DialogHeader>

        {saved ? (
          <div className="space-y-3 py-2">
            <div className="flex items-center gap-2 text-green-600">
              <CheckCircle2 className="h-5 w-5" />
              <span className="font-medium">Zapisano w ewidencji pomyłek: {saved.correction_number}</span>
            </div>
            <div className="text-sm text-muted-foreground space-y-1">
              <div>Błędny paragon zostaje w ewidencji — obrót jest już w pamięci fiskalnej i nie da się go cofnąć.</div>
              <div className="text-foreground font-medium">
                Procedura wymaga teraz zaewidencjonowania sprzedaży ponownie, w prawidłowej wysokości.
              </div>
            </div>
            {onIssueCorrectedReceipt ? (
              <Button
                onClick={() => {
                  onOpenChange(false);
                  onIssueCorrectedReceipt();
                }}
                className="gap-2"
              >
                <Receipt className="h-4 w-4" /> Wystaw poprawny paragon
              </Button>
            ) : (
              <Alert>
                <TriangleAlert className="h-4 w-4" />
                <AlertDescription className="text-sm">
                  Wystaw teraz poprawny paragon do tej sprzedaży — dokument jest już odblokowany.
                </AlertDescription>
              </Alert>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <Alert>
              <TriangleAlert className="h-4 w-4" />
              <AlertDescription className="text-sm">
                Ta ewidencja dotyczy <b>błędu kasjera</b> (zła kwota, zła pozycja, pomyłkowe nabicie).
                Jeśli klient oddaje towar albo reklamuje usługę, użyj <b>Zwrotu/reklamacji</b> — to
                odrębna ewidencja i nie wolno ich łączyć.
              </AlertDescription>
            </Alert>

            <div className="space-y-1">
              <Label>Przyczyna i okoliczności pomyłki</Label>
              <Textarea
                value={reasonNote}
                onChange={(e) => setReasonNote(e.target.value)}
                rows={3}
                placeholder="np. nabito 1250 zł zamiast 125 zł — pomyłka przy przepisywaniu kwoty"
              />
              <p className="text-[11px] text-muted-foreground">
                Opis jest wymagany rozporządzeniem — musi wyjaśniać, na czym polegała pomyłka.
              </p>
            </div>

            <label className="flex items-start gap-2 text-sm cursor-pointer">
              <Checkbox checked={attached} onCheckedChange={(v) => setAttached(v === true)} className="mt-0.5" />
              <span>
                Oryginał błędnego paragonu dołączony do ewidencji
                <span className="block text-[11px] text-muted-foreground">
                  Wymóg rozporządzenia — paragon zostaje przy dokumentacji, nie u klienta.
                </span>
              </span>
            </label>

            {error && (
              <Alert variant="destructive">
                <TriangleAlert className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {saved ? 'Zamknij' : 'Anuluj'}
          </Button>
          {!saved && (
            <Button
              onClick={handleSave}
              disabled={reasonNote.trim().length < 5 || registerCorrection.isPending}
              className="gap-2"
            >
              {registerCorrection.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileWarning className="h-4 w-4" />}
              Zapisz w ewidencji pomyłek
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
