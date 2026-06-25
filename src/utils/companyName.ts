// Replace verbose Polish legal forms with their standard abbreviations, e.g.
// "SPÓŁKA Z OGRANICZONĄ ODPOWIEDZIALNOŚCIĄ" → "Sp. z o.o.".
// Used to suggest a shorter display name after a NIP lookup — the full legal name
// stays in the field, the abbreviation is offered as a one-click suggestion.
//
// Order matters: longer/compound forms must be matched before their sub-parts.
const LEGAL_FORMS: [RegExp, string][] = [
  [/SP[ÓO]ŁKA Z OGRANICZON[ĄA] ODPOWIEDZIALNO[ŚS]CI[ĄA]\s+SP[ÓO]ŁKA KOMANDYTOWO-AKCYJNA/giu, 'Sp. z o.o. S.K.A.'],
  [/SP[ÓO]ŁKA Z OGRANICZON[ĄA] ODPOWIEDZIALNO[ŚS]CI[ĄA]\s+SP[ÓO]ŁKA KOMANDYTOWA/giu, 'Sp. z o.o. Sp.k.'],
  [/SP[ÓO]ŁKA Z OGRANICZON[ĄA] ODPOWIEDZIALNO[ŚS]CI[ĄA]/giu, 'Sp. z o.o.'],
  [/SP[ÓO]ŁKA KOMANDYTOWO-AKCYJNA/giu, 'S.K.A.'],
  [/SP[ÓO]ŁKA KOMANDYTOWA/giu, 'Sp.k.'],
  [/SP[ÓO]ŁKA AKCYJNA/giu, 'S.A.'],
  [/SP[ÓO]ŁKA JAWNA/giu, 'Sp.j.'],
  [/SP[ÓO]ŁKA PARTNERSKA/giu, 'Sp.p.'],
  [/SP[ÓO]ŁKA CYWILNA/giu, 's.c.'],
];

export function shortenCompanyName(name: string): string {
  if (!name) return name || '';
  let out = name;
  for (const [re, abbr] of LEGAL_FORMS) out = out.replace(re, abbr);
  return out.replace(/\s+/g, ' ').trim();
}
