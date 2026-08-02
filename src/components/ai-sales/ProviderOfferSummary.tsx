import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Building2, Clock, MapPin, Loader2, Wrench, ExternalLink } from 'lucide-react';
import { useProviderOffer, formatServicePrice } from '@/hooks/useProviderOffer';

/**
 * Podgląd (tylko do odczytu) danych, z których agent korzysta w rozmowie:
 * firma, godziny pracy i cennik usług z zakładki „Moje usługi".
 * Nie duplikujemy tych pól w konfiguracji agenta — edycja jest w jednym miejscu.
 */
export function ProviderOfferSummary({
  providerId,
  onGoToServices,
}: {
  providerId: string | null;
  onGoToServices?: () => void;
}) {
  const { data, isLoading } = useProviderOffer(providerId);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" /> Dane firmy i cennik agenta
            </CardTitle>
            <CardDescription>
              Agent bierze te dane na żywo z zakładki „Moje usługi". Zmieniasz je tam — agent od razu mówi nowe ceny.
            </CardDescription>
          </div>
          {onGoToServices && (
            <Button variant="outline" size="sm" className="shrink-0 gap-1.5" onClick={onGoToServices}>
              <ExternalLink className="h-4 w-4" /> Edytuj w „Moje usługi"
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        ) : (
          <>
            <div className="grid gap-2 sm:grid-cols-2 text-sm">
              <div className="flex items-start gap-2">
                <Building2 className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                <span>{data?.company?.company_name || <span className="text-muted-foreground">Brak nazwy firmy</span>}</span>
              </div>
              <div className="flex items-start gap-2">
                <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                <span>{data?.company?.location || <span className="text-muted-foreground">Brak adresu</span>}</span>
              </div>
              <div className="flex items-start gap-2 sm:col-span-2">
                <Clock className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                <span>
                  {data?.hoursText || (
                    <span className="text-muted-foreground">
                      Brak godzin pracy — ustaw je w „Moje usługi", inaczej agent nie poda godzin otwarcia.
                    </span>
                  )}
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Wrench className="h-4 w-4 text-muted-foreground" />
                Usługi i ceny
                <Badge variant="secondary" className="font-normal">{data?.services.length ?? 0}</Badge>
              </div>
              {data?.services.length ? (
                <div className="rounded-lg border divide-y max-h-64 overflow-y-auto">
                  {data.services.map((s) => (
                    <div key={s.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                      <div className="min-w-0">
                        <div className="truncate">{s.name}</div>
                        {s.category && <div className="text-xs text-muted-foreground truncate">{s.category}</div>}
                      </div>
                      <span className="shrink-0 tabular-nums text-muted-foreground">{formatServicePrice(s)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Nie masz jeszcze usług. Dodaj je w „Moje usługi" — bez cennika agent nie poda klientowi cen.
                </p>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
