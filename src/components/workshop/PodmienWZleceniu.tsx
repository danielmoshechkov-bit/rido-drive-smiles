import { useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Search } from 'lucide-react';

/**
 * Wyszukiwarka „podmień to, co jest w zleceniu".
 *
 * PO CO: klient albo auto trafiały do zlecenia raz i zostawały. Gdy okazało się,
 * że to nie ten Kowalski albo nie to auto, jedyną drogą było zamknięcie okna
 * edycji i szukanie osobnego przycisku „Zmień" gdzie indziej na ekranie.
 * Warsztat najpierw klika w nazwisko albo w auto — i tam ma szukać.
 *
 * Dlatego to samo pole stoi teraz NA GÓRZE obu okien edycji: wpisujesz od
 * drugiego znaku, dostajesz listę z bazy warsztatu i jednym kliknięciem
 * podmieniasz wpis w zleceniu. Bez tego pola okno pozwalało tylko POPRAWIĆ
 * dane, co jest czymś innym: poprawka zmienia kartotekę wszystkim zleceniom
 * tej osoby, a podmiana dotyczy wyłącznie tego jednego zlecenia.
 */
export interface WynikPodmiany {
  id: string;
  glowny: string;
  dodatkowy?: string;
}

interface Props {
  /** Etykieta nad polem — inna dla klienta, inna dla auta. */
  etykieta: string;
  placeholder: string;
  /** Wszystkie wpisy z bazy warsztatu, już pobrane przez rodzica. */
  wpisy: any[];
  /** Po czym szukamy w danym wpisie (nazwisko, telefon, rejestracja, VIN…). */
  pola: (wpis: any) => Array<string | null | undefined>;
  /** Jak pokazać znaleziony wpis na liście. */
  opis: (wpis: any) => WynikPodmiany;
  /** Który wpis siedzi w zleceniu teraz — nie ma sensu podmieniać go na siebie. */
  pomijaneId?: string;
  onWybierz: (wpis: any) => void;
}

export function PodmienWZleceniu({
  etykieta, placeholder, wpisy, pola, opis, pomijaneId, onWybierz,
}: Props) {
  const [szukaj, setSzukaj] = useState('');

  // OD DRUGIEGO ZNAKU. Przy jednej literze lista to prawie cała baza, więc
  // przewijanie jej jest wolniejsze niż dopisanie drugiej litery.
  const znalezione = useMemo(() => {
    const q = szukaj.trim().toLowerCase();
    if (q.length < 2) return [];
    return wpisy
      .filter((w) => w.id !== pomijaneId)
      .filter((w) => pola(w).filter(Boolean).some((v) => String(v).toLowerCase().includes(q)))
      .slice(0, 8);
  }, [szukaj, wpisy, pola, pomijaneId]);

  return (
    <div className="rounded-lg border border-dashed bg-muted/30 p-3 space-y-2">
      <p className="text-xs font-medium text-muted-foreground">{etykieta}</p>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={szukaj}
          onChange={(e) => setSzukaj(e.target.value)}
          onFocus={(e) => e.currentTarget.select()}
          placeholder={placeholder}
          className="pl-9 h-9"
        />
      </div>

      {szukaj.trim().length >= 2 && znalezione.length === 0 && (
        <p className="text-xs text-muted-foreground px-1">Nic nie znaleziono w bazie warsztatu.</p>
      )}

      {znalezione.length > 0 && (
        <div className="rounded-md border bg-background divide-y max-h-56 overflow-y-auto">
          {znalezione.map((w) => {
            const o = opis(w);
            return (
              <button
                key={o.id}
                type="button"
                className="w-full text-left px-3 py-2 hover:bg-accent transition-colors"
                onClick={() => { setSzukaj(''); onWybierz(w); }}
              >
                <span className="block text-sm font-medium truncate">{o.glowny}</span>
                {o.dodatkowy && (
                  <span className="block text-xs text-muted-foreground truncate">{o.dodatkowy}</span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
