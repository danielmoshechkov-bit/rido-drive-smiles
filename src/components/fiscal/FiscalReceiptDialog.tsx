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
import { Loader2, Printer, Receipt, TriangleAlert, Wallet, CreditCard, CheckCircle2, Copy, ShieldCheck, Undo2, Pencil, Save } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import {
  useFiscalPrinter,
  useFiscalizeReceipt,
  useDocumentFiscalState,
  useResolveStuckReceipt,
  useCatalogFiscalNames,
  useRememberFiscalName,
  FiscalError,
} from '@/hooks/useFiscal';
import { printReceiptCopy } from '@/lib/fiscalCopy';
import { FiscalReturnDialog } from './FiscalReturnDialog';
import { computeReceiptTotalGrosze, formatPln, mapWorkshopItemsToReceipt, toGrosze, type MappedReceipt } from '@/lib/fiscal';
import { DEFAULT_FISCAL_NAME_LENGTH, toFiscalName } from '@/lib/fiscalName';
import { Input } from '@/components/ui/input';
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
  const { data: fiscalState, isLoading: stateLoading } = useDocumentFiscalState(
    providerId,
    'workshop_order',
    order?.id,
  );
  const resolveStuck = useResolveStuckReceipt(providerId);

  const [rawItems, setRawItems] = useState<any[] | null>(null);
  const [loadingItems, setLoadingItems] = useState(false);
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [result, setResult] = useState<{ receiptNumber: number | null; total: number } | null>(null);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  // Ręczna „nazwa na paragon" per pozycja; pusta = automatyczne skracanie.
  const [nameOverrides, setNameOverrides] = useState<Record<number, string>>({});
  const [editingNames, setEditingNames] = useState(false);
  const [returnOpen, setReturnOpen] = useState(false);

  useEffect(() => {
    if (!open || !order) return;
    setResult(null);
    setError(null);
    setMethod('cash');
    setNameOverrides({});
    setEditingNames(false);
    setRawItems(null);
    setLoadingItems(true);
    (async () => {
      const { data, error: itemsError } = await (supabase as any)
        .from('workshop_order_items')
        .select('*')
        .eq('order_id', order.id)
        .order('sort_order');
      if (itemsError) {
        setError({ code: 'DB', message: `Nie udało się wczytać pozycji zlecenia: ${itemsError.message}` });
        setRawItems(null);
      } else {
        setRawItems(data || []);
      }
      setLoadingItems(false);
    })();
  }, [open, order?.id, printer?.default_unit]);

  const productIds = useMemo(
    () => (rawItems ?? []).map((item) => item?.inventory_product_id).filter(Boolean) as string[],
    [rawItems],
  );
  const { data: catalogFiscalNames } = useCatalogFiscalNames(productIds);
  const rememberName = useRememberFiscalName();

  const mapped: MappedReceipt | null = useMemo(
    () =>
      rawItems
        ? mapWorkshopItemsToReceipt(rawItems, {
            defaultUnit: printer?.default_unit,
            catalogFiscalNames,
          })
        : null,
    [rawItems, printer?.default_unit, catalogFiscalNames],
  );

  const nameLength = printer?.item_name_length ?? DEFAULT_FISCAL_NAME_LENGTH;

  /** Nazwa, która faktycznie pójdzie na papier: ręczna albo automatycznie skrócona. */
  const fiscalNameOf = (index: number, name: string) =>
    (nameOverrides[index]?.trim() || toFiscalName(name, nameLength)).slice(0, nameLength);

  const itemsForPrint = useMemo(
    () => (mapped?.items ?? []).map((item, index) => ({ ...item, name: fiscalNameOf(index, item.name) })),
    [mapped, nameOverrides, nameLength],
  );

  const totalGrosze = useMemo(() => (mapped ? computeReceiptTotalGrosze(mapped.items) : 0), [mapped]);
  const alreadyFiscalized = Boolean(fiscalState?.blocking);
  const canPrint =
    Boolean(printer) &&
    Boolean(mapped?.items.length) &&
    !mapped?.blocking.length &&
    !alreadyFiscalized &&
    !fiscalize.isPending;

  const handleCopy = () => {
    if (!fiscalState?.blocking) return;
    try {
      printReceiptCopy(fiscalState.blocking, { documentLabel: order?.order_number ?? undefined });
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const handleResolve = async (decision?: 'printed' | 'failed') => {
    if (!fiscalState?.blocking) return;
    try {
      const result = await resolveStuck.mutateAsync({
        receiptId: fiscalState.blocking.id,
        printer,
        decision,
      });
      toast.success(
        result.status === 'printed'
          ? 'Oznaczono jako wystawiony — paragon wyszedł z drukarki.'
          : 'Oznaczono jako nieudany — można wystawić paragon ponownie.',
      );
    } catch (e) {
      toast.error((e as FiscalError).message);
    }
  };

  const handlePrint = async () => {
    if (!mapped || !order) return;
    setError(null);
    try {
      const response = await fiscalize.mutateAsync({
        printerId: printer?.id,
        printer,
        documentType: 'workshop_order',
        documentId: order.id,
        items: itemsForPrint,
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
        ) : stateLoading ? (
          <div className="flex items-center gap-2 py-8 justify-center text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Sprawdzanie stanu fiskalizacji…
          </div>
        ) : fiscalState?.isPrinted && !result ? (
          <div className="space-y-4 py-2">
            <Alert>
              <ShieldCheck className="h-4 w-4" />
              <AlertDescription>
                <div className="font-medium">
                  Paragon fiskalny nr {fiscalState.blocking?.printer_receipt_number ?? '—'} wystawiony{' '}
                  {new Date(fiscalState.blocking?.printed_at ?? fiscalState.blocking!.created_at).toLocaleString('pl-PL', {
                    dateStyle: 'short',
                    timeStyle: 'short',
                  })}
                  , {formatPln(fiscalState.blocking!.total_grosze)}
                </div>
                <div className="mt-1 text-sm">
                  Do jednego zlecenia można wystawić tylko jeden paragon — drugi podwoiłby zarejestrowany
                  obrót. Potrzebujesz wydruku dla klienta? Użyj kopii.
                </div>
              </AlertDescription>
            </Alert>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={handleCopy} className="gap-2">
                <Copy className="h-4 w-4" /> Drukuj kopię
              </Button>
              <Button variant="outline" onClick={() => setReturnOpen(true)} className="gap-2">
                <Undo2 className="h-4 w-4" /> Zwrot/reklamacja
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Kopia to dokument niefiskalny drukowany z GetRido — nie dotyka drukarki fiskalnej
              i nie zwiększa obrotu.
            </p>
          </div>
        ) : fiscalState?.isInProgress ? (
          <Alert>
            <Loader2 className="h-4 w-4 animate-spin" />
            <AlertDescription>
              Trwa fiskalizacja tego zlecenia (rozpoczęta{' '}
              {new Date(fiscalState.blocking!.created_at).toLocaleTimeString('pl-PL')}). Poczekaj na zakończenie
              wydruku.
            </AlertDescription>
          </Alert>
        ) : fiscalState?.isStuck ? (
          <div className="space-y-3 py-2">
            <Alert variant="destructive">
              <TriangleAlert className="h-4 w-4" />
              <AlertDescription>
                Poprzednia próba fiskalizacji nie zakończyła się jednoznacznie. Sprawdź, czy paragon wyszedł
                z drukarki — dopiero potem można wystawić kolejny.
              </AlertDescription>
            </Alert>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => handleResolve()} disabled={resolveStuck.isPending} className="gap-2">
                {resolveStuck.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                Sprawdź w drukarce automatycznie
              </Button>
              <Button variant="outline" onClick={() => handleResolve('printed')} disabled={resolveStuck.isPending}>
                Paragon wyszedł
              </Button>
              <Button variant="outline" onClick={() => handleResolve('failed')} disabled={resolveStuck.isPending}>
                Nie wyszedł — pozwól ponowić
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Automatyczne sprawdzenie porównuje licznik paragonów drukarki z wartością sprzed wydruku.
            </p>
          </div>
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

            {fiscalState?.lastFailed && (
              <Alert>
                <TriangleAlert className="h-4 w-4" />
                <AlertDescription>
                  Poprzednia próba nie powiodła się ({fiscalState.lastFailed.error_message ?? 'brak szczegółów'}).
                  Paragon nie został wydrukowany, więc można wystawić go teraz.
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
              <>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  Nazwy skracane do {nameLength} znaków (limit pola drukarki) — tak wyjdą na papierze.
                </span>
                <Button variant="ghost" size="sm" className="h-7 gap-1" onClick={() => setEditingNames((v) => !v)}>
                  <Pencil className="h-3 w-3" /> {editingNames ? 'Gotowe' : 'Zmień nazwy'}
                </Button>
              </div>
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
                    {mapped.items.map((item, index) => {
                      const printedName = fiscalNameOf(index, item.name);
                      const shortened = printedName !== item.name;
                      return (
                      <TableRow key={index}>
                        <TableCell className="font-medium">
                          {editingNames ? (
                            <div className="space-y-1">
                              <Input
                                value={nameOverrides[index] ?? printedName}
                                maxLength={nameLength}
                                onChange={(e) =>
                                  setNameOverrides((prev) => ({ ...prev, [index]: e.target.value }))
                                }
                                className="h-8 font-mono text-xs"
                              />
                              {item.productId && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 px-1 text-[11px] gap-1"
                                  disabled={rememberName.isPending}
                                  onClick={async () => {
                                    try {
                                      await rememberName.mutateAsync({
                                        productId: item.productId!,
                                        fiscalName: (nameOverrides[index] ?? printedName).slice(0, nameLength),
                                      });
                                      toast.success('Zapamiętano nazwę na paragon dla tej pozycji w katalogu.');
                                    } catch (e: any) {
                                      toast.error(e?.message || 'Nie udało się zapamiętać nazwy.');
                                    }
                                  }}
                                >
                                  <Save className="h-3 w-3" /> Zapamiętaj w katalogu
                                </Button>
                              )}
                            </div>
                          ) : (
                            <>
                              <div className="font-mono text-xs">{printedName}</div>
                              {(shortened || (item.originalName && item.originalName !== item.name)) && (
                                <div className="text-[11px] text-muted-foreground line-through">
                                  {item.originalName ?? item.name}
                                </div>
                              )}
                            </>
                          )}
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap">
                          {item.quantity} {item.unit}
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap">{formatPln(toGrosze(item.unitPrice))}</TableCell>
                        <TableCell className="text-right">{item.vatRate === 'zw' ? 'zw.' : `${item.vatRate}%`}</TableCell>
                        <TableCell className="text-right whitespace-nowrap">
                          {formatPln(Math.round(toGrosze(item.unitPrice) * item.quantity))}
                        </TableCell>
                      </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              </>
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
          {!result && !alreadyFiscalized && (
            <Button onClick={handlePrint} disabled={!canPrint} className="gap-2">
              {fiscalize.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
              {fiscalize.isPending ? 'Drukowanie…' : 'Drukuj paragon'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>

      <FiscalReturnDialog
        open={returnOpen}
        onOpenChange={setReturnOpen}
        providerId={providerId}
        receipt={fiscalState?.blocking ?? null}
        documentLabel={order?.order_number ?? undefined}
      />
    </Dialog>
  );
}
