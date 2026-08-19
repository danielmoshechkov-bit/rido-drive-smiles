import { useEffect, useMemo, useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Minus, Plus, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useOdswiezJednostki } from '@/hooks/useDostepneJednostki';
import { czekajNaWydanie, zapamietajZamowienie, LIMIT_KARTY_ZAKUPU_MS } from '@/lib/doladowanie';
import { toast } from 'sonner';
import { formatMoneyPLN } from '@/utils/formatters';

/**
 * Doładowanie w modelu SUWAKA: licznik sztuk, stała stawka, kwota licząca się
 * na bieżąco. Świadomie NIE ma sztywnych pakietów — warsztat kupuje tyle,
 * ile potrzebuje, a nie najbliższy wariant z listy.
 *
 * Kwota pokazana tutaj jest WYŁĄCZNIE podglądem. Cenę rozstrzyga
 * `billing_wylicz_doladowanie` po stronie bazy, a `billing-payu-order` liczy
 * ją ponownie przed wystawieniem zamówienia — przeglądarka nie może ustalać,
 * ile coś kosztuje.
 */
interface Produkt {
  code: string;
  name: string;
  unit_price_net: number;
  step: number;
  min_units: number;
}

export function DoladowanieModal({
  open,
  onOpenChange,
  productCode,
  tytul,
  jednostka,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productCode: string;
  tytul: string;
  /** Odmieniona nazwa jednostki do podpisu pod licznikiem, np. „SMS-ów". */
  jednostka: string;
}) {
  const odswiez = useOdswiezJednostki();
  const [produkt, setProdukt] = useState<Produkt | null>(null);
  const [ladowanie, setLadowanie] = useState(true);
  const [ile, setIle] = useState<number>(0);
  const [tekst, setTekst] = useState('');
  const [wysylka, setWysylka] = useState(false);

  useEffect(() => {
    if (!open) return;
    let anulowane = false;
    setLadowanie(true);
    (async () => {
      const { data } = await (supabase as any)
        .from('billing_addon_products')
        .select('code, name, unit_price_net, step, min_units')
        .eq('code', productCode)
        .eq('is_active', true)
        .maybeSingle();
      if (anulowane) return;
      if (data) {
        setProdukt(data as Produkt);
        setIle(Number(data.min_units));
        setTekst(String(data.min_units));
      }
      setLadowanie(false);
    })();
    return () => { anulowane = true; };
  }, [open, productCode]);

  const kwotaNetto = useMemo(
    () => (produkt ? Math.round(ile * Number(produkt.unit_price_net) * 100) / 100 : 0),
    [produkt, ile],
  );

  const ustaw = (nowa: number) => {
    if (!produkt) return;
    const dol = produkt.min_units;
    // Zaokrąglenie do kroku: wpisanie 137 daje 100, nie odmowę przy zapłacie.
    const doKroku = Math.round(nowa / produkt.step) * produkt.step;
    const wynik = Math.max(dol, Math.min(1_000_000, doKroku));
    setIle(wynik);
    setTekst(String(wynik));
  };

  const zaplac = async () => {
    if (!produkt || wysylka) return;
    // Kartę otwieramy SYNCHRONICZNIE — przeglądarka blokuje `window.open`
    // wywołane po `await`, bo nie widzi już gestu użytkownika.
    const karta = window.open('', '_blank');
    setWysylka(true);
    try {
      const { data, error } = await supabase.functions.invoke('billing-payu-order', {
        body: { product_code: produkt.code, units: ile },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (!data?.url) throw new Error('Nie udało się rozpocząć płatności.');
      if (karta) karta.location.href = data.url;
      else window.location.href = data.url;
      onOpenChange(false);

      // Czuwanie w TEJ karcie. PayU otwiera się obok, więc powrót ląduje gdzie
      // indziej — a ten panel zostaje otwarty ze starym licznikiem i nic go nie
      // odświeży (`refetchOnWindowFocus` jest wyłączony). Świadomie bez `await`:
      // modal zaraz się zamknie, a czuwanie ma trwać dalej. Bez komunikatów —
      // te pokazuje karta, na którą klient wraca.
      // Zapis przeżywa odświeżenie panelu i zamknięcie karty PayU — bez niego
      // nadzór ginie razem z pamięcią karty.
      zapamietajZamowienie(data.order_id);

      void czekajNaWydanie({
        orderId: data.order_id,
        limitMs: LIMIT_KARTY_ZAKUPU_MS,
        gdyWydane: () => { void odswiez(); },
      });
    } catch (e) {
      karta?.close();
      toast.error(e instanceof Error ? e.message : 'Nie udało się rozpocząć płatności.');
    } finally {
      setWysylka(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{tytul}</DialogTitle>
          <DialogDescription>
            {produkt
              ? `${formatMoneyPLN(produkt.unit_price_net)} netto za sztukę, krok co ${produkt.step}.`
              : 'Wczytuję cennik…'}
          </DialogDescription>
        </DialogHeader>

        {ladowanie ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : !produkt ? (
          <p className="py-6 text-sm text-muted-foreground">
            Ten rodzaj doładowania jest chwilowo niedostępny.
          </p>
        ) : (
          <div className="space-y-5 py-2">
            <div className="flex items-center justify-center gap-3">
              <Button
                variant="outline"
                size="icon"
                onClick={() => ustaw(ile - produkt.step)}
                disabled={ile <= produkt.min_units}
                aria-label="Mniej"
              >
                <Minus className="h-4 w-4" />
              </Button>

              {/* Wpisywanie z klawiatury jest konieczne: przy 5000 SMS-ach
                  klikanie setkami to pięćdziesiąt kliknięć. Wartość
                  dociągamy do kroku dopiero przy opuszczeniu pola, żeby nie
                  poprawiać cyfr w trakcie pisania. */}
              <Input
                inputMode="numeric"
                className="w-28 text-center text-lg font-semibold"
                value={tekst}
                onChange={(e) => setTekst(e.target.value.replace(/[^\d]/g, ''))}
                onBlur={() => ustaw(Number(tekst) || produkt.min_units)}
                onKeyDown={(e) => { if (e.key === 'Enter') ustaw(Number(tekst) || produkt.min_units); }}
              />

              <Button
                variant="outline"
                size="icon"
                onClick={() => ustaw(ile + produkt.step)}
                aria-label="Więcej"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>

            <p className="text-center text-sm text-muted-foreground">{jednostka}</p>

            <div className="rounded-lg border bg-muted/50 p-4 text-center">
              <p className="text-sm text-muted-foreground">Do zapłaty</p>
              <p className="text-3xl font-extrabold">{formatMoneyPLN(kwotaNetto)}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                * Podana cena jest kwotą netto
              </p>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Anuluj</Button>
          <Button onClick={zaplac} disabled={!produkt || wysylka}>
            {wysylka && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Przejdź do płatności
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
