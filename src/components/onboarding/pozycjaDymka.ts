/**
 * Gdzie postawić dymek wprowadzenia, żeby dało się z niego korzystać.
 *
 * Dwa wymagania, które długo się gryzły:
 *
 *  1. Dymek MUSI mieścić się w ekranie. Przy długiej podpowiedzi jego dolna
 *     krawędź wychodziła pod krawędź okna razem z przyciskiem „Dalej" — nie
 *     dało się przejść dalej ani domknąć kroku.
 *  2. Dymek NIE MOŻE zasłaniać tego, co podświetla. Podpowiedź „wpisz w punktach,
 *     z czym przyjechał klient" lądowała dokładnie na polu, w które trzeba pisać.
 *
 * Dlatego nie ma tu jednej reguły „najpierw z prawej, potem pod spodem", tylko
 * cztery propozycje i wybór tej, która najmniej zasłania cel. Funkcja jest czysta
 * (wchodzą prostokąty, wychodzą współrzędne), więc da się to sprawdzić testem
 * bez przeglądarki — a poprzednie wersje sprawdzało dopiero oko użytkownika.
 */

export interface Prostokat {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface WejscieDymka {
  /** Podświetlony obszar. */
  obszar: Prostokat;
  szerokosc: number;
  wysokosc: number;
  ekranW: number;
  ekranH: number;
  /** Odstęp od podświetlenia. */
  odstep?: number;
}

export interface PozycjaDymka {
  top: number;
  left: number;
  /** Skąd wzięta — przydaje się w testach i przy diagnozie. */
  strona: 'prawo' | 'lewo' | 'dol' | 'gora';
}

/** Pole wspólne dwóch prostokątów. 0 = nie zachodzą na siebie. */
export function zachodzenie(a: Prostokat, b: Prostokat): number {
  const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  return w > 0 && h > 0 ? w * h : 0;
}

export function pozycjaDymka({
  obszar,
  szerokosc,
  wysokosc,
  ekranW,
  ekranH,
  odstep = 8,
}: WejscieDymka): PozycjaDymka {
  const wPionie = (y: number) => Math.min(Math.max(12, y), Math.max(12, ekranH - wysokosc - 12));
  const wPoziomie = (x: number) => Math.min(Math.max(12, x), Math.max(12, ekranW - szerokosc - 12));

  const przyCelu = wPionie(obszar.top - 20);
  const kandydaci: PozycjaDymka[] = [
    { strona: 'prawo', top: przyCelu, left: obszar.right + 16 },
    { strona: 'lewo', top: przyCelu, left: obszar.left - szerokosc - 16 },
    { strona: 'dol', top: obszar.bottom + odstep + 6, left: wPoziomie(obszar.left) },
    { strona: 'gora', top: obszar.top - wysokosc - odstep - 6, left: wPoziomie(obszar.left) },
  ];

  const ocena = (p: PozycjaDymka) => {
    const przyciety = { top: wPionie(p.top), left: wPoziomie(p.left) };
    const dymek: Prostokat = {
      top: przyciety.top,
      bottom: przyciety.top + wysokosc,
      left: przyciety.left,
      right: przyciety.left + szerokosc,
    };
    return { ...p, ...przyciety, zachodzi: zachodzenie(dymek, obszar) };
  };

  const oceniane = kandydaci.map(ocena);
  // Najmniej zasłaniający wygrywa; przy remisie zostaje kolejność powyżej,
  // czyli bok przed dołem i górą — bo pod polami otwierają się listy podpowiedzi.
  const najlepszy = oceniane.reduce((a, b) => (b.zachodzi < a.zachodzi ? b : a));
  return { top: najlepszy.top, left: najlepszy.left, strona: najlepszy.strona };
}
