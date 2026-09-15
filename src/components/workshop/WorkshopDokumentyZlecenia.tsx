import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ChevronDown, ClipboardCheck, FileText, Loader2, Mail, Receipt } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { SimpleFreeInvoice } from '@/components/invoices/SimpleFreeInvoice';
import { InvoicePreviewModal } from '@/components/invoices/InvoicePreviewModal';
import { FiscalReceiptDialog } from '@/components/fiscal/FiscalReceiptDialog';
import { ExistingInvoiceModal } from './ExistingInvoiceModal';
import { zbudujDokumentZlecenia } from '@/utils/workshopOrderDocument';
import {
  przygotujFaktureZeZlecenia, znajdzFaktureZlecenia, type PrzygotowanaFaktura,
} from '@/lib/fakturaZeZlecenia';
import { dataSprzedazyZeZlecenia } from '@/lib/dataSprzedazy';

/**
 * WYSTAWIANIE DOKUMENTÓW DO ZLECEŃ — jedno zlecenie albo kilka naraz.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 🔴 SEDNO: PONOWNE WYDANIE TEJ SAMEJ FAKTURY, NIE NOWEJ
 * ═══════════════════════════════════════════════════════════════════════════
 * Klient dzwoni po fakturę do zlecenia sprzed pół roku — zgubił, potrzebuje do
 * księgowości. System ma ODNALEŹĆ ten dokument i wydać GO: ten sam numer, ta
 * sama treść, ta sama data. Nie wolno wystawić drugiego z nowym numerem, bo
 * to jest druga sprzedaż w księgach i drugi dokument w KSeF.
 *
 * Przy zaznaczeniu kilku zleceń ta zasada obowiązuje DLA KAŻDEGO OSOBNO:
 * system pyta `znajdzFaktureZlecenia` po kolei i dla części wydaje istniejącą,
 * dla reszty wystawia nową. Nie ma trybu „wystaw wszystkim nowe".
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * DLACZEGO KOLEJKA OKIEN, A NIE PĘTLA ZAPISUJĄCA W TLE
 * ═══════════════════════════════════════════════════════════════════════════
 * Nowa faktura powstaje w `SimpleFreeInvoice` — tam siedzi numeracja, dane
 * sprzedawcy, stawki VAT, zamrożenie po wysyłce do KSeF i zapis kontrahenta.
 * Druga, „zbiorcza" droga zapisu byłaby DRUGIM miejscem na te same decyzje
 * i rozjechałaby się przy pierwszej zmianie — dokładnie ta klasa błędu, którą
 * opisuje CLAUDE.md („ta sama wartość liczona w kilku miejscach”).
 *
 * Zbiorczo znaczy więc: TA SAMA droga, N razy pod rząd, z licznikiem „2 z 5".
 * Wydanie istniejącej faktury nie wymaga formularza i idzie od razu.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * CO ZOSTAJE, GDY COŚ PADNIE W POŁOWIE
 * ═══════════════════════════════════════════════════════════════════════════
 * Dokumenty wystawione do tej pory ZOSTAJĄ. Niczego nie wycofujemy: faktura
 * już zapisana jest dokumentem, a nie krokiem transakcji — jej wycofanie to
 * korekta, nie `ROLLBACK`. Podsumowanie mówi, przy którym zleceniu stanęło
 * i dlaczego.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * FAKTURA W KSEF — WYDANIE ISTNIEJĄCEJ NIE RUSZA REJESTRU
 * ═══════════════════════════════════════════════════════════════════════════
 * Ścieżka „istnieje" nie robi ŻADNEGO zapisu: otwiera `ExistingInvoiceModal`,
 * czyli podgląd, PDF i wysyłkę mailem. Numer KSeF, status i treść zostają
 * nietknięte. Ponowna wysyłka do KSeF jest osobnym, świadomym kliknięciem
 * wewnątrz tego okna.
 */

/**
 * Ile zleceń naraz.
 *
 * Dwadzieścia to tyle, ile warsztat jest w stanie przejrzeć w podsumowaniu
 * jednym spojrzeniem — a przy nowych fakturach tyle razy zobaczy formularz
 * i tyle razy może się wycofać. Sto zaznaczeń to sto dokumentów w KSeF,
 * z których każdy trzeba by potem korygować osobno; nikt nie zauważy pomyłki
 * w treści, zanim one pójdą.
 */
