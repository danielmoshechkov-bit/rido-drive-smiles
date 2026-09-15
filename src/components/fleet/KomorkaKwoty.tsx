import { memo, useEffect, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';

/**
 * Edytowalna kwota w tabeli rozliczeń (opłata, wynajem, składka ZUS…).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * POWÓD (14.09.2026) — dwie usterki, jedna przyczyna
 * ═══════════════════════════════════════════════════════════════════════════
 * 1. POLE GUBIŁO OGNISKO PO KAŻDYM ZNAKU. Wpisywany tekst trzymał stan
 *    `editValue` w `FleetSettlementsView` — komponencie na 4 tysiące linii,
 *    który przy każdej literze przerenderowywał całą tabelę razem z popoverami
 *    i podpowiedziami. Wystarczyło, że którykolwiek z tych elementów przejął
 *    ognisko, i kursor wyskakiwał z pola.
 *
 * 2. PO EDYCJI NIE DAŁO SIĘ KLIKNĄĆ W NASTĘPNE POLE. Zapis był `await`-owany
 *    w `commitEdit`, a kliknięcia w tym czasie lądowały w kolejce
 *    (`pendingEditRef`) i czekały na koniec zapisu i przeliczenia.
 *
 * Rozwiązanie: wpisywany tekst zostaje TUTAJ, w stanie lokalnym. Rodzic
 * dowiaduje się o zmianie raz — przy wyjściu z pola albo Enterze. Nic nie
 * blokuje otwarcia kolejnej komórki, bo zapis idzie w tle.
 *
 * `memo` z porównaniem po wartości: przerenderowanie rodzica nie dotyka pola,
 * w którym ktoś właśnie pisze.
 */
export interface KomorkaKwotyProps {
  /** Kierowca, którego dotyczy komórka — oddajemy go rodzicowi przy zapisie. */
  driverId: string;
  /** Nazwa pola ('service_fee', 'rental', 'additional_fee'…). */
  pole: string;
  /** Numer opłaty dodatkowej, gdy pole to 'additional_fee'. */
  indeks?: number;
  /** Kwota do pokazania, gdy pole nie jest w edycji. */
  wartosc: number;
  /** Czy kierowca w ogóle miał w tym tygodniu aktywność (steruje „-" vs „0,00"). */
  maAktywnosc: boolean;
  /** Czy wartość jest ręcznie nadpisana (podświetlenie). */
  nadpisana: boolean;
  /**
   * Wywoływane RAZ, przy wyjściu z pola lub Enterze, tylko gdy kwota się
   * zmieniła. Rodzic podaje TĘ SAMĄ funkcję przy każdym renderze (useCallback),
   * dzięki czemu `memo` niżej naprawdę odcina przerenderowania.
   */
  onZapisz: (driverId: string, pole: string, nowaWartosc: number, indeks?: number) => void;
  formatuj: (kwota: number) => string;
  parsuj: (tekst: string) => number;
}

function KomorkaKwotyBase({ driverId, pole, indeks, wartosc, maAktywnosc, nadpisana, onZapisz, formatuj, parsuj }: KomorkaKwotyProps) {
  const [wEdycji, setWEdycji] = useState(false);
  const [tekst, setTekst] = useState('');
  const polePrzedEdycja = useRef<number>(wartosc);

  useEffect(() => {
    // Gdy przeliczenie w tle zmieni kwotę, a pole nie jest edytowane, pokazujemy nową.
    if (!wEdycji) polePrzedEdycja.current = wartosc;
  }, [wartosc, wEdycji]);

  const zacznij = () => {
    polePrzedEdycja.current = wartosc;
    setTekst(wartosc !== 0 ? String(wartosc) : '');
    setWEdycji(true);
  };

  const zakoncz = (zapisz: boolean) => {
    setWEdycji(false);
    if (!zapisz) return;
    const nowa = parsuj(tekst);
    // Bez zmiany nie ruszamy bazy — inaczej samo wejście w pole i wyjście
    // z niego zapisywałoby „ręczne nadpisanie" tej samej kwoty.
    if (Math.abs(nowa - polePrzedEdycja.current) < 0.005) return;
    onZapisz(driverId, pole, nowa, indeks);
  };

  if (wEdycji) {
    return (
      <Input
        type="text"
        inputMode="decimal"
        value={tekst}
        onChange={(e) => setTekst(e.target.value.replace(/[^0-9.,-]/g, ''))}
        onBlur={() => zakoncz(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.currentTarget.blur(); }
          if (e.key === 'Escape') { setWEdycji(false); }
        }}
        placeholder="0,00"
        className="h-6 w-24 text-xs text-right px-1 py-0"
        autoFocus
      />
    );
  }

  return (
    // `data-bez-zaznaczenia`: kliknięcie w kwotę otwiera edycję i NIE ma zaznaczać
    // wiersza — wiersz pomija elementy z tym atrybutem (patrz `klikniecieWWiersz`).
    <span
      data-bez-zaznaczenia=""
      className={`cursor-pointer hover:bg-primary/10 rounded px-1 py-0.5 transition-colors ${
        nadpisana ? 'bg-yellow-100 dark:bg-yellow-900/30 font-semibold' : ''
      }`}
      onClick={zacznij}
      title="Kliknij, aby edytować. Zapis przy wyjściu z pola."
    >
      {wartosc > 0 ? `-${formatuj(wartosc)}` : (maAktywnosc ? '0,00' : '-')}
    </span>
  );
}

export const KomorkaKwoty = memo(
  KomorkaKwotyBase,
  (poprzednie, nastepne) =>
    poprzednie.driverId === nastepne.driverId &&
    poprzednie.pole === nastepne.pole &&
    poprzednie.indeks === nastepne.indeks &&
    poprzednie.wartosc === nastepne.wartosc &&
    poprzednie.maAktywnosc === nastepne.maAktywnosc &&
    poprzednie.nadpisana === nastepne.nadpisana &&
    poprzednie.onZapisz === nastepne.onZapisz,
);
