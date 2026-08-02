/**
 * Zwrot / reklamacja do paragonu fiskalnego.
 *
 * Paragonu nie da się cofnąć — obrót jest zarejestrowany w pamięci fiskalnej.
 * Ten dialog tworzy wpis w ODRĘBNEJ ewidencji zwrotów (rozporządzenie o kasach)
 * i drukuje niefiskalny protokół do podpisu przez klienta.
 * Drukarka fiskalna nie jest tu w ogóle używana.
 */

import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Undo2, TriangleAlert, CheckCircle2, Printer, CheckSquare } from 'lucide-react';
import { toast } from 'sonner';
import {
  useCreateFiscalReturn,
  useFiscalReturns,
  RETURN_REASON_LABELS,
  FiscalError,
  type FiscalReceiptRow,
  type FiscalReturnRow,
  useProviderPrintHeader,
} from '@/hooks/useFiscal';
import { formatPln, toGrosze } from '@/lib/fiscal';
import { printReturnProtocol } from '@/lib/fiscalCopy';
import { useRegisterReturnExpense, CASH_METHOD_LABELS, type CashMethod } from '@/hooks/useFiscalCash';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  providerId: string;
  receipt: FiscalReceiptRow | null;
  documentLabel?: string;
}

interface ReturnLine {
  selected: boolean;
  name: string;
  unit: string;
  vatRate: string;
  unitPriceGrosze: number;
  maxQuantity: number;
  quantity: number;
}

/** Pozycje paragonu → wiersze do wyboru (ze snapshotu, nie z bieżącego zlecenia). */
function linesFromReceipt(receipt: FiscalReceiptRow | null): ReturnLine[] {
  const items = Array.isArray(receipt?.items) ? (receipt!.items as any[]) : [];
  return items.map((item) => ({
    selected: false,
    name: String(item?.name ?? ''),
    unit: String(item?.unit ?? 'szt'),
    vatRate: String(item?.vatRate ?? '23'),
    unitPriceGrosze: toGrosze(Number(item?.unitPrice) || 0),
    maxQuantity: Number(item?.quantity) || 0,
    quantity: Number(item?.quantity) || 0,
  }));
}

