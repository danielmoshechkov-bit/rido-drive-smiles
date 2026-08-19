import { GETRIDO_MASCOT_DATAURI } from './getRidoMascot';
import { sylwetkaAutaDataUri } from './sylwetkaAuta';

/**
 * Protokół przyjęcia pojazdu — dokument do teczki i do ręki klienta.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * PO CO OSOBNY GENERATOR
 * ═══════════════════════════════════════════════════════════════════════════
 * Kosztorys i potwierdzenie wykonania to tabela pozycji z kwotami — dlatego
 * rysuje je generator faktur. Protokół przyjęcia opisuje STAN AUTA w chwili
 * oddania go do warsztatu: przebieg, poziom paliwa, uszkodzenia, ustalenia
 * z klientem, zdjęcia i rysunek do obrysowania rys długopisem. Wciśnięcie tego
 * w układ faktury dałoby dokument, w którym nic z tego nie ma swojego miejsca.
 *
 * Styl jest ten sam co reszta papierów warsztatu: logo, „miasto, data",
 * fioletowy pasek, stopka GetRido — żeby klient dostał komplet wyglądający
 * jak jeden zestaw, a nie trzy dokumenty z trzech różnych programów.
 *
 * ⚠️ Układ oparty na `display: table`, nie na flexie: serwerowy generator PDF
 * (Dompdf) renderuje w trybie `screen` i flexa nie zna.
 */

export interface StronaProtokolu {
  nazwa: string;
  nip?: string;
  adres?: string;
  telefon?: string;
  email?: string;
}

export interface PojazdProtokolu {
  marka?: string;
  model?: string;
  nrRej?: string;
  vin?: string;
  rocznik?: string | number;
  przebieg?: string | number;
  poziomPaliwa?: string;
}

export interface ZdjecieProtokolu {
  podpis: string;
  /** data-URI — dokument musi być samowystarczalny (PDF nie pobiera plików). */
  obraz: string;
}

export interface DaneProtokolu {
  numer: string;
  data: string;
  miasto?: string;
  logo?: string;
  warsztat: StronaProtokolu;
  klient: StronaProtokolu;
  pojazd: PojazdProtokolu;
  opisZlecenia?: string;
  opisUszkodzen?: string;
  /** Pozycje robocizny — zakres uzgodniony przy przyjęciu. */
  zakres: string[];
  ustalenia: { etykieta: string; tak: boolean }[];
  zdjecia: ZdjecieProtokolu[];
  /** Kto przyjmował auto — pod linią podpisu. */
  przyjmujacy?: string;
}

const KOLOR = '#7c3aed';
const KOLOR_TLO = '#f8f5ff';

