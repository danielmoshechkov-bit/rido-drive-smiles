import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  PlanFloty,
  historiaKierowcy,
  opisPlanu,
  planNaTydzien,
  poniedzialekTygodnia,
  usePlanyFloty,
  usePrzypisaniaPlanow,
  useUstawPlanKierowcy,
  useUsunPrzypisanie,
} from '@/hooks/usePlanyRozliczen';
import { tydzienZDaty, useTydzienZapisu, zdanieOTygodniu } from '@/hooks/useWybranyTydzien';

/**
 * Wybór planu rozliczeń kierowcy — JEDEN komponent na dwa miejsca: popover „i"
 * przy kierowcy w tabeli rozliczeń oraz karta kierowcy na liście kierowców.
 *
 * Zmiana zrobiona w jednym miejscu jest natychmiast widoczna w drugim, bo oba
 * czytają tę samą pamięć podręczną zapytań.
 *
 * PLAN OBOWIĄZUJE OD TYGODNIA WYBRANEGO W MODULE ROZLICZEŃ, W PRZÓD.
 * Wcześniejsze tygodnie zostają nietknięte — są rozliczone.
 *
 * OBA MIEJSCA ZAPISUJĄ OD TEGO SAMEGO TYGODNIA. Lista kierowców nie ma własnego
 * wyboru tygodnia, więc bierze go ze wspólnego stanu (`useTydzienZapisu`), a nie
 * z dzisiejszej daty. Do 15.09.2026 brała bieżący poniedziałek i przez to
 * ustawienie zrobione na liście lądowało w innym tygodniu niż to z tabeli —
 * wyglądało, jakby plan „nie synchronizował się" między ekranami.
 *
 * Zdanie o dacie obowiązywania stoi NAD wyborem planu, nie pod nim: zapis
 * dzieje się w chwili wyboru z listy, więc użytkownik musi wiedzieć wcześniej,
 * czego dotknie.
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
  /**
   * Poniedziałek tygodnia, od którego plan ma obowiązywać. Pominięty — bierzemy
   * tydzień wybrany w module rozliczeń (wspólny stan), a gdy nikt nic nie wybrał,
   * tydzień bieżący.
   */
  odTygodnia?: string | null;
  rozmiar?: 'maly' | 'normalny';
  /** Dostaje wybrany plan, żeby wywołujący mógł przeliczyć swój widok bez przeładowania. */
  onZmieniono?: (plan: PlanFloty | null) => void;
}) {
  const tydzienZeStanu = useTydzienZapisu();
  // Prop wygrywa (ekran, który zna swój tydzień), ale domyślnie bierzemy TEN SAM
  // tydzień, co tabela rozliczeń — żeby oba miejsca zapisywały w to samo miejsce.
  const tydzienZapisu = odTygodnia ? tydzienZDaty(odTygodnia) : tydzienZeStanu;
  const tydzien = tydzienZapisu.start;
  const { data: plany, isLoading: ladujePlany, error: bladPlanow } = usePlanyFloty(fleetId);
  const { data: przypisania, isLoading: ladujePrzypisania } = usePrzypisaniaPlanow(fleetId);
  const ustawPlan = useUstawPlanKierowcy();
  const usunPrzypisanie = useUsunPrzypisanie();

  const wysokosc = rozmiar === 'maly' ? 'h-7 text-xs' : 'h-8 text-xs';
  const biezacyPlan = planNaTydzien(przypisania, driverId, tydzien);
  const historia = historiaKierowcy(przypisania, driverId);

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
    <div className="space-y-1.5">
      <p className="text-xs font-medium rounded-md border border-primary/30 bg-primary/5 px-2 py-1.5">
        {zdanieOTygodniu(tydzienZapisu)}
      </p>
      <Select
        value={biezacyPlan ?? 'brak'}
        disabled={ustawPlan.isPending}
        onValueChange={(wartosc) => {
          const nowy = wartosc === 'brak' ? null : wartosc;
          ustawPlan.mutate(
            { driverId, planId: nowy, odTygodnia: tydzien },
            {
              onSuccess: () => {
                const wybrany = plany.find((p) => p.id === nowy) ?? null;
                toast.success(
                  wybrany
                    ? `Plan „${wybrany.name}" obowiązuje od ${dataPl}`
                    : `Plan zdjęty od ${dataPl} — liczymy po ustawieniach miasta`,
                );
                onZmieniono?.(wybrany);
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
      <p className="text-[10px] text-muted-foreground">
        Wcześniejsze tygodnie zostają bez zmian.
      </p>

      {/* Historia przypisań. Bez niej nie widać, dlaczego tabela pokazuje inny plan
          niż ten właśnie wybrany: obowiązuje wiersz z datą <= oglądany tydzień. */}
      {historia.length > 0 && (
        <div className="rounded-md border p-1.5 space-y-0.5">
          <p className="text-[9px] uppercase tracking-wide text-muted-foreground">Historia planów</p>
          {historia.map((h) => {
            const data = new Date(h.effective_from).toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' });
            const nazwa = h.plan_id ? (plany.find((p) => p.id === h.plan_id)?.name ?? 'plan usunięty') : 'bez planu';
            const obowiazuje = h.effective_from === (historia.find((x) => x.effective_from <= tydzien)?.effective_from ?? '');
            return (
              <div key={h.effective_from} className="flex items-center justify-between gap-2 text-[10px]">
                <span className={obowiazuje ? 'font-medium' : 'text-muted-foreground'}>
                  od {data}: {nazwa}{obowiazuje ? ' ← w tym tygodniu' : ''}
                </span>
                <button
                  type="button"
                  className="text-muted-foreground hover:text-destructive shrink-0"
                  title={`Usuń przypisanie od ${data}`}
                  disabled={usunPrzypisanie.isPending}
                  onClick={() => {
                    usunPrzypisanie.mutate(
                      { driverId, odTygodnia: h.effective_from },
                      {
                        onSuccess: () => {
                          toast.success(`Usunięto przypisanie od ${data}`);
                          onZmieniono?.(null);
                        },
                        onError: (blad: any) => toast.error(blad?.message || 'Nie udało się usunąć przypisania'),
                      },
                    );
                  }}
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
