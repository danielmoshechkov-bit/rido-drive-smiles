import { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Sparkles, Send, Paperclip, X, Loader2, ExternalLink, FileText } from 'lucide-react';
import { useOdswiezJednostki } from '@/hooks/useDostepneJednostki';
import { CECHA_RIDO_AI } from '@/lib/ridoAi';

/**
 * Pomoc RIDO AI — rozmowa o naprawie KONKRETNEGO auta.
 *
 * Wątek jest przypisany do zlecenia, nie do użytkownika: mechanik zamyka okno,
 * wraca po godzinie i ma całą rozmowę. Danych auta nie trzeba podawać — bierze
 * je funkcja `rido-help` prosto ze zlecenia.
 */
interface Zrodlo { tytul: string; url: string }
interface Wiadomosc {
  rola: 'czlowiek' | 'rido';
  tresc: string;
  zrodla?: Zrodlo[];
  zalaczniki?: number;
  czas?: string;
}
interface Zalacznik { typ: 'obraz' | 'pdf'; dane: string; mime: string; nazwa: string }

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string;
  /** Do nagłówka — żeby było widać, o którym aucie rozmawiamy. */
  opisPojazdu?: string;
}

/** 8 MB na plik. Powyżej odpowiedź modelu i tak nie jest lepsza, a request puchnie. */
const LIMIT_BAJTOW = 8 * 1024 * 1024;

async function naBase64(plik: File): Promise<string> {
  const bufor = await plik.arrayBuffer();
  let binarnie = '';
  const bajty = new Uint8Array(bufor);
  // Po kawałku: `String.fromCharCode(...tablica)` przy kilku megabajtach
  // przekracza limit argumentów i wywala się na dużym zdjęciu.
  for (let i = 0; i < bajty.length; i += 8192) {
    binarnie += String.fromCharCode(...bajty.subarray(i, i + 8192));
  }
  return btoa(binarnie);
}