const esc = (t: unknown): string =>
  String(t ?? '').replace(/[&<>"]/g, (z) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[z] as string));

const dataPl = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return esc(iso);
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
};

/** Wiersz „etykieta: wartość" — kreska, gdy nie ma czego wpisać. */
const pole = (etykieta: string, wartosc: unknown) =>
  `<div class="pole"><span class="pole-etykieta">${esc(etykieta)}:</span> <span class="pole-wartosc">${
    String(wartosc ?? '').trim() ? esc(wartosc) : '—'
  }</span></div>`;

function strona(naglowek: string, s: StronaProtokolu): string {
  return `
    <div class="strona">
      <div class="strona-etykieta">${esc(naglowek)}</div>
      <div class="strona-nazwa">${esc(s.nazwa) || '—'}</div>
      <div class="strona-szczegoly">
        ${s.nip ? `NIP: ${esc(s.nip)}<br>` : ''}
        ${s.adres ? `${esc(s.adres)}<br>` : ''}
        ${s.telefon ? `Tel.: ${esc(s.telefon)}<br>` : ''}
        ${s.email ? `${esc(s.email)}` : ''}
      </div>
    </div>`;
}

export function generateReceptionProtocolHtml(d: DaneProtokolu): string {
  /**
   * Kwadracik „zaznaczone / niezaznaczone".
   *
   * 🔴 Kratka MUSI siedzieć w dodatkowym `<span>`. Wiersz jest zbudowany na
   * `display: table`, a reguła `.ustalenie > span { display: table-cell }` jest
   * bardziej szczegółowa niż `.kratka { display: inline-block }` — bez opakowania
   * kwadrat stawał się komórką tabeli i rozciągał na całą wysokość wiersza.
   * Na wydruku wychodziły z tego prostokąty stykające się ze sobą.
   */
  const kratka = (tak: boolean) =>
    `<span class="kratka-pole"><span class="kratka ${tak ? 'kratka-tak' : ''}">${tak ? '&#10003;' : ''}</span></span>`;

  const ustaleniaHtml = d.ustalenia.map((u) => `
    <div class="ustalenie">${kratka(u.tak)} <span class="${u.tak ? '' : 'nie'}">${esc(u.etykieta)}</span>
      <span class="ustalenie-odp">${u.tak ? 'TAK' : 'NIE'}</span></div>`).join('');

  const zakresHtml = d.zakres.length
    ? `<ol class="zakres">${d.zakres.map((z) => `<li>${esc(z)}</li>`).join('')}</ol>`
    : '<div class="pusto">Zakres zostanie ustalony po oględzinach.</div>';

  // Zdjęcia po trzy w rzędzie — `display: table` zamiast siatki, bo Dompdf.
  const rzedy: ZdjecieProtokolu[][] = [];
  for (let i = 0; i < d.zdjecia.length; i += 3) rzedy.push(d.zdjecia.slice(i, i + 3));
  const zdjeciaHtml = d.zdjecia.length ? `
    <div class="sekcja">
      <div class="sekcja-tytul">Dokumentacja fotograficzna</div>
      ${rzedy.map((r) => `
      <div class="rzad-zdjec">
        ${r.map((z) => `
        <div class="komorka-zdjecia">
          <img src="${z.obraz}" alt="${esc(z.podpis)}">
          <div class="podpis-zdjecia">${esc(z.podpis)}</div>
        </div>`).join('')}
        ${Array.from({ length: 3 - r.length }, () => '<div class="komorka-zdjecia"></div>').join('')}
      </div>`).join('')}
      <div class="uwaga">Zdjęcia wykonano w chwili przyjęcia pojazdu i stanowią załącznik do niniejszego protokołu.</div>
    </div>` : '';

  return `<!DOCTYPE html>
<html lang="pl">
<head>
  <meta charset="UTF-8">
  <title>${esc(d.numer)}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    @page { margin: 0; size: A4; }
    @media screen {
      html { background: #eceaf3; }
      body { max-width: 210mm; margin: 0 auto; box-shadow: 0 1px 12px rgba(0,0,0,0.12); }
    }
    body { font-family: "DejaVu Sans", Arial, sans-serif; font-size: 11px; line-height: 1.35;
           color: #333; padding: 22pt 22pt 28pt 22pt; background: white; }

    .naglowek { display: table; width: 100%; margin-bottom: 8px; padding-bottom: 8px; border-bottom: 2px solid ${KOLOR}; }
    .logo-pole { display: table-cell; vertical-align: middle; width: 55%; }
    .logo-pole img { max-width: 264px; max-height: 84px; width: auto; height: auto; }
    .tytul-pole { display: table-cell; vertical-align: top; text-align: right; }
    .miasto-data { font-size: 12px; color: #333; margin-bottom: 3px; }
    .tytul { font-size: 17px; font-weight: 700; color: #222; line-height: 1.15; }
    .numer { font-size: 15px; font-weight: 700; color: ${KOLOR}; margin-top: 3px; }

    .strony { display: table; width: 100%; margin-bottom: 8px; }
    .strona { display: table-cell; vertical-align: top; width: 50%; padding-right: 16px; }
    .strona + .strona { padding-right: 0; padding-left: 16px; }
    .strona-etykieta { font-size: 10px; color: ${KOLOR}; text-transform: uppercase; font-weight: 700; margin-bottom: 2px; }
    .strona-nazwa { font-size: 13px; font-weight: 700; color: #111; }
    .strona-szczegoly { font-size: 10px; color: #555; line-height: 1.4; }

    .sekcja { margin-top: 8px; }
    .sekcja-tytul { font-size: 11px; font-weight: 700; color: #fff; background: ${KOLOR};
                    padding: 3px 8px; border-radius: 3px; margin-bottom: 5px; }
    .ramka { border: 1px solid #ddd; border-radius: 3px; padding: 6px 8px; background: #fff; }

    .pojazd { display: table; width: 100%; }
    .pojazd-kol { display: table-cell; vertical-align: top; width: 50%; padding-right: 12px; }
    .pole { margin-bottom: 2px; }
    .pole-etykieta { color: #666; }
    .pole-wartosc { font-weight: 700; color: #111; }

    .zakres { margin: 0 0 0 18px; }
    .zakres li { margin-bottom: 1px; }
    .pusto { color: #888; font-style: italic; }
    .tresc { white-space: pre-line; }

    .ustalenia { display: table; width: 100%; }
    .ustalenie { display: table-row; }
    .ustalenie > span { display: table-cell; padding: 3px 0; vertical-align: middle; }
    .kratka-pole { width: 18px; }
    .ustalenie > span:nth-child(2) { padding-left: 8px; }
    .ustalenie-odp { text-align: right; font-weight: 700; width: 40px; }
    .kratka { display: inline-block; width: 11px; height: 11px; border: 1px solid #777;
              border-radius: 2px; text-align: center; line-height: 10px; font-size: 9px; color: #fff; }
    .kratka-tak { background: ${KOLOR}; border-color: ${KOLOR}; }
    .nie { color: #777; }

    .sylwetka { width: 100%; margin-top: 4px; }
    .sylwetka img { width: 100%; height: auto; max-height: 150px; }
    .uwaga { font-size: 9px; color: #777; margin-top: 3px; }

    .rzad-zdjec { display: table; width: 100%; table-layout: fixed; margin-bottom: 5px; }
    .komorka-zdjecia { display: table-cell; width: 33.33%; padding-right: 5px; vertical-align: top; }
    .komorka-zdjecia img { width: 100%; height: auto; border: 1px solid #ddd; border-radius: 3px; }
    .podpis-zdjecia { font-size: 9px; color: #666; text-align: center; margin-top: 2px; }

    .oswiadczenie { font-size: 9px; color: #555; background: ${KOLOR_TLO};
                    border-left: 3px solid ${KOLOR}; padding: 6px 8px; margin-top: 8px; }

    .podpisy { display: table; width: 100%; margin-top: 18px; page-break-inside: avoid; }
    .podpis { display: table-cell; width: 50%; text-align: center; padding: 0 20px; vertical-align: top; }
    .podpis-linia { border-top: 1px solid #666; padding-top: 3px; font-size: 9px; color: #666; }
  </style>
</head>
<body>
  <div class="naglowek">
    <div class="logo-pole">${d.logo ? `<img src="${d.logo}" alt="Logo">` : `<div style="font-size:16px;font-weight:700;color:${KOLOR}">${esc(d.warsztat.nazwa)}</div>`}</div>
    <div class="tytul-pole">
      <div class="miasto-data">${d.miasto ? `${esc(d.miasto)}, ` : ''}${dataPl(d.data)}</div>
      <div class="tytul">PROTOKÓŁ PRZYJĘCIA POJAZDU</div>
      <div class="numer">${esc(d.numer)}</div>
    </div>
  </div>

  <div class="strony">
    ${strona('Przyjmujący', d.warsztat)}
    ${strona('Klient', d.klient)}
  </div>

  <div class="sekcja">
    <div class="sekcja-tytul">Dane pojazdu</div>
    <div class="ramka pojazd">
      <div class="pojazd-kol">
        ${pole('Marka i model', `${d.pojazd.marka || ''} ${d.pojazd.model || ''}`.trim())}
        ${pole('Nr rejestracyjny', d.pojazd.nrRej)}
        ${pole('VIN', d.pojazd.vin)}
      </div>
      <div class="pojazd-kol">
        ${pole('Rok produkcji', d.pojazd.rocznik)}
        ${pole('Przebieg', d.pojazd.przebieg ? `${d.pojazd.przebieg} km` : '')}
        ${pole('Poziom paliwa', d.pojazd.poziomPaliwa)}
      </div>
    </div>
  </div>

  <div class="sekcja">
    <div class="sekcja-tytul">Zgłoszenie klienta i zakres zlecenia</div>
    <div class="ramka">
      ${d.opisZlecenia ? `<div class="tresc">${esc(d.opisZlecenia)}</div>` : ''}
      ${d.opisZlecenia && d.zakres.length ? '<div style="height:4px"></div>' : ''}
      ${zakresHtml}
    </div>
  </div>

  <div class="sekcja">
    <div class="sekcja-tytul">Stan pojazdu przy przyjęciu</div>
    <div class="ramka">
      <div class="tresc">${d.opisUszkodzen ? esc(d.opisUszkodzen) : '<span class="pusto">Nie zgłoszono uszkodzeń opisowych.</span>'}</div>
      <div class="sylwetka"><img src="${sylwetkaAutaDataUri()}" alt="Sylwetka pojazdu"></div>
      <div class="uwaga">Zaznacz uszkodzenia na rysunku: X — rysa, O — wgniecenie, // — odprysk lakieru, ▢ — pęknięcie.</div>
    </div>
  </div>

  <div class="sekcja">
    <div class="sekcja-tytul">Ustalenia z klientem</div>
    <div class="ramka">
      <div class="ustalenia">${ustaleniaHtml}</div>
    </div>
  </div>

  ${zdjeciaHtml}

  <div style="page-break-inside: avoid;">
  <div class="oswiadczenie">
    Klient oświadcza, że zapoznał się ze stanem pojazdu opisanym powyżej i przekazuje pojazd
    do warsztatu w celu wykonania uzgodnionego zakresu prac. Zakres i koszt naprawy zostaną
    przedstawione w kosztorysie; przystąpienie do naprawy nastąpi po jego akceptacji.
    Warsztat nie odpowiada za rzeczy pozostawione w pojeździe.
  </div>

  <div class="podpisy">
    <div class="podpis"><div class="podpis-linia">Podpis przyjmującego${d.przyjmujacy ? `<br><strong>${esc(d.przyjmujacy)}</strong>` : ''}</div></div>
    <div class="podpis"><div class="podpis-linia">Podpis klienta</div></div>
  </div>
  </div>

  <script type="text/php">
    if (isset($pdf)) {
      $ff = $fontMetrics->getFont("DejaVu Sans");
      $pw = $pdf->get_width(); $ph = $pdf->get_height();
      $fy = $ph - 38;
      $mh = 22;
      try { $pdf->image("${GETRIDO_MASCOT_DATAURI}", 22, $fy - 3, $mh, $mh); } catch (\\Throwable $ie) {}
      $pdf->page_text(50, $fy, "www.GetRido.pl", $ff, 10, array(0,0,0));
      $pdf->page_text($pw - 96, $fy, "Strona {PAGE_NUM} z {PAGE_COUNT}", $ff, 10, array(0,0,0));
    }
  </script>
</body>
</html>`;
}