export function FiscalReturnDialog({ open, onOpenChange, providerId, receipt, documentLabel }: Props) {
  const createReturn = useCreateFiscalReturn(providerId);
  const { data: printHeader } = useProviderPrintHeader(providerId);
  const { data: existingReturns = [] } = useFiscalReturns(providerId, receipt?.id);

  const [lines, setLines] = useState<ReturnLine[]>([]);
  const [reason, setReason] = useState<FiscalReturnRow['reason']>('zwrot_towaru');
  const [reasonNote, setReasonNote] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerDocument, setCustomerDocument] = useState('');
  const [saved, setSaved] = useState<FiscalReturnRow | null>(null);
  const [payFromCash, setPayFromCash] = useState(true);
  const registerExpense = useRegisterReturnExpense(providerId);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLines(linesFromReceipt(receipt));
    setReason('zwrot_towaru');
    setReasonNote('');
    setCustomerName('');
    setCustomerDocument('');
    setSaved(null);
    setError(null);
    setPayFromCash(true);
  }, [open, receipt?.id]);

  /** Zwrot oddajemy tą samą formą, którą klient zapłacił. */
  const refundMethod: CashMethod = (() => {
    const first = Array.isArray(receipt?.payments) ? receipt!.payments[0]?.name?.toUpperCase() : undefined;
    if (first === 'KARTA') return 'karta';
    if (first === 'BLIK') return 'blik';
    return 'gotowka';
  })();

  const selectedLines = lines.filter((line) => line.selected && line.quantity > 0);
  const amountGrosze = useMemo(
    () => selectedLines.reduce((sum, line) => sum + Math.round(line.unitPriceGrosze * line.quantity), 0),
    [selectedLines],
  );

  const alreadyReturned = existingReturns.reduce((sum, row) => sum + row.amount_grosze, 0);
  const receiptTotal = receipt?.total_grosze ?? 0;
  const remaining = receiptTotal - alreadyReturned;
  const exceedsRemaining = amountGrosze > remaining;

  const updateLine = (index: number, patch: Partial<ReturnLine>) =>
    setLines((prev) => prev.map((line, i) => (i === index ? { ...line, ...patch } : line)));

  /** Rozbicie kwoty zwrotu na stawki VAT — wymagane w ewidencji. */
  const vatBreakdown = useMemo(() => {
    const breakdown: Record<string, number> = {};
    for (const line of selectedLines) {
      const value = Math.round(line.unitPriceGrosze * line.quantity);
      breakdown[line.vatRate] = (breakdown[line.vatRate] ?? 0) + value;
    }
    return breakdown;
  }, [selectedLines]);

  const handleSave = async () => {
    if (!receipt) return;
    setError(null);
    try {
      const row = await createReturn.mutateAsync({
        receiptId: receipt.id,
        reason,
        reasonNote: reasonNote.trim() || undefined,
        items: selectedLines.map((line) => ({
          name: line.name,
          quantity: line.quantity,
          unitPrice: line.unitPriceGrosze / 100,
          vatRate: line.vatRate,
          amount: Math.round(line.unitPriceGrosze * line.quantity) / 100,
        })),
        amountGrosze,
        returnType: amountGrosze >= receiptTotal ? 'full' : 'partial',
        vatBreakdown,
        customerName: customerName.trim() || undefined,
        customerDocument: customerDocument.trim() || undefined,
      });
      setSaved(row);
      toast.success(`Zwrot ${row.return_number} zapisany w ewidencji.`);

      // Zwrot to realne oddanie pieniędzy — wypłata z kasy tą samą formą.
      if (payFromCash) {
        try {
          await registerExpense.mutateAsync({
            returnId: row.id,
            returnNumber: row.return_number,
            receiptNumber: receipt.printer_receipt_number,
            amountGrosze,
            method: refundMethod,
          });
          toast.success(`Wypłata ${formatPln(amountGrosze)} zapisana w kasie (${CASH_METHOD_LABELS[refundMethod]}).`);
        } catch (cashError: any) {
          toast.error(`Zwrot zapisany, ale wypłata z kasy nie przeszła: ${cashError?.message ?? ''}`);
        }
      }
    } catch (e) {
      setError((e as FiscalError).message);
    }
  };

  const handlePrintProtocol = (row: FiscalReturnRow) => {
    try {
      printReturnProtocol(row, receipt, { ...(printHeader ?? {}), documentLabel });
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Undo2 className="h-5 w-5" /> Zwrot / reklamacja
          </DialogTitle>
          <DialogDescription>
            Do paragonu nr {receipt?.printer_receipt_number ?? '—'} na {formatPln(receiptTotal)}
            {documentLabel ? ` (${documentLabel})` : ''}
          </DialogDescription>
        </DialogHeader>

        {saved ? (
          <div className="space-y-4 py-2">
            <div className="flex items-center gap-2 text-green-600">
              <CheckCircle2 className="h-5 w-5" />
              <span className="font-medium">Zwrot {saved.return_number} zapisany w ewidencji</span>
            </div>
            <div className="text-sm text-muted-foreground space-y-1">
              <div>Kwota zwrotu: <b className="text-foreground">{formatPln(saved.amount_grosze)}</b></div>
              <div>Powód: <b className="text-foreground">{RETURN_REASON_LABELS[saved.reason]}</b></div>
              <div>Oryginalny paragon pozostaje bez zmian — zwrot jest osobnym dokumentem.</div>
            </div>
            <Button onClick={() => handlePrintProtocol(saved)} className="gap-2">
              <Printer className="h-4 w-4" /> Drukuj protokół do podpisu
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <Alert>
              <TriangleAlert className="h-4 w-4" />
              <AlertDescription>
                Paragonu fiskalnego nie można anulować. Zwrot trafia do odrębnej ewidencji i pomniejsza
                obrót w rozliczeniu — drukarka nie jest używana.
              </AlertDescription>
            </Alert>

            {alreadyReturned > 0 && (
              <Alert>
                <TriangleAlert className="h-4 w-4" />
                <AlertDescription>
                  Do tego paragonu zwrócono już {formatPln(alreadyReturned)}. Pozostało {formatPln(remaining)}.
                </AlertDescription>
              </Alert>
            )}

            <div className="flex items-center justify-between gap-3 flex-wrap">
              <span className="text-sm text-muted-foreground">
                Zaznacz pozycje, które klient zwraca, i podaj ilość (można zwrócić część).
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs gap-1"
                  onClick={() => setLines((prev) => prev.map((line) => ({ ...line, selected: true, quantity: line.maxQuantity })))}
                >
                  <CheckSquare className="h-3.5 w-3.5" /> Zaznacz wszystko (zwrot całości)
                </Button>
                {selectedLines.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => setLines((prev) => prev.map((line) => ({ ...line, selected: false })))}
                  >
                    Wyczyść
                  </Button>
                )}
              </div>
            </div>

            <div className="rounded-md border max-h-56 overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-20">Zwracam</TableHead>
                    <TableHead>Pozycja</TableHead>
                    <TableHead className="text-right">Ilość zwrotu</TableHead>
                    <TableHead className="text-right">Cena</TableHead>
                    <TableHead className="text-right">Wartość zwrotu</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.map((line, index) => (
                    <TableRow
                      key={index}
                      className={`cursor-pointer ${line.selected ? 'bg-muted/40' : ''}`}
                      onClick={() => updateLine(index, { selected: !line.selected })}
                    >
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <Checkbox
                            checked={line.selected}
                            onCheckedChange={(checked) => updateLine(index, { selected: checked === true })}
                          />
                          <span className="text-[11px] text-muted-foreground">{line.selected ? 'tak' : 'nie'}</span>
                        </label>
                      </TableCell>
                      <TableCell className="font-medium">{line.name}</TableCell>
                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                        <Input
                          type="number"
                          min={0}
                          max={line.maxQuantity}
                          step="any"
                          value={line.quantity}
                          disabled={!line.selected}
                          onChange={(e) =>
                            updateLine(index, {
                              quantity: Math.min(Number(e.target.value) || 0, line.maxQuantity),
                            })
                          }
                          className="h-8 w-20 text-right"
                        />
                        <div className="text-[10px] text-muted-foreground">z {line.maxQuantity} {line.unit}</div>
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap">{formatPln(line.unitPriceGrosze)}</TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        {formatPln(Math.round(line.unitPriceGrosze * (line.selected ? line.quantity : 0)))}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Powód</Label>
                <Select value={reason} onValueChange={(value) => setReason(value as FiscalReturnRow['reason'])}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(RETURN_REASON_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Klient (imię i nazwisko)</Label>
                <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Dokument klienta (opcjonalnie)</Label>
                <Input
                  value={customerDocument}
                  onChange={(e) => setCustomerDocument(e.target.value)}
                  placeholder="np. numer dowodu"
                />
              </div>
              <div className="space-y-1">
                <Label>Opis</Label>
                <Textarea
                  value={reasonNote}
                  onChange={(e) => setReasonNote(e.target.value)}
                  rows={2}
                  placeholder="np. usterka po naprawie"
                />
              </div>
            </div>

            {exceedsRemaining && (
              <Alert variant="destructive">
                <TriangleAlert className="h-4 w-4" />
                <AlertDescription>
                  Kwota zwrotu ({formatPln(amountGrosze)}) przekracza pozostałą kwotę paragonu ({formatPln(remaining)}).
                </AlertDescription>
              </Alert>
            )}

            <label className="flex items-start gap-2 text-sm cursor-pointer">
              <Checkbox checked={payFromCash} onCheckedChange={(v) => setPayFromCash(v === true)} className="mt-0.5" />
              <span>
                Wypłać z kasy ({CASH_METHOD_LABELS[refundMethod]})
                <span className="block text-[11px] text-muted-foreground">
                  Pieniądze wracają do klienta, więc kasa zostanie pomniejszona o kwotę zwrotu.
                </span>
              </span>
            </label>

            {error && (
              <Alert variant="destructive">
                <TriangleAlert className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                {selectedLines.length === 0
                  ? 'Zaznacz pozycje do zwrotu — bez tego nie da się zapisać.'
                  : `Pozycje do zwrotu: ${selectedLines.length} z ${lines.length}` +
                    (amountGrosze >= receiptTotal ? ' (zwrot całości)' : ' (zwrot częściowy)')}
              </span>
              <div className="text-right">
                <div className="text-sm text-muted-foreground">Kwota zwrotu</div>
                <div className="text-2xl font-bold">{formatPln(amountGrosze)}</div>
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {saved ? 'Zamknij' : 'Anuluj'}
          </Button>
          {!saved && (
            <Button
              onClick={handleSave}
              disabled={!selectedLines.length || amountGrosze <= 0 || exceedsRemaining || createReturn.isPending}
              className="gap-2"
            >
              {createReturn.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Undo2 className="h-4 w-4" />}
              Zapisz zwrot
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
