/**
 * Sylwetka auta do ręcznego zaznaczania uszkodzeń na protokole przyjęcia.
 *
 * Każdy papierowy protokół w warsztacie ma rysunek auta — przyjmujący obrysowuje
 * na nim rysy i wgniecenia długopisem przy kliencie. Bez tego protokół jest tylko
 * listą pól i nie rozstrzyga sporu „to było wcześniej".
 *
 * Rysunek jest SVG osadzonym jako data-URI w `<img>`, a nie znacznikiem `<svg>`
 * wprost w treści: serwerowy generator PDF (Dompdf) rysuje SVG przez php-svg-lib
 * i tą drogą radzi sobie pewniej niż z SVG wplecionym w HTML.
 */

/** Bok auta w układzie lokalnym 0–296 × 0–176 (przód po lewej). */
const BOK = `
  <path class="nadwozie" d="M0 138 l4 -28 c2 -12 12 -18 26 -20 l44 -6
    c16 -22 38 -32 74 -32 c38 0 62 10 78 32 l50 8 c16 3 22 10 24 20 l4 26
    c0 8 -4 12 -12 12 l-280 0 c-8 0 -12 -4 -12 -12 z"/>
  <path class="szyba" d="M84 84 c12 -16 28 -24 56 -24 l0 30 -62 0 z"/>
  <path class="szyba" d="M150 60 c30 0 46 8 58 24 l-58 6 z"/>
  <line class="detal" x1="88" y1="116" x2="236" y2="116"/>
  <line class="detal" x1="150" y1="60" x2="150" y2="116"/>
  <circle class="kolo" cx="74" cy="150" r="24"/>
  <circle class="kolo" cx="240" cy="150" r="24"/>
  <circle class="detal" cx="74" cy="150" r="10"/>
  <circle class="detal" cx="240" cy="150" r="10"/>`;

/** Trzy rzuty obok siebie: z góry, lewy bok, prawy bok. */
const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 258" width="800" height="258">
  <style>
    .nadwozie { fill: #ffffff; stroke: #444444; stroke-width: 2; }
    .szyba { fill: #f3f1f9; stroke: #777777; stroke-width: 1.4; }
    .detal { fill: none; stroke: #aaaaaa; stroke-width: 1.2; }
    .kolo { fill: #e4e4e4; stroke: #555555; stroke-width: 1.5; }
    .opis { font-family: Arial, sans-serif; font-size: 11px; fill: #777777; }
    .naglowek { font-family: Arial, sans-serif; font-size: 12px; fill: #555555; font-weight: bold; }
  </style>

  <!-- RZUT Z GORY -->
  <text class="naglowek" x="82" y="14" text-anchor="middle">RZUT Z GORY</text>
  <text class="opis" x="82" y="30" text-anchor="middle">przod</text>
  <g transform="translate(40,36)">
    <path class="nadwozie" d="M42 0 C58 0 70 8 74 26 L82 52 L84 150 L80 176
      C76 190 60 196 42 196 C24 196 8 190 4 176 L0 150 L2 52 L10 26
      C14 8 26 0 42 0 Z"/>
    <path class="szyba" d="M18 44 c8 -5 40 -5 48 0 l4 16 c-19 -4 -37 -4 -56 0 z"/>
    <path class="szyba" d="M14 152 c19 -4 37 -4 56 0 l-4 16 c-16 -4 -32 -4 -48 0 z"/>
    <rect class="detal" x="14" y="64" width="56" height="84" rx="4"/>
    <line class="detal" x1="42" y1="64" x2="42" y2="148"/>
    <rect class="kolo" x="-6" y="44" width="9" height="26" rx="3"/>
    <rect class="kolo" x="81" y="44" width="9" height="26" rx="3"/>
    <rect class="kolo" x="-6" y="128" width="9" height="26" rx="3"/>
    <rect class="kolo" x="81" y="128" width="9" height="26" rx="3"/>
  </g>
  <text class="opis" x="82" y="248" text-anchor="middle">tyl</text>

  <!-- LEWY BOK -->
  <text class="naglowek" x="313" y="14" text-anchor="middle">LEWY BOK</text>
  <g transform="translate(180,44) scale(0.9)">${BOK}</g>
  <text class="opis" x="184" y="216">przod</text>
  <text class="opis" x="442" y="216" text-anchor="end">tyl</text>

  <!-- PRAWY BOK: to samo odbite, zeby przod byl po prawej -->
  <text class="naglowek" x="643" y="14" text-anchor="middle">PRAWY BOK</text>
  <g transform="translate(776,44) scale(-0.9,0.9)">${BOK}</g>
  <text class="opis" x="772" y="216" text-anchor="end">przod</text>
  <text class="opis" x="514" y="216">tyl</text>
</svg>`;

/** Rysunek jako data-URI — gotowy do wstawienia w `src` obrazka. */
export function sylwetkaAutaDataUri(): string {
  // `encodeURIComponent` zamiast base64: czytelne w źródle dokumentu i nie
  // wymaga `btoa`, który na polskich znakach potrafi rzucić wyjątkiem.
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(SVG);
}

export const SYLWETKA_AUTA_SVG = SVG;
