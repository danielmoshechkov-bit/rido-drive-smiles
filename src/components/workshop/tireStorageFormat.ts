/**
 * Wspolne formatowanie danych przechowalni.
 *
 * Wlasny plik, bo korzysta z niego i panel, i okno szczegolow. Trzymanie
 * tego w panelu oznaczaloby, ze okno importuje panel, a panel okno —
 * a taki uklad potrafi dac `undefined` w przegladarce mimo poprawnej
 * kompilacji.
 */

/** Rozmiar do pokazania: jeden wokolo albo dwa, gdy os tylna ma swoj. */
export function opisRozmiaru(r: {
  tire_size?: string | null;
  tire_size_rear?: string | null;
} | null | undefined): string {
  const przod = (r?.tire_size ?? '').trim();
  const tyl = (r?.tire_size_rear ?? '').trim();
  if (!przod && !tyl) return '';
  if (!tyl || tyl === przod) return przod;
  return `${przod} / tył ${tyl}`;
}
