/**
 * Dialog „Drukuj paragon" — wywoływany z dokumentu (na start: zlecenie warsztatowe).
 *
 * Kolejność zgodna z założeniem modułu: najpierw płatność, potem fiskalizacja.
 * Płatność kartą jest przygotowana wizualnie, ale wyłączona do czasu integracji
 * terminala (Faza 3) — nie chcemy fiskalizować transakcji, której nikt nie potwierdził.
 */

import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Printer, Receipt, TriangleAlert, Wallet, CreditCard, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useFiscalPrinter, useFiscalizeReceipt, FiscalError } from '@/hooks/useFiscal';
import { computeReceiptTotalGrosze, formatPln, mapWorkshopItemsToReceipt, toGrosze, type MappedReceipt } from '@/lib/fiscal';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  providerId: string;
  order: { id: string; order_number?: string | null } | null;
}

type PaymentMethod = 'cash' | 'card';

export function FiscalReceiptDialog({ open, onOpenChange, providerId, order }: Props) {
  const { data: printer, isLoading: printerLoading } = useFiscalPrinter(providerId);
  const fiscalize = useFiscalizeReceipt(providerId);

  const [mapped, setMapped] = useState<MappedReceipt | null>(null);
  const [loadingItems, setLoadingItems] = useState(false);
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [result, setResult] = useState<{ receiptNumber: number | null; total: number } | null>(null);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);

  useEffect(() => {
    if (!open || !order) return;
    setResult(null);
    setError(null);
    setMethod('cash');
    setLoadingItems(true);
    (async () => {
      const { data, error: itemsError } = await (supabase as any)
        .from('workshop_order_items')
        .select('*')
        .eq('order_id', order.id)
        .order('sort_order');
      if (itemsError) {
        setError({ code: 'DB', message: `Nie udało się wczytać pozycji zlecenia: ${itemsError.message}` });
        setMapped(null);
      } else {
        setMapped(mapWorkshopItemsToReceipt(data || [], { defaultUnit: printer?.default_unit }));
      }
      setLoadingItems(false);
    })();
  }, [open, order?.id, printer?.default_unit]);

  const totalGrosze = useMemo(() => (mapped ? computeReceiptTotalGrosze(mapped.items) : 0), [mapped]);
  const canPrint =
    Boolean(printer) && Boolean(mapped?.items.length) && !mapped?.blocking.length && !fiscalize.isPending;

  const handlePrint = async () => {
    if (!mapped || !order) return;
    setError(null);
    try {
      const response = await fiscalize.mutateAsync({
        printerId: printer?.id,
        documentType: 'workshop_order',
        documentId: order.id,
        items: mapped.items,
        payments: [{ name: method === 'cash' ? 'GOTOWKA' : 'KARTA', amount: totalGrosze / 100 }],
      });
      setResult({ receiptNumber: response.receiptNumber, total: response.total });
      toast.success(
        response.receiptNumber
          ? `Paragon wydrukowany (nr ${response.receiptNumber})`
          : 'Paragon wydrukowany',
      );
    } catch (e) {
      const fiscalError = e as FiscalError;
      setError({ code: fiscalError.code ?? 'UNKNOWN', message: fiscalError.message });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5" /> Paragon fiskalny
          </DialogTitle>
          <DialogDescription>
            {order?.order_number ? `Zlecenie ${order.order_number}` : 'Wydruk paragonu na drukarce fiskalnej'}
          </DialogDescription>
        </DialogHeader>

        {printerLoading || loadingItems ? (
          <div className="flex items-center gap-2 py-8 justify-center text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Wczytywanie…
          </div>
        ) : !printer ? (
          <Alert variant="destructive">
            <TriangleAlert className="h-4 w-4" />
            <AlertDescription>
              Nie skonfigurowano drukarki fiskalnej. Przejdź do <b>Ustawienia → Fiskalizacja</b> i dodaj drukarkę.
            </AlertDescription>
          </Alert>
        ) : result ? (
          <div className="space-y-3 py-4">
            <div className="flex items-center gap-2 text-green-600">
              <CheckCircle2 className="h-5 w-5" />
              <span className="font-medium">Paragon wydrukowany</span>
            </div>
            <div className="text-sm text-muted-foreground space-y-1">
              <div>Numer paragonu z drukarki: <b className="text-foreground">{result.receiptNumber ?? '—'}</b></div>
              <div>Kwota: <b className="text-foreground">{result.total.toFixed(2).replace('.', ',')} zł</b></div>
              <div>Forma płatności: <b className="text-foreground">{method === 'cash' ? 'gotówka' : 'karta'}</b></div>
              {printer.mode === 'training' && (
                <div className="text-amber-600">Drukarka pracuje w trybie szkoleniowym — wydruk niefiskalny.</div>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {printer.mode === 'training' && (
              <Alert>
                <TriangleAlert className="h-4 w-4" />
                <AlertDescription>
                  Drukarka pracuje w <b>trybie szkoleniowym</b> — paragon będzie niefiskalny.
                </AlertDescription>
              </Alert>
            )}

            {mapped?.blocking.length ? (
              <Alert variant="destructive">
                <TriangleAlert className="h-4 w-4" />
                <AlertDescription>
                  <div className="font-medium">Popraw zlecenie przed wydrukiem:</div>
                  <ul className="list-disc pl-4 mt-1">
                    {mapped.blocking.map((problem, index) => (
                      <li key={index}>„{problem.name}" — {problem.reason}</li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            ) : null}

            {mapped?.skipped.length ? (
              <Alert>
                <TriangleAlert className="h-4 w-4" />
                <AlertDescription>
                  Pominięte pozycje: {mapped.skipped.map((s) => `„${s.name}" (${s.reason})`).join(', ')}.
                </AlertDescription>
              </Alert>
            ) : null}

            {mapped?.items.length ? (
              <div className="rounded-md border max-h-64 overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nazwa</TableHead>
                      <TableHead className="text-right">Ilość</TableHead>
                      <TableHead className="text-right">Cena</TableHead>
                      <TableHead className="text-right">VAT</TableHead>
                      <TableHead className="text-right">Wartość</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {mapped.items.map((item, index) => (
                      <TableRow key={index}>
                        <TableCell className="font-medium">{item.name}</TableCell>
                        <TableCell className="text-right whitespace-nowrap">
                          {item.quantity} {item.unit}
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap">{formatPln(toGrosze(item.unitPrice))}</TableCell>
                        <TableCell className="text-right">{item.vatRate === 'zw' ? 'zw.' : `${item.vatRate}%`}</TableCell>
                        <TableCell className="text-right whitespace-nowrap">
                          {formatPln(Math.round(toGrosze(item.unitPrice) * item.quantity))}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <Alert variant="destructive">
                <TriangleAlert className="h-4 w-4" />
                <AlertDescription>Zlecenie nie ma pozycji, które można wydrukować na paragonie.</AlertDescription>
              </Alert>
            )}

            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <div className="text-sm text-muted-foreground">Forma płatności</div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={method === 'cash' ? 'default' : 'outline'}
                    onClick={() => setMethod('cash')}
                    className="gap-1"
                  >
                    <Wallet className="h-4 w-4" /> Gotówka
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled
                    title="Płatność kartą przez terminal — w przygotowaniu"
                    className="gap-1"
                  >
                    <CreditCard className="h-4 w-4" /> Karta (wkrótce)
                  </Button>
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm text-muted-foreground">Do zapłaty</div>
                <div className="text-2xl font-bold">{formatPln(totalGrosze)}</div>
              </div>
            </div>

            {error && (
              <Alert variant="destructive">
                <TriangleAlert className="h-4 w-4" />
                <AlertDescription>
                  {error.message}
                  <Badge variant="outline" className="ml-2 text-[10px]">{error.code}</Badge>
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {result ? 'Zamknij' : 'Anuluj'}
          </Button>
          {!result && (
            <Button onClick={handlePrint} disabled={!canPrint} className="gap-2">
              {fiscalize.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
              {fiscalize.isPending ? 'Drukowanie…' : 'Drukuj paragon'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