export const LIMIT_ZLECEN = 20;

interface PozycjaKolejki {
  zlecenie: any;
  /** Faktura, która JUŻ istnieje do tego zlecenia — albo `null`. */
  faktura: any | null;
}

interface Wynik {
  zlecenie: string;
  stan: 'wydana' | 'nowa' | 'blad' | 'pominiete';
  numer?: string | null;
  opis?: string;
}

export function WorkshopDokumentyZlecenia({
  providerId,
  zlecenia,
  onZmiana,
}: {
  providerId: string;
  /** Zaznaczone zlecenia. Pusta tablica = pozycje menu nieczynne. */
  zlecenia: any[];
  onZmiana?: () => void;
}) {
  const qc = useQueryClient();
  const [ladowanie, setLadowanie] = useState(false);

  // Kolejka faktur
  const [kolejka, setKolejka] = useState<PozycjaKolejki[] | null>(null);
  const [indeks, setIndeks] = useState(0);
  const [przygotowana, setPrzygotowana] = useState<PrzygotowanaFaktura | null>(null);

  // Kolejka potwierdzeń wykonania
  const [potwierdzenia, setPotwierdzenia] = useState<any[] | null>(null);
  const [indeksPotw, setIndeksPotw] = useState(0);

  const [paragonZlecenie, setParagonZlecenie] = useState<any | null>(null);

  const [wyniki, setWyniki] = useState<Wynik[]>([]);
  const [podsumowanie, setPodsumowanie] = useState(false);
  const [wysylka, setWysylka] = useState(false);

  /**
   * Faktury wydane w tej serii — do wysyłki zbiorczej z podsumowania.
   * `useRef`, bo to nie wpływa na widok: podsumowanie rysuje się z `wyniki`.
   */
  const wydane = useRef<Array<{ id: string; numer: string | null; zlecenie: string }>>([]);

  const ile = zlecenia.length;
  const brak = ile === 0;
  const zaDuzo = ile > LIMIT_ZLECEN;
  const numerZlecenia = (z: any) => z?.order_number ?? '(bez numeru)';

  const biezaca = kolejka && indeks < kolejka.length ? kolejka[indeks] : null;

  /**
   * Dane nowej faktury składamy dopiero, gdy do niej dojdziemy — jedno
   * zapytanie o pozycje na zlecenie, a nie dwadzieścia z góry (przy zleceniach
   * mających już fakturę żadne z nich nie byłoby potrzebne).
   */
  useEffect(() => {
    if (!biezaca || biezaca.faktura) return;
    let porzucone = false;
    setPrzygotowana(null);
    przygotujFaktureZeZlecenia(biezaca.zlecenie)
      .then((p) => { if (!porzucone) setPrzygotowana(p); })
      .catch(() => {
        if (porzucone) return;
        toast.error(`Nie udało się wczytać pozycji zlecenia ${numerZlecenia(biezaca.zlecenie)}.`);
        dalej({
          zlecenie: numerZlecenia(biezaca.zlecenie),
          stan: 'blad',
          opis: 'nie udało się wczytać pozycji zlecenia',
        });
      });
    return () => { porzucone = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [biezaca?.zlecenie?.id, biezaca?.faktura]);

  /** Zamknięcie bieżącej pozycji i przejście do następnej; na końcu — podsumowanie. */
  const dalej = (wynik: Wynik) => {
    setWyniki((p) => [...p, wynik]);
    setPrzygotowana(null);
    const nast = indeks + 1;
    if (!kolejka || nast >= kolejka.length) {
      setKolejka(null);
      setIndeks(0);
      setPodsumowanie(true);
      qc.invalidateQueries({ queryKey: ['fiscal-order-badges'] });
      qc.invalidateQueries({ queryKey: ['workshop-orders'] });
      onZmiana?.();
    } else {
      setIndeks(nast);
    }
  };

  // ── FAKTURY ───────────────────────────────────────────────────────────────
  const faktury = async () => {
    if (brak || zaDuzo) return;
    setLadowanie(true);
    try {
      // Rozpoznanie przed pierwszym oknem: warsztat ma od razu wiedzieć,
      // ile faktur wydamy ponownie, a ile trzeba będzie wystawić.
      const plan: PozycjaKolejki[] = [];
      for (const z of zlecenia) {
        plan.push({ zlecenie: z, faktura: await znajdzFaktureZlecenia(z.id) });
      }
      wydane.current = [];
      setWyniki([]);
      setIndeks(0);
      setKolejka(plan);
      const istniejace = plan.filter((p) => p.faktura).length;
      if (plan.length > 1) {
        toast.info(
          `${plan.length} zleceń: ${istniejace} z fakturą (wydamy tę samą), ` +
          `${plan.length - istniejace} do wystawienia.`,
        );
      }
    } catch (e: any) {
      toast.error('Nie udało się sprawdzić, które zlecenia mają już fakturę.');
    } finally {
      setLadowanie(false);
    }
  };

  // ── POTWIERDZENIA WYKONANIA ───────────────────────────────────────────────
  /**
   * Potwierdzenie wykonania usługi nie ma wiersza w bazie ani numeru z rejestru
   * — składamy je z danych zlecenia przy każdym otwarciu. Dlatego nie ma tu
   * czego „wydawać ponownie": każde otwarcie daje ten sam dokument.
   */
  const potwierdzeniaWykonania = async () => {
    if (brak || zaDuzo) return;
    setLadowanie(true);
    try {
      const gotowe: any[] = [];
      const bledy: Wynik[] = [];
      for (const z of zlecenia) {
        try {
          const dok = await zbudujDokumentZlecenia(z, 'service_confirmation');
          gotowe.push({ ...dok, __zlecenie: numerZlecenia(z) });
        } catch (e: any) {
          bledy.push({ zlecenie: numerZlecenia(z), stan: 'blad', opis: e?.message ?? 'nie udało się złożyć' });
        }
      }
      setWyniki(bledy);
      if (!gotowe.length) { setPodsumowanie(true); return; }
      setIndeksPotw(0);
      setPotwierdzenia(gotowe);
    } finally {
      setLadowanie(false);
    }
  };

  // ── WYSYŁKA ZBIORCZA ──────────────────────────────────────────────────────
  /**
   * Wysyłka idzie przez `send-invoice-email`, po jednej fakturze — zbiorcza
   * jest więc pętlą po tej samej funkcji, nie nową drogą. Adresata funkcja
   * ustala sama (nabywca z faktury, w ostateczności kartoteka po NIP-ie)
   * i przy jego braku odmawia; tę odmowę pokazujemy przy zleceniu.
   *
   * POBRANIE WSZYSTKICH JEDNYM KLIKNIĘCIEM — nie zrobione, świadomie.
   * PDF powstaje osobno dla każdej faktury (`/faktury/:id/pdf`), a archiwum
   * trzeba by złożyć po stronie serwera: to nowa funkcja brzegowa, generowanie
   * kilkunastu dokumentów w jednym żądaniu i miejsce na plik. Do czasu, aż
   * ktoś tego naprawdę potrzebuje, pojedynczy PDF pobiera się z podglądu.
   */
  const wyslijWszystkie = async () => {
    if (!wydane.current.length) return;
    setWysylka(true);
    let poszlo = 0;
    const nieposzlo: string[] = [];
    for (const f of wydane.current) {
      const { error } = await supabase.functions.invoke('send-invoice-email', {
        body: { invoice_id: f.id },
      });
      if (error) nieposzlo.push(f.zlecenie); else poszlo++;
    }
    setWysylka(false);
    if (poszlo) toast.success(`Wysłano ${poszlo} ${poszlo === 1 ? 'fakturę' : 'faktur'}.`);
    if (nieposzlo.length) {
      toast.error(`Nie wysłano: ${nieposzlo.join(', ')} — brak adresu nabywcy albo błąd poczty.`);
    }
  };

  const zamknijPodsumowanie = () => {
    setPodsumowanie(false);
    setWyniki([]);
  };

  const wydanych = wyniki.filter((w) => w.stan === 'wydana').length;
  const nowych = wyniki.filter((w) => w.stan === 'nowa').length;
  const bledow = wyniki.filter((w) => w.stan === 'blad').length;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="gap-1" disabled={ladowanie}>
            {ladowanie ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
            Wystaw{ile > 1 ? ` (${ile})` : ''} <ChevronDown className="h-3 w-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {/* Menu otwiera się zawsze — warsztat ma widzieć, że funkcja istnieje,
              zanim zaznaczy zlecenie. */}
          {brak && (
            <div className="px-2 py-1.5 text-xs text-muted-foreground max-w-[260px]">
              Zaznacz zlecenia, żeby wystawić do nich dokumenty.
            </div>
          )}
          {zaDuzo && (
            <div className="px-2 py-1.5 text-xs text-destructive max-w-[260px]">
              Zaznaczono {ile}. Naraz obsługujemy {LIMIT_ZLECEN} — tyle da się
              przejrzeć, zanim dokumenty pójdą do rejestru i do KSeF.
            </div>
          )}
          <DropdownMenuItem disabled={brak || zaDuzo} onClick={faktury}>
            <FileText className="h-4 w-4 mr-2" /> Faktura{ile > 1 ? ` — ${ile} zleceń` : ''}
          </DropdownMenuItem>
          <DropdownMenuItem disabled={brak || zaDuzo} onClick={potwierdzeniaWykonania}>
            <ClipboardCheck className="h-4 w-4 mr-2" />
            Potwierdzenie wykonania usługi{ile > 1 ? ` — ${ile}` : ''}
          </DropdownMenuItem>
          {/* PARAGON ZOSTAJE POJEDYNCZY. Drukuje się na urządzeniu fiskalnym,
              jeden po drugim, a wydruk jest nieodwracalny — pomyłka przy
              dwudziestu zaznaczeniach to dwadzieścia paragonów do zwrotu. */}
          <DropdownMenuItem disabled={ile !== 1} onClick={() => setParagonZlecenie(zlecenia[0])}>
            <Receipt className="h-4 w-4 mr-2" /> Paragon fiskalny
            {ile > 1 && <span className="ml-2 text-xs text-muted-foreground">(pojedynczo)</span>}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* ── FAKTURA JUŻ WYSTAWIONA: wydajemy TĘ SAMĄ, bez zapisu ────────── */}
      {biezaca?.faktura && (
        <ExistingInvoiceModal
          open
          onOpenChange={(v) => {
            if (v) return;
            wydane.current.push({
              id: biezaca.faktura.id,
              numer: biezaca.faktura.invoice_number,
              zlecenie: numerZlecenia(biezaca.zlecenie),
            });
            dalej({
              zlecenie: numerZlecenia(biezaca.zlecenie),
              stan: 'wydana',
              numer: biezaca.faktura.invoice_number,
            });
          }}
          invoice={biezaca.faktura}
          orderNumber={biezaca.zlecenie.order_number}
          onChanged={() => onZmiana?.()}
        />
      )}

      {/* ── NOWA FAKTURA: ta sama droga co przy pojedynczym zleceniu ────── */}
      {biezaca && !biezaca.faktura && przygotowana && (
        <Dialog
          open
          onOpenChange={(v) => {
            if (v) return;
            dalej({
              zlecenie: numerZlecenia(biezaca.zlecenie),
              stan: 'pominiete',
              opis: 'zamknięte bez wystawienia',
            });
          }}
        >
          <DialogContent className="max-w-6xl max-h-[95vh] overflow-y-auto p-0">
            <DialogTitle className="sr-only">
              Wystaw fakturę — {numerZlecenia(biezaca.zlecenie)}
              {kolejka && kolejka.length > 1 ? ` (${indeks + 1} z ${kolejka.length})` : ''}
            </DialogTitle>
            {kolejka && kolejka.length > 1 && (
              <div className="px-4 pt-3 text-sm text-muted-foreground">
                Zlecenie {indeks + 1} z {kolejka.length} — {numerZlecenia(biezaca.zlecenie)}
              </div>
            )}
            <SimpleFreeInvoice
              onClose={() => dalej({
                zlecenie: numerZlecenia(biezaca.zlecenie),
                stan: 'pominiete',
                opis: 'zamknięte bez wystawienia',
              })}
              onSaved={async () => {
                // Numer i identyfikator CZYTAMY Z BAZY: nadaje je zapis, nie
                // formularz. Ten sam odczyt, którym sprawdzaliśmy istnienie —
                // więc podsumowanie pokazuje numer, który naprawdę powstał.
                const zapisana = await znajdzFaktureZlecenia(biezaca.zlecenie.id);
                if (zapisana) {
                  wydane.current.push({
                    id: zapisana.id,
                    numer: zapisana.invoice_number,
                    zlecenie: numerZlecenia(biezaca.zlecenie),
                  });
                }
                dalej({
                  zlecenie: numerZlecenia(biezaca.zlecenie),
                  stan: 'nowa',
                  numer: zapisana?.invoice_number ?? null,
                });
              }}
              prefillItems={przygotowana.pozycje}
              prefillBuyer={przygotowana.nabywca}
              prefillVehicleNotes={przygotowana.uwagiPojazd}
              prefillOrderNotes={przygotowana.uwagiZlecenie}
              prefillOrderNumber={biezaca.zlecenie.order_number}
              prefillWorkshopOrderId={biezaca.zlecenie.id}
              /* Data sprzedaży = dzień wykonania usługi — patrz
                 `dataSprzedazyZeZlecenia`, tam siedzi uzasadnienie. */
              prefillSaleDate={dataSprzedazyZeZlecenia(biezaca.zlecenie)}
            />
          </DialogContent>
        </Dialog>
      )}

      {/* ── POTWIERDZENIA: jedno po drugim, bez formularza ──────────────── */}
      {potwierdzenia && potwierdzenia[indeksPotw] && (
        <InvoicePreviewModal
          open
          onOpenChange={(v) => {
            if (v) return;
            setWyniki((p) => [...p, {
              zlecenie: potwierdzenia[indeksPotw].__zlecenie,
              stan: 'nowa',
              numer: 'potwierdzenie wykonania',
            }]);
            const nast = indeksPotw + 1;
            if (nast >= potwierdzenia.length) {
              setPotwierdzenia(null);
              setPodsumowanie(true);
            } else {
              setIndeksPotw(nast);
            }
          }}
          invoiceData={potwierdzenia[indeksPotw]}
          isLoggedIn
          mode="document"
          titleLabel={
            potwierdzenia.length > 1
              ? `Potwierdzenie wykonania usługi (${indeksPotw + 1} z ${potwierdzenia.length})`
              : 'Potwierdzenie wykonania usługi'
          }
        />
      )}

      {/* ── PODSUMOWANIE ────────────────────────────────────────────────── */}
      <Dialog open={podsumowanie} onOpenChange={(v) => { if (!v) zamknijPodsumowanie(); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Gotowe</DialogTitle>
            <DialogDescription>
              {wydanych} wydanych ponownie, {nowych} nowych
              {bledow > 0 && `, ${bledow} z błędem`}
            </DialogDescription>
          </DialogHeader>
          <ul className="space-y-1.5 text-sm max-h-[50vh] overflow-y-auto">
            {wyniki.map((w, i) => (
              <li key={i} className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{w.zlecenie}</span>
                {w.stan === 'wydana' && <Badge variant="secondary">wydana ponownie {w.numer}</Badge>}
                {w.stan === 'nowa' && <Badge>{w.numer ?? 'wystawiona'}</Badge>}
                {w.stan === 'pominiete' && <span className="text-muted-foreground">pominięte — {w.opis}</span>}
                {w.stan === 'blad' && <span className="text-destructive">błąd — {w.opis}</span>}
              </li>
            ))}
          </ul>
          {wydane.current.length > 0 && (
            <>
              <Button variant="outline" onClick={wyslijWszystkie} disabled={wysylka} className="gap-2">
                {wysylka ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                Wyślij {wydane.current.length === 1 ? 'mailem' : `wszystkie mailem (${wydane.current.length})`}
              </Button>
              <p className="text-xs text-muted-foreground">
                Pobranie wszystkich jednym plikiem nie jest zrobione — każdy PDF powstaje
                osobno, a spakowanie ich wymaga nowej funkcji po stronie serwera.
                Pojedynczy pobierzesz z podglądu faktury.
              </p>
            </>
          )}
        </DialogContent>
      </Dialog>

      <FiscalReceiptDialog
        open={!!paragonZlecenie}
        onOpenChange={(v) => { if (!v) setParagonZlecenie(null); }}
        providerId={providerId}
        order={paragonZlecenie}
        onIssueInvoice={() => {
          // Skrót z paragonu powyżej 450 zł — firma potrzebuje pełnej faktury.
          setParagonZlecenie(null);
          void faktury();
        }}
      />
    </>
  );
}
