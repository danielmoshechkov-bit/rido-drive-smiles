/**
 * Testy trybu odczytu.
 *
 * Zestaw samych „nie wolno" wypadłby zielono także wtedy, gdyby funkcja
 * zwracała `false` zawsze — a wtedy klient nie mógłby ani przeglądać, ani
 * eksportować, czyli obietnica byłaby złamana w drugą stronę. Dlatego każdy
 * blok ma parę: coś zablokowanego i coś dopuszczonego.
 */

import { czyWolnoWTrybieOdczytu } from './trybOdczytu';

// --- namiastka DOM ---------------------------------------------------------
// Lekka, bo funkcja używa tylko `closest`, `tagName`, atrybutów i `textContent`.
type Wezel = {
  tagName: string;
  attrs: Record<string, string>;
  text: string;
  parent: Wezel | null;
};

function el(tagName: string, attrs: Record<string, string> = {}, text = '', parent: Wezel | null = null): any {
  const w: Wezel = { tagName: tagName.toUpperCase(), attrs, text, parent };
  const jako = (n: Wezel): any => ({
    tagName: n.tagName,
    textContent: n.text,
    hasAttribute: (a: string) => a in n.attrs,
    getAttribute: (a: string) => (a in n.attrs ? n.attrs[a] : null),
    closest: (sel: string) => {
      const czesci = sel.split(',').map((s) => s.trim());
      for (let p: Wezel | null = n; p; p = p.parent) {
        for (const c of czesci) {
          const mTag = /^[a-z]+$/.test(c) && p.tagName === c.toUpperCase();
          const mAtr = c.startsWith('[') && (() => {
            const wnetrze = c.slice(1, -1);
            const [a, v] = wnetrze.split('=');
            if (v === undefined) return a in p!.attrs;
            return p!.attrs[a] === v.replace(/"/g, '');
          })();
          if (mTag || mAtr) return jako(p);
        }
      }
      return null;
    },
  });
  return jako(w);
}

function wDrzewie(dziecko: string, rodzic: { tag: string; attrs?: Record<string, string>; text?: string }): any {
  const r: Wezel = { tagName: rodzic.tag.toUpperCase(), attrs: rodzic.attrs ?? {}, text: rodzic.text ?? '', parent: null };
  const d: Wezel = { tagName: dziecko.toUpperCase(), attrs: {}, text: '', parent: r };
  const jako = (n: Wezel): any => ({
    tagName: n.tagName,
    textContent: n.text,
    hasAttribute: (a: string) => a in n.attrs,
    getAttribute: (a: string) => (a in n.attrs ? n.attrs[a] : null),
    closest: (sel: string) => {
      const czesci = sel.split(',').map((s) => s.trim());
      for (let p: Wezel | null = n; p; p = p.parent) {
        for (const c of czesci) {
          const mTag = /^[a-z]+$/.test(c) && p.tagName === c.toUpperCase();
          const mAtr = c.startsWith('[') && (() => {
            const wnetrze = c.slice(1, -1);
            const [a, v] = wnetrze.split('=');
            if (v === undefined) return a in p!.attrs;
            return p!.attrs[a] === v.replace(/"/g, '');
          })();
          if (mTag || mAtr) return jako(p);
        }
      }
      return null;
    },
  });
  return jako(d);
}

export const przypadki: Array<[string, () => void]> = [
  [
    'przycisk „Dodaj zlecenie" — ZABLOKOWANY (to zgłosił klient)',
    () => {
      if (czyWolnoWTrybieOdczytu(el('button', {}, 'Dodaj zlecenie'))) {
        throw new Error('przycisk zapisujący przepuszczony');
      }
    },
  ],
  [
    'KONTROLA ODWROTNA — „Eksportuj CSV" DOZWOLONY',
    () => {
      if (!czyWolnoWTrybieOdczytu(el('button', {}, 'Eksportuj CSV'))) {
        throw new Error('eksport zablokowany — obietnica złamana w drugą stronę');
      }
    },
  ],
  [
    'kliknięcie w ikonę WEWNĄTRZ przycisku liczy się jak przycisk',
    () => {
      if (czyWolnoWTrybieOdczytu(wDrzewie('svg', { tag: 'button', text: 'Zapisz' }))) {
        throw new Error('kliknięcie w ikonę ominęło blokadę');
      }
    },
  ],
  [
    'jawny znacznik `data-odczyt` dopuszcza także przycisk bez słowa o eksporcie',
    () => {
      if (!czyWolnoWTrybieOdczytu(el('button', { 'data-odczyt': '' }, 'Raport miesięczny'))) {
        throw new Error('jawne dopuszczenie zignorowane');
      }
    },
  ],
  [
    'znacznik na RODZICU też dopuszcza — grupę przycisków oznacza się raz',
    () => {
      if (!czyWolnoWTrybieOdczytu(wDrzewie('button', { tag: 'div', attrs: { 'data-odczyt': '' } }))) {
        throw new Error('znacznik na rodzicu zignorowany');
      }
    },
  ],
  [
    'odnośnik przepuszczony, przycisk o tym samym napisie nie',
    () => {
      if (!czyWolnoWTrybieOdczytu(el('a', { href: '/cennik' }, 'Zobacz'))) throw new Error('odnośnik zablokowany');
      if (czyWolnoWTrybieOdczytu(el('button', {}, 'Zobacz'))) throw new Error('przycisk przepuszczony');
    },
  ],
  [
    'pole wyszukiwania działa, pole wyboru (checkbox) nie',
    () => {
      if (!czyWolnoWTrybieOdczytu(el('input', { type: 'text' }))) throw new Error('filtrowanie zablokowane');
      if (!czyWolnoWTrybieOdczytu(el('select', {}))) throw new Error('lista wyboru zablokowana');
      if (czyWolnoWTrybieOdczytu(el('input', { type: 'checkbox' }))) throw new Error('checkbox przepuszczony');
    },
  ],
  [
    'zakładki i pozycje menu działają — bez nich nie da się przeglądać',
    () => {
      if (!czyWolnoWTrybieOdczytu(el('button', { role: 'tab' }, 'Zlecenia'))) throw new Error('zakładka zablokowana');
      if (!czyWolnoWTrybieOdczytu(el('div', { role: 'menuitem' }, 'Filtruj'))) throw new Error('menu zablokowane');
    },
  ],
  [
    'kliknięcie w tło albo w wiersz tabeli nie jest blokowane',
    () => {
      if (!czyWolnoWTrybieOdczytu(el('div', {}, 'ZLP-08/2026-001'))) throw new Error('zwykły element zablokowany');
      if (!czyWolnoWTrybieOdczytu(null)) throw new Error('brak elementu potraktowany jak zapis');
    },
  ],
  [
    'pobieranie pliku po atrybucie `download`, nie po napisie',
    () => {
      if (!czyWolnoWTrybieOdczytu(el('button', { download: '' }, 'Faktura'))) throw new Error('pobieranie zablokowane');
    },
  ],
  [
    '„Pobierz z GUS" NIE jest czytaniem — zapisuje dane do formularza',
    () => {
      if (czyWolnoWTrybieOdczytu(el('button', {}, 'Pobierz z GUS'))) {
        throw new Error('przycisk zapisujący przeszedł przez słownik eksportu');
      }
    },
  ],
];

let zle = 0;
for (const [nazwa, przypadek] of przypadki) {
  try { przypadek(); console.log(`✅ ${nazwa}`); }
  catch (e) { zle++; console.log(`❌ ${nazwa} — ${(e as Error).message}`); }
}
if (zle > 0) throw new Error(`${zle} niezgodności w trybie odczytu`);
console.log('\nWSZYSTKO ZIELONE');
