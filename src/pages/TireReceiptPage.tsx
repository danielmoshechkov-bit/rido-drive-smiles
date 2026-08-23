import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, Printer, CheckCircle2, MapPin, Phone } from 'lucide-react';

const dt = (v?: string | null) =>
  v ? new Date(v).toLocaleDateString('pl-PL') : '—';
const dtg = (v?: string | null) =>
  v ? new Date(v).toLocaleString('pl-PL', { dateStyle: 'long', timeStyle: 'short' }) : '—';

function Wiersz({ etykieta, wartosc }: { etykieta: string; wartosc?: string | number | null }) {
  if (wartosc === null || wartosc === undefined || wartosc === '') return null;
  return (
    <div className="flex justify-between gap-4 py-2 border-b last:border-0">
      <span className="text-sm text-muted-foreground">{etykieta}</span>
      <span className="text-sm font-medium text-right">{wartosc}</span>
    </div>
  );
}

/**
 * Potwierdzenie przyjecia opon — strona dla klienta, bez logowania.
 *
 * Czyta kopie zamrozona przy przyjeciu, nie biezacy wpis warsztatu. Dzieki
 * temu link dziala takze wtedy, gdy warsztat skasuje komplet u siebie.
 */
export default function TireReceiptPage() {
  const { kod } = useParams<{ kod: string }>();
  const [ladowanie, setLadowanie] = useState(true);
  const [blad, setBlad] = useState<string | null>(null);
  const [potwierdzenie, setPotwierdzenie] = useState<any>(null);

  useEffect(() => {
    let anulowane = false;
    const przerwij = new AbortController();
    // Strona publiczna nie ma po co pytac o sesje. `functions.invoke` robi to
    // przed kazdym wywolaniem i potrafi zawisnac w przegladarce otwartej
    // z wiadomosci (ograniczony dostep do pamieci) — wtedy zostaje samo
    // krecace sie kolko. Zwykly fetch nie ma tego problemu.
    const limitCzasu = setTimeout(() => przerwij.abort(), 15000);

    (async () => {
      setLadowanie(true);
      setBlad(null);
      try {
        const odp = await fetch(
          `https://wclrrytmrscqvsyxyvnn.supabase.co/functions/v1/tire-receipt?kod=${encodeURIComponent(kod ?? '')}`,
          { signal: przerwij.signal },
        );
        const dane = await odp.json().catch(() => null);
        if (anulowane) return;

        if (!odp.ok || dane?.error) {
          setBlad(odp.status === 404 || dane?.error === 'NIE_ZNALEZIONO'
            ? 'Nie znaleźliśmy takiego potwierdzenia. Sprawdź, czy link jest pełny.'
            : 'Ten link jest nieprawidłowy.');
        } else {
          setPotwierdzenie(dane);
        }
      } catch (e) {
        if (anulowane) return;
        setBlad((e as Error)?.name === 'AbortError'
          ? 'Potwierdzenie nie wczytało się w rozsądnym czasie. Odśwież stronę.'
          : 'Nie udało się wczytać potwierdzenia. Spróbuj za chwilę.');
      } finally {
        clearTimeout(limitCzasu);
        if (!anulowane) setLadowanie(false);
      }
    })();

    return () => { anulowane = true; clearTimeout(limitCzasu); przerwij.abort(); };
  }, [kod]);

  if (ladowanie) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (blad || !potwierdzenie) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-subtle">
        <Card className="max-w-md w-full">
          <CardContent className="py-10 text-center space-y-2">
            <p className="font-medium">{blad ?? 'Nie znaleźliśmy potwierdzenia.'}</p>
            <p className="text-sm text-muted-foreground">
              Jeśli link pochodzi z SMS-a, otwórz go w całości — czasem wiadomość
              dzieli się na dwie części.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const d = potwierdzenie.dane ?? {};
  const odebrane = !!potwierdzenie.odebrano_at;
  const adres = [d.ulica, d.miasto].filter(Boolean).join(', ');
  const auto = [d.pojazd, d.rejestracja].filter(Boolean).join(' · ');

  return (
    <div className="min-h-screen bg-gradient-subtle py-6 px-4 print:bg-white print:py-0">
      <div className="max-w-lg mx-auto space-y-4">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle className="text-lg">Potwierdzenie przechowania opon</CardTitle>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {d.warsztat || 'Warsztat'}
                </p>
              </div>
              {odebrane ? (
                <Badge className="gap-1 bg-emerald-600 hover:bg-emerald-600 shrink-0">
                  <CheckCircle2 className="h-3 w-3" /> Odebrane
                </Badge>
              ) : (
                <Badge variant="secondary" className="shrink-0">W przechowaniu</Badge>
              )}
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            {odebrane && (
              <div className="rounded-lg border border-emerald-600/30 bg-emerald-50 dark:bg-emerald-950/30 p-3">
                <p className="text-sm font-medium text-emerald-800 dark:text-emerald-300">
                  Opony odebrane
                </p>
                <p className="text-sm text-emerald-700 dark:text-emerald-400">
                  {dtg(potwierdzenie.odebrano_at)}
                </p>
              </div>
            )}

            <div>
              <Wiersz etykieta="Numer" wartosc={d.numer} />
              <Wiersz etykieta="Klient" wartosc={d.klient} />
              <Wiersz etykieta="Pojazd" wartosc={auto} />
              <Wiersz etykieta="Opony" wartosc={d.marka_opon} />
              <Wiersz etykieta="Rozmiar" wartosc={d.rozmiar} />
              <Wiersz etykieta="Sztuk" wartosc={d.sztuk} />
              <Wiersz etykieta="Sezon" wartosc={d.sezon} />
              <Wiersz etykieta="Felgi" wartosc={d.felgi || 'bez felg'} />
              <Wiersz etykieta="Przyjęto" wartosc={dt(d.przyjeto)} />
              {!odebrane && <Wiersz etykieta="Termin odbioru" wartosc={dt(d.termin)} />}
            </div>

            {(adres || d.telefon) && (
              <div className="rounded-lg border p-3 space-y-1.5">
                {adres && (
                  <p className="text-sm flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
                    {adres}
                  </p>
                )}
                {d.telefon && (
                  <p className="text-sm flex items-center gap-2">
                    <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
                    <a href={`tel:${d.telefon}`} className="text-primary hover:underline">
                      {d.telefon}
                    </a>
                  </p>
                )}
              </div>
            )}

            <Button
              variant="outline"
              className="w-full print:hidden"
              onClick={() => window.print()}
            >
              <Printer className="h-4 w-4 mr-2" /> Zapisz jako PDF lub wydrukuj
            </Button>

            <p className="text-[11px] text-muted-foreground text-center">
              Kod potwierdzenia: <span className="font-mono">{potwierdzenie.kod}</span>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
