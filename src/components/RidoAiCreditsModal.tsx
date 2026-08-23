import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { formatMoneyPLN } from '@/utils/formatters';
import { Button } from '@/components/ui/button';
import { Sparkles, Wrench, Stethoscope, ShoppingCart } from 'lucide-react';
import { DoladowanieModal } from '@/components/billing/DoladowanieModal';

/**
 * Co kryje się pod licznikiem Rido AI.
 *
 * Doładowania jeszcze nie ma — warsztat prosił, żeby najpierw pojawił się sam
 * licznik, a sprzedaż pakietów dołożyć później. Dlatego okno na razie tylko
 * tłumaczy, skąd bierze się ta liczba i co ją zmniejsza. Kupowanie wejdzie tu,
 * gdy ceny pakietów zostaną ustalone — bez przebudowy, bo licznik i pula już
 * działają tak samo jak przy SMS-ach i sprawdzeniach pojazdu.
 */
interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** `null` = plan bez limitu, `undefined` = jeszcze nie wiadomo. */
  dostepne: number | null | undefined;
}

export function RidoAiCreditsModal({ open, onOpenChange, dostepne }: Props) {
  const bezLimitu = dostepne === null;
  const [doladowanie, setDoladowanie] = useState(false);

  /**
   * CENA I WIELKOŚĆ PACZKI CZYTANE Z BAZY.
   *
   * 🔴 NAPRAWIONE 22.08.2026. Na przycisku stało wpisane w kod „Dokup 200 pytań
   * — 49,20 zł". Cena zmieniła się na 69 zł netto i przycisk zaczął KŁAMAĆ:
   * klient widział jedną kwotę, a w bramce płatności drugą.
   *
   * Kwota w tekście, który ktoś musi pamiętać, żeby poprawić, to obietnica
   * czekająca na złamanie. Bierzemy ją stamtąd, skąd bierze ją bramka.
   */
  const [pakiet, setPakiet] = useState<{ step: number; netto: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    let anulowane = false;
    (async () => {
      const { data } = await (supabase as any)
        .from('billing_addon_products')
        .select('step, unit_price_net, vat_rate')
        .eq('code', 'rido_ai')
        .eq('is_active', true)
        .maybeSingle();
      if (anulowane || !data) return;
      // NETTO, bo w tym cenniku wszystkie kwoty są netto i warsztat odlicza VAT.
      // Mieszanie netto z brutto w jednym miejscu to najprostsza droga do
      // wrażenia, że cena się zmieniła.
      setPakiet({ step: Number(data.step), netto: Number(data.step) * Number(data.unit_price_net) });
    })();
    return () => { anulowane = true; };
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" /> Rido AI
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-lg border bg-muted/30 p-4 text-center">
            <p className="text-3xl font-bold text-primary">
              {bezLimitu ? '∞' : (dostepne ?? 0)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {bezLimitu ? 'Twój plan nie ma limitu pytań' : 'pytań zostało do wykorzystania'}
            </p>
          </div>

          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground">Z tej samej puli idą dwie rzeczy:</p>

            <div className="flex gap-3">
              <Wrench className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
              <div>
                <p className="font-medium">Rido Wycena</p>
                <p className="text-xs text-muted-foreground">
                  Podpowiedź kwot w kosztorysie — jedno pytanie za każde wywołanie.
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <Stethoscope className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
              <div>
                <p className="font-medium">Pomoc RIDO AI</p>
                <p className="text-xs text-muted-foreground">
                  Doradca naprawczy przy konkretnym aucie: opisujesz objaw, dorzucasz
                  zdjęcie albo PDF, a Rido szuka w internecie i wraca z diagnozą,
                  krokami i źródłami. Jedna wiadomość to jedno pytanie.
                </p>
              </div>
            </div>
          </div>

          {/*
            DOKUPIENIE NIE ZASTĘPUJE PLANU — DOKŁADA SIĘ DO NIEGO.
            Pakiet ma być doładowaniem awaryjnym w miesiącu, w którym limit
            skończył się wcześniej, a nie tańszą drogą naokoło abonamentu.
            Wielkość paczki i cena stoją w `billing_addon_products` — jedno
            miejsce dla panelu i dla bramki płatności.
          */}
          {!bezLimitu && (
            <Button className="w-full gap-2" onClick={() => setDoladowanie(true)}>
              <ShoppingCart className="h-4 w-4" />
              {pakiet
                ? `Dokup ${pakiet.step} pytań — ${formatMoneyPLN(pakiet.netto)} netto`
                : 'Dokup pytania'}
            </Button>
          )}

          <p className="text-xs text-muted-foreground border-t pt-3">
            Plan nie daje pytań co miesiąc — przy jego uruchomieniu dostajesz
            jednorazową pulę na sprawdzenie, a dalej działa dokupienie. Dokupione
            pytania są bezterminowe i nie przepadają na koniec miesiąca.
          </p>
        </div>
      </DialogContent>

      <DoladowanieModal
        open={doladowanie}
        onOpenChange={setDoladowanie}
        productCode="rido_ai"
        tytul="Dokup pytania do Rido AI"
        jednostka="pytań"
      />
    </Dialog>
  );
}
