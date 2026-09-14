import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  opisPlanu,
  usePlanKierowcy,
  usePlanyRozliczen,
  useUstawPlanKierowcy,
} from '@/hooks/usePlanyRozliczen';

/**
 * Wybór planu rozliczeń kierowcy — JEDEN komponent na dwa miejsca:
 * popover „i" przy kierowcy w tabeli rozliczeń oraz karta kierowcy na liście.
 *
 * Dzięki wspólnej pamięci podręcznej TanStack Query zmiana zrobiona w jednym
 * miejscu jest natychmiast widoczna w drugim. Dwie kopie tego samego selecta
 * skończyłyby się dwiema różnymi prawdami na dwóch ekranach — a to jest
 * dokładnie ta klasa usterek, którą naprawiamy w tym module.
 */
export function WyborPlanuRozliczen({
  driverId,
  fleetId,
  rozmiar = 'normalny',
  onZmieniono,
}: {
  driverId: string;
  fleetId?: string | null;
  /** 'maly' — wersja do popovera, 'normalny' — do karty kierowcy. */
  rozmiar?: 'maly' | 'normalny';
  onZmieniono?: () => void;
}) {
  const { data: plany, isLoading: ladujePlany, error: bladPlanow } = usePlanyRozliczen(fleetId);
  const { data: planId, isLoading: ladujePlan } = usePlanKierowcy(driverId);
  const ustawPlan = useUstawPlanKierowcy();

  const wysokosc = rozmiar === 'maly' ? 'h-7 text-xs' : 'h-8 text-xs';

  if (bladPlanow) {
    return <span className="text-[11px] text-destructive">Nie udało się wczytać planów rozliczeń</span>;
  }

  if (ladujePlany || ladujePlan) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" /> Wczytywanie planów…
      </span>
    );
  }

  if (!plany || plany.length === 0) {
    // Zanim migracja planów zostanie wykonana, nie udajemy, że jest z czego wybierać.
    return (
      <span className="text-[11px] text-muted-foreground">
        Brak planów rozliczeń — dodaj je w „Ustawienia rozliczeń → Plany rozliczeń".
      </span>
    );
  }

  return (
    <Select
      value={planId ?? 'brak'}
      disabled={ustawPlan.isPending}
      onValueChange={(wartosc) => {
        const nowy = wartosc === 'brak' ? null : wartosc;
        ustawPlan.mutate(
          { driverId, planId: nowy },
          {
            onSuccess: () => {
              const nazwa = plany.find((p) => p.id === nowy)?.name;
              toast.success(nowy ? `Plan rozliczeń: ${nazwa}` : 'Plan rozliczeń zdjęty — liczymy po ustawieniach miasta');
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
          <span className="text-muted-foreground">Bez planu (stawki miasta)</span>
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
  );
}
