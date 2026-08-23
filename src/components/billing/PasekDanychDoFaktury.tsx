import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FileText } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { useSubscriptionDetails } from '@/hooks/useSubscriptionDetails';
import { DaneDoFaktury } from './DaneDoFaktury';

/**
 * Prośba o dane do faktury — POKAZYWANA DOPIERO PRZY KOŃCU OKRESU PRÓBNEGO.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * DLACZEGO NIE OD RAZU PO REJESTRACJI
 * ═══════════════════════════════════════════════════════════════════════════
 * Klient w drugim dniu okresu próbnego nie ma powodu podawać NIP-u i pytanie
 * go o to wygląda na zbieranie danych bez celu — a od dostawcy, od którego
 * nigdy nie dostał faktury, wygląda podejrzanie.
 *
 * Przy siedmiu dniach do końca „uzupełnij dane do faktury" jest ZAPOWIEDZIĄ
 * ZAKUPU, nie zaczepką. Ten sam próg, przy którym i tak wychodzi ostrzeżenie
 * o kończącym się okresie, więc klient dostaje jedną spójną wiadomość zamiast
 * dwóch przy różnych okazjach.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * CZEGO TEN PASEK NIE ROBI
 * ═══════════════════════════════════════════════════════════════════════════
 * Nie blokuje niczego i nie da się przez niego kupić. Zbiera wyłącznie dane,
 * żeby w chwili zakupu klient przeszedł krok „Dane do faktury" jednym
 * kliknięciem. Bez nich zakup i tak się nie zacznie — ale dowiedzenie się
 * o tym dopiero przy płatności jest gorsze niż zapytanie tydzień wcześniej.
 */

/** Ile dni przed końcem okresu próbnego zaczynamy prosić o dane. */
const PROG_DNI = 7;

/**
 * Dni do daty — z ZACHOWANIEM ZNAKU. Wersja obcinająca do zera kłamałaby:
 * na produkcji sześć okresów próbnych skończyło się 22–25 dni temu (konta
 * w trybie dokończenia), a pasek mówiłby im „kończy się dziś".
 */
const dniDo = (iso: string | null | undefined): number | null => {
  if (!iso) return null;
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
};

export function PasekDanychDoFaktury({ providerId }: { providerId: string | null | undefined }) {
  const [otwarte, setOtwarte] = useState(false);
  const qc = useQueryClient();
  const { data: szczegoly } = useSubscriptionDetails(providerId);

  const { data: komplet } = useQuery({
    queryKey: ['dane-nabywcy-kompletne', providerId],
    enabled: !!providerId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await supabase.rpc('billing_dane_nabywcy_kompletne', {
        p_provider_id: providerId as string,
      });
      return data === true;
    },
  });

  const dni = dniDo(szczegoly?.odnowienie);

  // Warunki są trzy i każdy musi być spełniony. Rozdzielone świadomie, bo
  // sklejone w jedno wyrażenie przestają dać się przeczytać przy pierwszej
  // zmianie progu.
  if (!providerId) return null;
  if (komplet !== false) return null;              // dane już są albo jeszcze nie wiemy
  if (dni === null || dni > PROG_DNI) return null;  // za wcześnie, żeby zawracać głowę

  // Odliczanie pokazujemy tylko wtedy, gdy jest co odliczać. Po wygaśnięciu
  // klient jest w trybie dokończenia albo za blokadą i wie o tym z paska nad
  // treścią — powtarzanie mu tego tutaj niczego nie wnosi, a licząc dni
  // wstecz brzmiałoby jak pomyłka systemu.
  const odliczamy = szczegoly?.status === 'trialing' && dni > 0;

  return (
    <>
      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <FileText className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <div>
              <p className="font-medium">
                {odliczamy
                  ? `Zostało ${dni === 1 ? 'ostatni dzień' : `${dni} dni`} okresu próbnego`
                  : 'Uzupełnij dane do faktury'}
              </p>
              <p className="text-sm text-muted-foreground">
                Wystawimy na nie fakturę przy zakupie. Zajmie minutę teraz —
                przy płatności wystarczy potwierdzić.
              </p>
            </div>
          </div>
          <Button className="shrink-0" onClick={() => setOtwarte(true)}>
            Uzupełnij dane
          </Button>
        </CardContent>
      </Card>

      <Dialog open={otwarte} onOpenChange={setOtwarte}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Dane do faktury</DialogTitle>
            <DialogDescription>
              Wystawimy na nie fakturę — poprawienie jej później wymaga korekty.
            </DialogDescription>
          </DialogHeader>
          <DaneDoFaktury
            providerId={providerId}
            onGotowe={() => {
              // Bez unieważnienia pasek zostałby na ekranie mimo uzupełnienia
              // — a to wygląda, jakby zapis nie zadziałał.
              qc.invalidateQueries({ queryKey: ['dane-nabywcy-kompletne'] });
              setOtwarte(false);
            }}
            onWstecz={() => setOtwarte(false)}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