export function WorkshopRidoHelpPanel({ open, onOpenChange, orderId, opisPojazdu }: Props) {
  const [wiadomosci, setWiadomosci] = useState<Wiadomosc[]>([]);
  const [tekst, setTekst] = useState('');
  const [zalaczniki, setZalaczniki] = useState<Zalacznik[]>([]);
  const [wysylanie, setWysylanie] = useState(false);
  const [wczytywanie, setWczytywanie] = useState(false);
  const [nadPolem, setNadPolem] = useState(false);
  const konicRef = useRef<HTMLDivElement | null>(null);
  const plikRef = useRef<HTMLInputElement | null>(null);
  const odswiez = useOdswiezJednostki();

  // Wątek wczytujemy przy każdym otwarciu — mechanik mógł pytać z innego
  // urządzenia albo ktoś inny z warsztatu prowadził rozmowę.
  useEffect(() => {
    if (!open || !orderId) return;
    let anulowane = false;
    setWczytywanie(true);
    (async () => {
      const { data } = await (supabase as any)
        .from('warsztat_pomoc_ai')
        .select('wiadomosci')
        .eq('order_id', orderId)
        .maybeSingle();
      if (anulowane) return;
      setWiadomosci(Array.isArray(data?.wiadomosci) ? data.wiadomosci : []);
      setWczytywanie(false);
    })();
    return () => { anulowane = true; };
  }, [open, orderId]);

  useEffect(() => {
    konicRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [wiadomosci, wysylanie]);

  const dodajPliki = async (pliki: FileList | File[]) => {
    const nowe: Zalacznik[] = [];
    for (const plik of Array.from(pliki).slice(0, 4)) {
      if (plik.size > LIMIT_BAJTOW) {
        toast.error(`${plik.name} jest za duży (limit 8 MB)`);
        continue;
      }
      const obraz = plik.type.startsWith('image/');
      const pdf = plik.type === 'application/pdf';
      if (!obraz && !pdf) {
        toast.error(`${plik.name}: obsługujemy zdjęcia i PDF`);
        continue;
      }
      nowe.push({
        typ: obraz ? 'obraz' : 'pdf',
        dane: await naBase64(plik),
        mime: plik.type,
        nazwa: plik.name,
      });
    }
    if (nowe.length) setZalaczniki((p) => [...p, ...nowe].slice(0, 4));
  };

  const wyslij = async () => {
    const pytanie = tekst.trim();
    if (!pytanie || wysylanie) return;

    setWysylanie(true);
    // Pytanie pokazujemy OD RAZU — czekanie na odpowiedź trwa kilkanaście sekund
    // (model przeszukuje internet) i pusty ekran wyglądałby na zacięcie.
    setWiadomosci((p) => [...p, { rola: 'czlowiek', tresc: pytanie, zalaczniki: zalaczniki.length }]);
    setTekst('');
    const wyslaneZalaczniki = zalaczniki;
    setZalaczniki([]);

    try {
      const { data, error } = await supabase.functions.invoke('rido-help', {
        body: { orderId, pytanie, zalaczniki: wyslaneZalaczniki },
      });

      const blad = (data as any)?.error;
      if (error || blad) {
        const komunikat = (data as any)?.message || 'Nie udało się zapytać Rido AI';
        toast.error(komunikat, { duration: 8000 });
        // Cofamy pokazane pytanie — nie zostało zapisane po stronie serwera.
        setWiadomosci((p) => p.slice(0, -1));
        setTekst(pytanie);
        setZalaczniki(wyslaneZalaczniki);
        return;
      }

      setWiadomosci((p) => [...p, {
        rola: 'rido',
        tresc: (data as any).odpowiedz,
        zrodla: (data as any).zrodla || [],
      }]);
      odswiez(CECHA_RIDO_AI);
    } finally {
      setWysylanie(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl h-[85vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-5 py-3 border-b shrink-0">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-5 w-5 text-primary" /> Pomoc RIDO AI
          </DialogTitle>
          {opisPojazdu && (
            <p className="text-xs text-muted-foreground text-left">{opisPojazdu}</p>
          )}
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {wczytywanie && (
            <p className="text-sm text-muted-foreground text-center">Wczytuję rozmowę…</p>
          )}

          {!wczytywanie && wiadomosci.length === 0 && (
            <div className="text-sm text-muted-foreground space-y-2 py-6">
              <p className="font-medium text-foreground">Opisz objaw — resztę wiem ze zlecenia.</p>
              <p>
                Markę, model, rocznik, silnik i VIN biorę z karty zlecenia, więc nie
                musisz ich podawać. Możesz dorzucić zdjęcie albo PDF.
              </p>
              <p>
                Szukam w internecie: na forach markowych, w biuletynach serwisowych
                i filmach. Podaję tylko te linki, które naprawdę otworzyłem.
              </p>
            </div>
          )}

          {wiadomosci.map((w, i) => (
            <div key={i} className={w.rola === 'czlowiek' ? 'flex justify-end' : ''}>
              <div className={`rounded-lg px-4 py-3 max-w-[85%] text-sm whitespace-pre-wrap ${
                w.rola === 'czlowiek' ? 'bg-primary text-primary-foreground' : 'bg-muted'
              }`}>
                {w.tresc}
                {!!w.zalaczniki && (
                  <p className="text-xs opacity-70 mt-1">
                    załączniki: {w.zalaczniki}
                  </p>
                )}
                {!!w.zrodla?.length && (
                  <div className="mt-3 pt-3 border-t border-border/60 space-y-1">
                    <p className="text-xs font-medium">Źródła:</p>
                    {w.zrodla.map((z, j) => (
                      <a
                        key={j}
                        href={z.url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="flex items-start gap-1.5 text-xs text-primary hover:underline"
                      >
                        <ExternalLink className="h-3 w-3 mt-0.5 shrink-0" />
                        <span className="truncate">{z.tytul}</span>
                      </a>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}

          {wysylanie && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Szukam w internecie i składam odpowiedź…
            </div>
          )}
          <div ref={konicRef} />
        </div>

        {/* Pole pisania — przeciągnij plik albo dodaj spinaczem. */}
        <div
          className={`border-t px-5 py-3 shrink-0 space-y-2 ${nadPolem ? 'bg-primary/5' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setNadPolem(true); }}
          onDragLeave={() => setNadPolem(false)}
          onDrop={(e) => {
            e.preventDefault();
            setNadPolem(false);
            if (e.dataTransfer.files?.length) void dodajPliki(e.dataTransfer.files);
          }}
        >
          {zalaczniki.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {zalaczniki.map((z, i) => (
                <span key={i} className="flex items-center gap-1 text-xs bg-muted rounded px-2 py-1">
                  <FileText className="h-3 w-3" />
                  <span className="max-w-[160px] truncate">{z.nazwa}</span>
                  <button
                    type="button"
                    onClick={() => setZalaczniki((p) => p.filter((_, j) => j !== i))}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}

          <div className="flex items-end gap-2">
            <input
              ref={plikRef}
              type="file"
              accept="image/*,application/pdf"
              multiple
              className="hidden"
              onChange={(e) => { if (e.target.files) void dodajPliki(e.target.files); e.target.value = ''; }}
            />
            <Button
              variant="outline"
              size="icon"
              className="shrink-0"
              title="Dodaj zdjęcie albo PDF"
              onClick={() => plikRef.current?.click()}
            >
              <Paperclip className="h-4 w-4" />
            </Button>

            <Textarea
              value={tekst}
              onChange={(e) => setTekst(e.target.value)}
              onKeyDown={(e) => {
                // Enter wysyła, Shift+Enter robi nową linijkę — jak w komunikatorze.
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void wyslij(); }
              }}
              placeholder="Opisz objaw — np. „stuka przy skręcaniu w lewo na małych prędkościach”"
              className="min-h-[44px] max-h-32 resize-none"
            />

            <Button
              size="icon"
              className="shrink-0"
              disabled={!tekst.trim() || wysylanie}
              onClick={() => void wyslij()}
            >
              {wysylanie ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>

          <p className="text-[11px] text-muted-foreground">
            Jedno pytanie zdejmuje jedną jednostkę z puli Rido AI. Możesz przeciągnąć plik na to pole.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
