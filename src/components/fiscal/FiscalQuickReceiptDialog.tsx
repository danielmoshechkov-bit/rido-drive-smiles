/**
 * Szybki paragon — sprzedaż od ręki, bez zakładania zlecenia.
 *
 * Warsztat sprzedaje nie tylko naprawy: część, płyn, żarówka — klient płaci i wychodzi.
 * Pozycje wpisuje się z klawiatury (Enter dodaje kolejną), reszta logiki jest wspólna
 * z paragonem ze zlecenia: nazwa fiskalna, sekcja nabywcy z NIP-em, mostek/drukarka,
 * wpis w fiscal_receipts i blokada podwójnej fiskalizacji.
 *
 * Dokument źródłowy: document_type = 'kasa_szybka', document_id = własny UUID sprzedaży,
 * więc paragon nie jest powiązany z żadnym zleceniem, a mimo to jest pełnoprawną sprzedażą
 * widoczną w Kasie fiskalnej i w podsumowaniu obrotu.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Plus, Printer, Receipt, Trash2, TriangleAlert, CheckCircle2, Wallet, CreditCard, Smartphone } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useFiscalPrinter, useFiscalizeReceipt, FiscalError } from '@/hooks/useFiscal';
import { computeReceiptTotalGrosze, formatPln, toGrosze, type FiscalItemInput } from '@/lib/fiscal';
import { DEFAULT_FISCAL_NAME_LENGTH, toFiscalName } from '@/lib/fiscalName';
import { FiscalBuyerSection, buyerBlocksPrint, buyerNipForPrint, type BuyerState } from './FiscalBuyerSection';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  providerId: string;
}

type PaymentMethod = 'cash' | 'card' | 'blik';

const PAYMENT_LABELS: Record<PaymentMethod, { label: string; printer: string; icon: typeof Wallet }> = {
  cash: { label: 'Gotówka', printer: 'GOTOWKA', icon: Wallet },
  card: { label: 'Karta', printer: 'KARTA', icon: CreditCard },
  blik: { label: 'BLIK', printer: 'BLIK', icon: Smartphone },
};

interface DraftItem extends FiscalItemInput {
  key: string;
}

const emptyDraft = { name: '', quantity: '1', unitPrice: '', vatRate: '23', unit: 'szt' };

export function FiscalQuickReceiptDialog({ open, onOpenChange, providerId }: Props) {
  const { data: printer } = useFiscalPrinter(providerId);
  const fiscalize = useFiscalizeReceipt(providerId);

  const [items, setItems] = useState<DraftItem[]>([]);
  const [draft, setDraft] = useState(emptyDraft);
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [buyer, setBuyer] = useState<BuyerState>({ buyerType: 'individual', nip: '', printNip: true });
  const [suggestions, setSuggestions] = useState<Array<{ name: string; price: number; unit: string; vat: string }>>([]);
  const [result, setResult] = useState<{ receiptNumber: number | null; total: number } | null>(null);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  const nameLength = printer?.item_name_length ?? DEFAULT_FISCAL_NAME_LENGTH;
  const vatKeys = Object.keys((printer?.vat_map as Record<string, string>) ?? { '23': 'A', '8': 'B', '5': 'C', '0': 'D', zw: 'E' });

  useEffect(() => {
    if (!open) return;
    setItems([]);
    setDraft(emptyDraft);
    setMethod('cash');
    setBuyer({ buyerType: 'individual', nip: '', printNip: true });
    setResult(null);
    setError(null);
    setTimeout(() => nameRef.current?.focus(), 80);
  }, [open]);

  // Podpowiedzi z magazynu — wygodne, ale całość musi działać też w pełni ręcznie.
  useEffect(() => {
    const term = draft.name.trim();
    if (term.length < 2) {
      setSuggestions([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      const { data } = await (supabase as any)
        .from('inventory_products')
        .select('name_sales, fiscal_name, default_sale_price_gross, unit, vat_rate')
        .ilike('name_sales', `%${term}%`)
        .eq('is_active', true)
        .limit(6);
      if (cancelled) return;
      setSuggestions(
        ((data as any[]) ?? []).map((row) => ({
          name: row.fiscal_name || row.name_sales || '',
          price: Number(row.default_sale_price_gross) || 0,
          unit: row.unit || 'szt',
          vat: row.vat_rate != null ? String(row.vat_rate) : '23',
        })),
      );
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [draft.name]);

  const totalGrosze = useMemo(() => computeReceiptTotalGrosze(items), [items]);

  const addItem = () => {
    const name = draft.name.replace(/\s+/g, ' ').trim();
    const quantity = Number(String(draft.quantity).replace(',', '.'));
    const unitPrice = Number(String(draft.unitPrice).replace(',', '.'));

    if (name.replace(/\s/g, '').length < 5) {
      toast.error('Nazwa musi mieć min. 5 znaków — tego wymaga drukarka.');
      return;
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      toast.error('Podaj ilość większą od zera.');
      return;
    }
    if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
      toast.error('Podaj cenę większą od zera — paragon nie może zawierać pozycji za 0 zł.');
      return;
    }

    setItems((prev) => [
      ...prev,
      {
        key: `${Date.now()}-${prev.length}`,
        name: toFiscalName(name, nameLength),
        originalName: name,
        quantity,
        unit: (draft.unit || 'szt').slice(0, 4),
        unitPrice,
        vatRate: draft.vatRate,
      },
    ]);
    setDraft({ ...emptyDraft, vatRate: draft.vatRate, unit: draft.unit });
    setSuggestions([]);
    nameRef.current?.focus();
  };

  const handlePrint = async () => {
    if (!items.length) return;
    setError(null);
    try {
      const response = await fiscalize.mutateAsync({
        printerId: printer?.id,
        printer,
        documentType: 'kasa_szybka',
        // Własny identyfikator sprzedaży — paragon nie jest powiązany ze zleceniem,
        // a blokada podwójnej fiskalizacji nadal działa (jeden paragon na tę sprzedaż).
        documentId: crypto.randomUUID(),
        items: items.map(({ key, ...item }) => item),
        payments: [{ name: PAYMENT_LABELS[method].printer, amount: totalGrosze / 100 }],
        buyerNip: buyerNipForPrint(buyer),
      });
      setResult({ receiptNumber: response.receiptNumber, total: response.total });
      toast.success(
        response.receiptNumber ? `Paragon wydrukowany (nr ${response.receiptNumber})` : 'Paragon wydrukowany',
      );
    } catch (e) {
      const fiscalError = e as FiscalError;
      setError({ code: fiscalError.code ?? 'UNKNOWN', message: fiscalError.message });
    }
  };

  const canPrint = Boolean(printer) && items.length > 0 && !buyerBlocksPrint(buyer) && !fiscalize.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5" /> Szybki paragon
          </DialogTitle>
          <DialogDescription>Sprzedaż od ręki — bez zakładania zlecenia.</DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="space-y-3 py-4">
            <div className="flex items-center gap-2 text-green-600">
              <CheckCircle2 className="h-5 w-5" />
              <span className="font-medium">Paragon wydrukowany</span>
            </div>
            <div className="text-sm text-muted-foreground space-y-1">
              <div>Numer paragonu z drukarki: <b className="text-foreground">{result.receiptNumber ?? '—'}</b></div>
              <div>Kwota: <b className="text-foreground">{result.total.toFixed(2).replace('.', ',')} zł</b></div>
              <div>Forma płatności: <b className="text-foreground">{PAYMENT_LABELS[method].label}</b></div>
              {printer?.mode === 'training' && (
                <div className="text-amber-600">Drukarka pracuje w trybie szkoleniowym — wydruk niefiskalny.</div>
              )}
            </div>
            <Button
              variant="outline"
              onClick={() => {
                setResult(null);
                setItems([]);
                setDraft(emptyDraft);
                setTimeout(() => nameRef.current?.focus(), 80);
              }}
            >
              Wystaw kolejny
            </Button>
          </div>
        ) : !printer ? (
          <Alert variant="destructive">
            <TriangleAlert className="h-4 w-4" />
            <AlertDescription>
              Nie skonfigurowano drukarki fiskalnej. Przejdź do <b>Ustawienia → Fiskalizacja</b>.
            </AlertDescription>
          </Alert>
        ) : (
          <div className="space-y-4">
            {/* Wpisywanie pozycji — Enter dodaje i wraca do nazwy */}
            <div className="rounded-lg border p-3 space-y-2">
              <div className="grid grid-cols-12 gap-2 items-end">
                <div className="col-span-5 space-y-1 relative">
                  <Label className="text-xs">Nazwa</Label>
                  <Input
                    ref={nameRef}
                    value={draft.name}
                    onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addItem(); } }}
                    placeholder="np. Żarówka H7"
                    className="h-9"
                  />
                  {suggestions.length > 0 && (
                    <div className="absolute z-50 top-full left-0 right-0 mt-1 rounded-md border bg-popover shadow-md max-h-48 overflow-auto">
                      {suggestions.map((suggestion, index) => (
                        <button
                          key={index}
                          type="button"
                          className="w-full text-left px-2 py-1.5 text-sm hover:bg-muted flex items-center justify-between gap-2"
                          onClick={() => {
                            setDraft({
                              ...draft,
                              name: suggestion.name,
                              unitPrice: suggestion.price ? String(suggestion.price) : draft.unitPrice,
                              unit: suggestion.unit || draft.unit,
                              vatRate: vatKeys.includes(suggestion.vat) ? suggestion.vat : draft.vatRate,
                            });
                            setSuggestions([]);
                          }}
                        >
                          <span className="truncate">{suggestion.name}</span>
                          {suggestion.price > 0 && (
                            <span className="text-xs text-muted-foreground shrink-0">
                              {suggestion.price.toFixed(2)} zł
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="col-span-2 space-y-1">
                  <Label className="text-xs">Ilość</Label>
                  <Input
                    value={draft.quantity}
                    onChange={(e) => setDraft({ ...draft, quantity: e.target.value })}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addItem(); } }}
                    className="h-9 text-right"
                  />
                </div>
                <div className="col-span-2 space-y-1">
                  <Label className="text-xs">Cena brutto</Label>
                  <Input
                    value={draft.unitPrice}
                    onChange={(e) => setDraft({ ...draft, unitPrice: e.target.value })}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addItem(); } }}
                    placeholder="0,00"
                    className="h-9 text-right"
                  />
                </div>
                <div className="col-span-2 space-y-1">
                  <Label className="text-xs">VAT</Label>
                  <Select value={draft.vatRate} onValueChange={(value) => setDraft({ ...draft, vatRate: value })}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {vatKeys.map((rate) => (
                        <SelectItem key={rate} value={rate}>
                          {rate === 'zw' ? 'zw.' : `${rate}%`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-1">
                  <Button type="button" onClick={addItem} className="h-9 w-full px-0" title="Dodaj pozycję (Enter)">
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Enter dodaje pozycję i wraca do nazwy. Nazwy dłuższe niż {nameLength} znaków są skracane.
              </p>
            </div>

            {items.length > 0 && (
              <div className="rounded-md border max-h-56 overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nazwa</TableHead>
                      <TableHead className="text-right">Ilość</TableHead>
                      <TableHead className="text-right">Cena</TableHead>
                      <TableHead className="text-right">VAT</TableHead>
                      <TableHead className="text-right">Wartość</TableHead>
                      <TableHead className="w-8" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item, index) => (
                      <TableRow key={item.key}>
                        <TableCell className="font-mono text-xs">
                          {item.name}
                          {item.originalName && item.originalName !== item.name && (
                            <div className="text-[11px] text-muted-foreground line-through">{item.originalName}</div>
                          )}
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap">{item.quantity} {item.unit}</TableCell>
                        <TableCell className="text-right whitespace-nowrap">{formatPln(toGrosze(item.unitPrice))}</TableCell>
                        <TableCell className="text-right">{item.vatRate === 'zw' ? 'zw.' : `${item.vatRate}%`}</TableCell>
                        <TableCell className="text-right whitespace-nowrap">
                          {formatPln(Math.round(toGrosze(item.unitPrice) * item.quantity))}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            onClick={() => setItems((prev) => prev.filter((_, i) => i !== index))}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            <FiscalBuyerSection
              {...buyer}
              onChange={(patch) => setBuyer((prev) => ({ ...prev, ...patch }))}
              totalGrosze={totalGrosze}
            />

            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <div className="text-sm text-muted-foreground">Forma płatności</div>
                <div className="flex gap-2">
                  {(Object.keys(PAYMENT_LABELS) as PaymentMethod[]).map((key) => {
                    const { label, icon: Icon } = PAYMENT_LABELS[key];
                    return (
                      <Button
                        key={key}
                        type="button"
                        size="sm"
                        variant={method === key ? 'default' : 'outline'}
                        onClick={() => setMethod(key)}
                        className="gap-1"
                      >
                        <Icon className="h-4 w-4" /> {label}
                      </Button>
                    );
                  })}
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm text-muted-foreground">Do zapłaty</div>
                <div className="text-2xl font-bold">{formatPln(totalGrosze)}</div>
              </div>
            </div>

            {printer.mode === 'training' && (
              <Alert>
                <TriangleAlert className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  Drukarka pracuje w <b>trybie szkoleniowym</b> — paragon będzie niefiskalny.
                </AlertDescription>
              </Alert>
            )}

            {error && (
              <Alert variant="destructive">
                <TriangleAlert className="h-4 w-4" />
                <AlertDescription>{error.message}</AlertDescription>
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
