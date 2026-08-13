/**
 * Pozycja bez ceny a pozycja za 0 zł — to dwie różne rzeczy.
 *
 * Brak ceny (NULL) znaczy „jeszcze nie wiem, ile to kosztuje". Taka pozycja jest
 * w karcie zlecenia widoczna i podświetlona, ale KLIENT JEJ NIE WIDZI — bo
 * wycena, w której coś kosztuje 0, jest gorsza niż wycena bez tej pozycji:
 * klient uzna, że to gratis, i będzie miał rację czuć się oszukany, gdy kwota
 * pojawi się później.
 *
 * Cena 0 to decyzja: robimy to za darmo. Klient ma ją zobaczyć — właśnie po to,
 * żeby wiedział, że dostał coś w cenie.
 *
 * Dlatego wszędzie, gdzie liczy się „czy pozycja ma cenę", pytamy o NULL,
 * a nie o zero.
 */

export interface PozycjaZCena {
  unit_price_net?: number | null;
  unit_price_gross?: number | null;
}

/** Czy pozycja czeka jeszcze na wycenę (żadna z cen nie została ustalona). */
export const cenaNieustalona = (item: PozycjaZCena | null | undefined): boolean =>
  !!item && item.unit_price_net == null && item.unit_price_gross == null;

/** Czy pozycja może trafić przed oczy klienta (wycena, wydruk, podpis). */
export const widocznaDlaKlienta = (item: PozycjaZCena | null | undefined): boolean =>
  !!item && !cenaNieustalona(item);

/** Odsiewa z listy pozycje bez ustalonej ceny. */
export const tylkoWycenione = <T extends PozycjaZCena>(items: T[] | null | undefined): T[] =>
  (items || []).filter(widocznaDlaKlienta);
