import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CreditCard, Loader2, ExternalLink } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useSubscriptionDetails } from '@/hooks/useSubscriptionDetails';
import { formatMoneyPLN } from '@/utils/formatters';

/**
 * „Twój plan" — jedno miejsce, w którym klient widzi, za co płaci (4.8).
 *
 * Zarządzanie kartą i anulowanie oddajemy do portalu Stripe. Zbudowanie tego
 * u siebie oznaczałoby przyjmowanie numerów kart na naszej stronie, a to
 * zupełnie inna klasa obowiązków niż wszystko, co dziś robimy.
 */
const OPISY_STATUSU: Record<string, { etykieta: string; wariant: 'default' | 'secondary' | 'destructive' }> = {
  active: { etykieta: 'Aktywny', wariant: 'default' },
  trialing: { etykieta: 'Okres próbny', wariant: 'secondary' },
  past_due: { etykieta: 'Płatność nieudana', wariant: 'destructive' },
  read_only: { etykieta: 'Tryb odczytu', wariant: 'destructive' },
  canceled: { etykieta: 'Anulowany', wariant: 'destructive' },
  expired: { etykieta: 'Wygasł', wariant: 'destructive' },
};

const dzien = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' }) : null;

export function SubscriptionCard({ providerId }: { providerId: string | null | undefined }) {
  const { data, isLoading } = useSubscriptionDetails(providerId);
  const [otwieranie, setOtwieranie] = useState(false);

  const otworzPortal = async () => {
    if (otwieranie) return;
    // Kartę otwieramy SYNCHRONICZNIE, przed zapytaniem: przeglądarka blokuje
    // `window.open` wywołane po `await`, bo nie widzi już gestu użytkownika.
    const karta = window.open('', '_blank');
    setOtwieranie(true);
    try {
      const { data: odp, error } = await supabase.functions.invoke('billing-portal', { body: {} });
      if (error) throw error;
      if (odp?.error) throw new Error(odp.error);
      if (!odp?.url) throw new Error('Nie udało się otworzyć portalu płatności.');
      if (karta) karta.location.href = odp.url;
      else window.location.href = odp.url;
    } catch (e) {
      karta?.close();
      toast.error(e instanceof Error ? e.message : 'Nie udało się otworzyć portalu płatności.');
    } finally {
      setOtwieranie(false);
    }
  };

  if (isLoading || !providerId) return null;

  // Bez subskrypcji nie pokazujemy pustej karty z myślnikami — kierujemy do
  // cennika, bo to jedyne sensowne następne działanie.
  if (!data) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <CreditCard className="h-4 w-4" /> Twój plan
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Nie masz jeszcze wykupionego planu.
          </p>
          <Button variant="outline" size="sm" onClick={() => { window.location.href = '/cennik'; }}>
            Zobacz plany
          </Button>
        </CardContent>
      </Card>
    );
  }

  const status = OPISY_STATUSU[data.status ?? ''] ?? { etykieta: data.status ?? '—', wariant: 'secondary' as const };
  const odnowienie = dzien(data.odnowienie);
  const gwarancja = dzien(data.gwarancjaCenyDo);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <CreditCard className="h-4 w-4" /> Twój plan
          </span>
          <Badge variant={status.wariant}>{status.etykieta}</Badge>
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-muted-foreground">Plan</p>
            <p className="font-medium">{data.nazwaPlanu ?? '—'}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Cena</p>
            <p className="font-medium">
              {data.cenaNetto != null ? `${formatMoneyPLN(data.cenaNetto)} netto / mies.` : '—'}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">
              {data.status === 'canceled' || data.status === 'expired' ? 'Koniec dostępu' : 'Odnowienie'}
            </p>
            <p className="font-medium">{odnowienie ?? '—'}</p>
          </div>
          {gwarancja && (
            <div>
              <p className="text-muted-foreground">Cena gwarantowana do</p>
              {/* To jest powód, dla którego klient nie zwleka z zakupem —
                  więc data ma być widoczna, a nie schowana w regulaminie. */}
              <p className="font-medium">{gwarancja}</p>
            </div>
          )}
        </div>

        {data.maPlatnosci ? (
          <Button variant="outline" size="sm" disabled={otwieranie} onClick={otworzPortal}>
            {otwieranie ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <ExternalLink className="h-4 w-4 mr-2" />}
            Zarządzaj płatnościami
          </Button>
        ) : (
          <p className="text-xs text-muted-foreground">
            Zarządzanie kartą i historia faktur pojawią się po pierwszej płatności.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
