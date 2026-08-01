/**
 * Szybki paragon — sprzedaż od ręki, bez zakładania zlecenia.
 *
 * Warsztat sprzedaje nie tylko naprawy: część, płyn, żarówka — klient płaci i wychodzi.
 * Pozycje wpisuje się wprost w tabelę (jak w edytorze faktury): dla każdej osobno cena
 * netto i brutto oraz własny rabat. Reszta logiki jest wspólna z paragonem ze zlecenia:
 * nazwa fiskalna, sekcja nabywcy z NIP-em, mostek/drukarka, wpis w fiscal_receipts.
 *
 * Dokument źródłowy: document_type = 'kasa_szybka', document_id = własny UUID sprzedaży —
 * paragon nie jest powiązany z żadnym zleceniem, ale jest pełnoprawną sprzedażą fiskalną
 * widoczną w Kasie fiskalnej, w podsumowaniu obrotu i (po zaznaczeniu) w kasie gotówkowej.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Printer, Receipt, TriangleAlert, CheckCircle2, Wallet, CreditCard, Smartphone, Percent } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useFiscalPrinter, useFiscalizeReceipt, FiscalError } from '@/hooks/useFiscal';
import { useRegisterReceiptPayment } from '@/hooks/useFiscalCash';
import { computeReceiptTotalGrosze, formatPln, type FiscalItemInput } from '@/lib/fiscal';
import { DEFAULT_FISCAL_NAME_LENGTH, toFiscalName } from '@/lib/fiscalName';
import { grossToNet, parseAmount, totalDiscountFactor, type DiscountType } from '@/lib/fiscalPricing';
import { FiscalBuyerSection, buyerBlocksPrint, buyerNipForPrint, type BuyerState } from './FiscalBuyerSection';
import { FiscalQuickReceiptRows, emptyQuickRow, quickRowToItem, type QuickRow } from './FiscalQuickReceiptRows';

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

export function FiscalQuickReceiptDialog({ open, onOpenChange, providerId }: Props) {
  const { data: printer } = useFiscalPrinter(providerId);
  const fiscalize = useFiscalizeReceipt(providerId);
  const registerPayment = useRegisterReceiptPayment(providerId);

  const [rows, setRows] = useState<QuickRow[]>([emptyQuickRow()]);
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [buyer, setBuyer] = useState<BuyerState>({ buyerType: 'individual', nip: '', printNip: true });
  const [registerCash, setRegisterCash] = useState(true);
  const [discountOn, setDiscountOn] = useState(false);
  const [discountScope, setDiscountScope] = useState<'total' | 'line'>('line');
  const [discountType, setDiscountType] = useState<DiscountType>('percent');
  const [discountValue, setDiscountValue] = useState('');
  const [suggestFor, setSuggestFor] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<Array<{ name: string; price: number; unit: string; vat: string }>>([]);
  const [result, setResult] = useState<{ receiptNumber: number | null; total: number } | null>(null);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  const nameLength = printer?.item_name_length ?? DEFAULT_FISCAL_NAME_LENGTH;
  const vatKeys = Object.keys(
    (printer?.vat_map as Record<string, string>) ?? { '23': 'A', '8': 'B', '5': 'C', '0': 'D', zw: 'E' },
  );

  const reset = () => {
    setRows([emptyQuickRow()]);
    setMethod('cash');
    setBuyer({ buyerType: 'individual', nip: '', printNip: true });
    setRegisterCash(true);
    setDiscountOn(false);
    setDiscountScope('line');
    setDiscountType('percent');
    setDiscountValue('');
    setResult(null);
    setError(null);
    setTimeout(() => nameRef.current?.focus(), 80);
  };

  useEffect(() => {
    if (open) reset();
  }, [open]);

  // Podpowiedzi z magazynu — wygodne, ale całość działa też w pełni ręcznie.
  const suggestTerm = rows.find((row) => row.key === suggestFor)?.name ?? '';
  useEffect(() => {
    const term = suggestTerm.trim();
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
  }, [suggestTerm]);

  /** Pisanie w ostatnim wierszu dokleja pod spodem kolejny pusty. */
  const updateRow = (key: string, patch: Partial<QuickRow>) => {
    setRows((prev) => {
      const next = prev.map((row) => (row.key === key ? { ...row, ...patch } : row));
      const last = next[next.length - 1];
      if (last.name.trim() || last.priceGross.trim()) next.push(emptyQuickRow(last.vatRate, last.unit));
      return next;
    });
  };

  const removeRow = (key: string) =>
    setRows((prev) => {
      const next = prev.filter((row) => row.key !== key);
      return next.length ? next : [emptyQuickRow()];
    });

  const lineDiscounts = discountOn && discountScope === 'line';

  const baseItems = useMemo(
    () => rows.map((row) => quickRowToItem(row, lineDiscounts)).filter(Boolean) as FiscalItemInput[],
    [rows, lineDiscounts],
  );
  const baseTotalGrosze = useMemo(() => computeReceiptTotalGrosze(baseItems), [baseItems]);

  // Rabat na cały paragon rozkładamy proporcjonalnie na pozycje — drukarka dostaje ceny
  // już pomniejszone, więc suma na papierze zgadza się z tym, co płaci klient.
  const globalFactor =
    discountOn && discountScope === 'total'
      ? totalDiscountFactor(baseTotalGrosze, parseAmount(discountValue) || 0, discountType)
      : 1;

  const items = useMemo(
    () =>
      globalFactor === 1
        ? baseItems
        : baseItems.map((item) => ({
            ...item,
            unitPrice: Math.max(0.01, Math.round(item.unitPrice * globalFactor * 100) / 100),
          })),
    [baseItems, globalFactor],
  );

  const totalGrosze = useMemo(() => computeReceiptTotalGrosze(items), [items]);
  const discountGrosze = Math.max(0, baseTotalGrosze - totalGrosze);
  const canPrint = Boolean(printer) && items.length > 0 && !buyerBlocksPrint(buyer) && !fiscalize.isPending;

  const handlePrint = async () => {
    if (!items.length) return;
    setError(null);
    try {
      const response = await fiscalize.mutateAsync({
        printerId: printer?.id,
        printer,
        documentType: 'kasa_szybka',
        documentId: crypto.randomUUID(),
        items: items.map((item) => ({ ...item, name: toFiscalName(item.name, nameLength) })),
        payments: [{ name: PAYMENT_LABELS[method].printer, amount: totalGrosze / 100 }],
        buyerNip: buyerNipForPrint(buyer),
      });
      setResult({ receiptNumber: response.receiptNumber, total: response.total });
      toast.success(
        response.receiptNumber ? `Paragon wydrukowany (nr ${response.receiptNumber})` : 'Paragon wydrukowany',
      );

      // Sprzedaż od ręki: pieniądze wpływają od razu, więc wpłata idzie do kasy
      // formą wybraną na paragonie (o ile użytkownik tego nie odznaczył).
      if (registerCash && response.receiptId) {
        try {
          const cash = await registerPayment.mutateAsync({
            receiptId: response.receiptId,
            amountGrosze: totalGrosze,
            method,
          });
          if (cash.created) {
            toast.success(`Wpłata ${formatPln(cash.amountGrosze)} w kasie (${PAYMENT_LABELS[method].label}).`);
          }
        } catch (cashError: any) {
          toast.error(`Paragon wydrukowany, ale wpłata do kasy nie zapisała się: ${cashError?.message ?? ''}`);
        }
      }
    } catch (e) {
      const fiscalError = e as FiscalError;
      setError({ code: fiscalError.code ?? 'UNKNOWN', message: fiscalError.message });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl">
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
              {registerCash && <div>Wpłata zapisana w kasie.</div>}
              {printer?.mode === 'training' && (
                <div className="text-amber-600">Drukarka pracuje w trybie szkoleniowym — wydruk niefiskalny.</div>
              )}
            </div>
            <Button variant="outline" onClick={reset}>Wystaw kolejny</Button>
          </div>
        ) : !printer ? (
          <Alert variant="destructive">
            <TriangleAlert className="h-4 w-4" />
            <AlertDescription>
              Nie skonfigurowano drukarki fiskalnej. Przejdź do <b>Ustawienia → Fiskalizacja</b>.
            </AlertDescription>
          </Alert>
        ) : (
          <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <p className="text-xs text-muted-foreground">
                Wpisz cenę netto albo brutto — druga przeliczy się sama. Kolejny wiersz dokleja się automatycznie.
              </p>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox checked={discountOn} onCheckedChange={(v) => setDiscountOn(v === true)} />
                <Percent className="h-3.5 w-3.5" /> Rabat / zniżka
              </label>
            </div>

            {discountOn && (
              <div className="rounded-lg border p-3 flex items-center gap-3 flex-wrap text-sm">
                <span className="text-muted-foreground">Zastosuj do</span>
                <div className="flex gap-0.5 rounded-md border p-0.5">
                  <Button
                    type="button"
                    size="sm"
                    variant={discountScope === 'line' ? 'default' : 'ghost'}
                    className="h-6 px-2 text-xs"
                    onClick={() => setDiscountScope('line')}
                  >
                    Każda pozycja osobno
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={discountScope === 'total' ? 'default' : 'ghost'}
                    className="h-6 px-2 text-xs"
                    onClick={() => setDiscountScope('total')}
                  >
                    Cały paragon
                  </Button>
                </div>

                {discountScope === 'total' ? (
                  <div className="flex items-center gap-2">
                    <Input
                      value={discountValue}
                      onChange={(e) => setDiscountValue(e.target.value)}
                      placeholder={discountType === 'percent' ? '10' : '50,00'}
                      className="h-8 w-24 text-right"
                    />
                    <div className="flex gap-0.5 rounded-md border p-0.5">
                      <Button
                        type="button"
                        size="sm"
                        variant={discountType === 'percent' ? 'default' : 'ghost'}
                        className="h-6 px-2 text-xs"
                        onClick={() => setDiscountType('percent')}
                      >
                        %
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant={discountType === 'amount' ? 'default' : 'ghost'}
                        className="h-6 px-2 text-xs"
                        onClick={() => setDiscountType('amount')}
                      >
                        zł
                      </Button>
                    </div>
                  </div>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    Rabat ustawiasz przy każdej pozycji — procentowy albo kwotowy.
                  </span>
                )}
              </div>
            )}

            <FiscalQuickReceiptRows
              rows={rows}
              vatKeys={vatKeys}
              discountsEnabled={lineDiscounts}
              globalFactor={globalFactor}
              onChange={updateRow}
              onRemove={removeRow}
              firstInputRef={nameRef}
              onNameFocus={setSuggestFor}
              onNameBlur={(key) => setTimeout(() => setSuggestFor((c) => (c === key ? null : c)), 150)}
              suggestionsFor={suggestFor}
              suggestions={suggestions}
              onPickSuggestion={(key, suggestion) => {
                const row = rows.find((r) => r.key === key);
                const vatRate = vatKeys.includes(suggestion.vat) ? suggestion.vat : row?.vatRate ?? '23';
                updateRow(key, {
                  name: suggestion.name,
                  unit: suggestion.unit || row?.unit || 'szt',
                  vatRate,
                  priceGross: suggestion.price ? suggestion.price.toFixed(2) : row?.priceGross ?? '',
                  priceNet: suggestion.price ? grossToNet(suggestion.price, vatRate).toFixed(2) : row?.priceNet ?? '',
                });
                setSuggestFor(null);
              }}
            />

            <FiscalBuyerSection
              {...buyer}
              onChange={(patch) => setBuyer((prev) => ({ ...prev, ...patch }))}
              totalGrosze={totalGrosze}
            />

            <div className="flex items-end justify-between gap-4 flex-wrap">
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
                {discountGrosze > 0 && (
                  <>
                    <div className="text-xs text-muted-foreground">Suma przed rabatem: {formatPln(baseTotalGrosze)}</div>
                    <div className="text-xs text-amber-600">Rabat: −{formatPln(discountGrosze)}</div>
                  </>
                )}
                <div className="text-sm text-muted-foreground">
                  Do zapłaty {items.length > 0 && <span className="text-xs">({items.length} poz.)</span>}
                </div>
                <div className="text-2xl font-bold">{formatPln(totalGrosze)}</div>
              </div>
            </div>

            {/* Paragon steruje kasą: forma płatności z paragonu tworzy wpłatę.
                Świadomy wybór, bo warsztat czasem drukuje paragon, a pieniądze bierze przy odbiorze. */}
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox checked={registerCash} onCheckedChange={(v) => setRegisterCash(v === true)} />
              Zarejestruj wpłatę w kasie ({PAYMENT_LABELS[method].label}, {formatPln(totalGrosze)})
            </label>

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
