// Dane podmiotu prawnego będącego operatorem portalu (regulamin, polityka
// prywatności, cookies, stopki dokumentów). Jedno źródło prawdy — nie
// duplikować tych danych na sztywno w JSX.
//
// Uwaga: rozliczenia kierowców (autofakturowanie art. 106d VAT) oraz
// ustawienia faktur/KSeF pozostają na dotychczasowym podmiocie — nie
// używać tego configu w tamtych miejscach.

export interface LegalEntity {
  name: string;
  shortName: string;
  nip: string;
  regon: string;
  krs: string;
  court: string;
  shareCapital: string;
  street: string;
  postalCode: string;
  city: string;
  email: string;
  emailRodo: string;
  website: string;
  lastUpdated: string;
}

export const LEGAL_ENTITY: LegalEntity = {
  name: "Getrido Sp. z o.o.",
  shortName: "GetRido",
  nip: "5223377431",
  regon: "545163303",
  krs: "0001251247",
  court:
    "Sąd Rejonowy dla m.st. Warszawy w Warszawie, XIV Wydział Gospodarczy Krajowego Rejestru Sądowego",
  shareCapital: "15 000,00 zł",
  street: "Borsucza 13",
  postalCode: "02-213",
  city: "Warszawa",
  email: "kontakt@getrido.pl",
  emailRodo: "rodo@getrido.pl",
  website: "getrido.pl",
  lastUpdated: "2026-07-20",
};

/** "Borsucza 13, 02-213 Warszawa" */
export const getFullAddress = (): string =>
  `${LEGAL_ENTITY.street}, ${LEGAL_ENTITY.postalCode} ${LEGAL_ENTITY.city}`;
