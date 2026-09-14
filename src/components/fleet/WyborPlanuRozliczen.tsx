import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  opisPlanu,
  planNaTydzien,
  poniedzialekTygodnia,
  usePlanyFloty,
  usePrzypisaniaPlanow,
  useUstawPlanKierowcy,
} from '@/hooks/usePlanyRozliczen';

/**
 * Wybór planu rozliczeń kierowcy — JEDEN komponent na dwa miejsca: popover „i"
 * przy kierowcy w tabeli rozliczeń oraz karta kierowcy na liście kierowców.
 *
 * Zmiana zrobiona w jednym miejscu jest natychmiast widoczna w drugim, bo oba
 * czytają tę samą pamięć podręczną zapytań.
 *
 * PLAN OBOWIĄZUJE OD TYGODNIA, NA KTÓRYM STOISZ, W PRZÓD. Wcześniejsze tygodnie
 * zostają nietknięte — są rozliczone. Dlatego komponent MUSI dostać `odTygodnia`
 * z ekranu, na którym go otwarto; brak tej daty to cichy powrót do „zmiana
 * działa wstecz na wszystko", czyli dokładnie to, co naprawiamy.
 */
export function WyborPlanuRozliczen({
  driverId,
  fleetId,
  odTygodnia,
  rozmiar = 'normalny',
  onZmieniono,
}: {
  driverId: string;
  fleetId?: string | null;
  /** Poniedziałek tygodnia, od którego plan ma obowiązywać. Domyślnie bieżący tydzień. */
  odTygodnia?: string | null;
  rozmiar?: 'maly' | 'normalny';
  onZmieniono?: () => void;
}) {
  const tydzien = odTygodnia || poniedzialekTygodnia();
  const { data: plany, isLoading: ladujePlany, error: bladPlanow } = usePlanyFloty(fleetId);
  const { data: przypisania, isLoading: ladujePrzypisania } = usePrzypisaniaPlanow(fleetId);
  const ustawPlan = useUstawPlanKierowcy();

  const wysokosc = rozmiar === 'maly' ? 'h-7 text-xs' : 'h-8 text-xs';
  const biezacyPlan = planNaTydzien(przypisania, driverId, tydzien);

  if (bladPlanow) {
    return <span className="text-[11px] text-destructive">Nie udało się wczytać planów rozliczeń</span>;
  }

  if (ladujePlany || ladujePrzypisania) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" /> Wczytywanie planów…
      </span>
    );
  }

  if (!plany || plany.length === 0) {
    return (
      <span className="text-[11px] text-muted-foreground">
        Brak planów — dodaj je w „Ustawienia rozliczeń → Plany rozliczeń".
      </span>
    );
  }

  const dataPl = new Date(tydzien).toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' });

  return (
    <div className="space-y-1">
      <Select
        value={biezacyPlan ?? 'brak'}
        disabled={ustawPlan.isPending}
        onValueChange={(wartosc) => {
          const nowy = wartosc === 'brak' ? null : wartosc;
          ustawPlan.mutate(
            { driverId, planId: nowy, odTygodnia: tydzien },
            {
              onSuccess: () => {
                const nazwa = plany.find((p) => p.id === nowy)?.name;
                toast.success(
                  nowy
                    ? `Plan „${nazwa}" obowiązuje od ${dataPl}`
                    : `Plan zdjęty od ${dataPl} — liczymy po ustawieniach miasta`,
                );
                onZmieniono?.();
              },
              onError: (blad: any) => toast.error(blad?.message || 'Nie udało się zmienić planu'),
            },
          );
        }}
      >
        <SelectTrigger className={wysokosc}>
          <SelectValue placeholder="Wybierz plan" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="brak">
            <span className="text-muted-foreground">Bez planu (ustawienia miasta)</span>
          </SelectItem>
          {plany.map((plan) => (
            <SelectItem key={plan.id} value={plan.id}>
              <span className="flex flex-col">
                <span>{plan.name}</span>
                <span className="text-[10px] text-muted-foreground">{opisPlanu(plan)}</span>
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-[9px] text-muted-foreground">
        Obowiązuje od tygodnia {dataPl} w przód. Wcześniejsze tygodnie zostają bez zmian.
      </p>
    </div>
  );
}
