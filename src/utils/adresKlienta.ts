/**
 * Rozbicie adresu klienta warsztatu na pola faktury.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * POWÓD (17.08.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 * Kartoteka klienta zbiera ulicę, numer domu i numer lokalu w trzech polach,
 * ale zapisuje je SKLEJONE w jednej kolumnie `workshop_clients.street`:
 *     „ul. Józefa Paschalisa Jakubowicza 92D”
 *     „ul. Kwiatowa 5 m. 12”
 *
 * Faktura potrzebuje ich z powrotem osobno — tego wymaga też KSeF, który ma
 * oddzielne pola na ulicę i numer budynku. Bez rozbicia użytkownik widział
 * puste „Ulica”, „Nr budynku” i „Nr lokalu” i musiał za każdym razem klikać
 * lupę przy NIP-ie, żeby pobrać dane z GUS-u — mimo że w kartotece były.
 *
 * ⚠️ CZEGO TA FUNKCJA NIE ROBI: nie zgaduje przy zapisie typu „6/12”. W Polsce
 * bywa to „budynek 6, lokal 12”, ale bywa też samym numerem budynku. Zostaje
 * w całości jako numer budynku — błędny podział na fakturze jest gorszy niż
 * numer zapisany tak, jak podał go użytkownik.
 */

export interface RozbityAdres {
  ulica: string;
  numerBudynku: string;
  numerLokalu: string;
}

const PUSTY: RozbityAdres = { ulica: '', numerBudynku: '', numerLokalu: '' };

export function rozbijAdres(sklejony: string | null | undefined): RozbityAdres {
  const tekst = (sklejony ?? '').trim().replace(/\s+/g, ' ');
  if (!tekst) return PUSTY;

  let reszta = tekst;
  let numerLokalu = '';

  // Numer lokalu zapisany jawnie: „m. 12”, „m.12”, „lok. 12”, „mieszk. 12”.
  //
  // Po znaczniku MUSI iść cyfra. Bez tego warunku „3 Maja” rozbijało się na
  // znacznik „m” i lokal „aja” — wzorzec łapał literę ze środka nazwy ulicy.
  // Wyszło na próbie, nie w przeglądzie.
  const lokal = reszta.match(/\s(?:m|lok|lokal|mieszk)\.?\s*(\d[\w/-]*)\s*$/i);
  if (lokal) {
    numerLokalu = lokal[1];
    reszta = reszta.slice(0, lokal.index).trim();
  }

  // Numer budynku: OSTATNI człon zaczynający się od cyfry.
  //
  // Szukamy od końca, nie od początku — inaczej „3 Maja 5” dałoby budynek „3”
  // i ulicę „Maja 5”. Przy „Aleja Jana Pawła II 12” człon „II” nie zaczyna się
  // cyfrą, więc poprawnie wypada „12”.
  const czlony = reszta.split(' ');
  let indeksNumeru = -1;
  for (let i = czlony.length - 1; i >= 0; i--) {
    if (/^\d/.test(czlony[i])) { indeksNumeru = i; break; }
  }

  // Adres bez żadnej cyfry to sama ulica — nie wymyślamy numeru.
  if (indeksNumeru === -1) {
    return { ulica: reszta, numerBudynku: '', numerLokalu };
  }

  // Cyfra na pierwszej pozycji przy jednoczłonowym zapisie („5”) to numer,
  // ale „3 Maja” bez numeru to nazwa ulicy. Rozstrzyga to, czy coś po niej jest.
  if (indeksNumeru === 0 && czlony.length > 1) {
    return { ulica: reszta, numerBudynku: '', numerLokalu };
  }

  const numerBudynku = czlony[indeksNumeru];
  const ulica = czlony.slice(0, indeksNumeru).join(' ');

  return { ulica: ulica.trim(), numerBudynku, numerLokalu };
}
