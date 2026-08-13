/**
 * Cennik Warsztatu — JEDYNE źródło prawdy.
 *
 * Wcześniej plany były wpisane osobno na stronie sprzedażowej (WorkshopLanding)
 * i w panelu (WorkshopDashboard), przez co panel pokazywał nieaktualne ceny
 * (99/175/249) obok obowiązujących na landingu. Każda zmiana cennika to teraz
 * edycja tego jednego pliku.
 */

export interface WorkshopPlan {
  id: string;
  name: string;
  /** Cena jako gotowy tekst — plany kontaktowe mają np. „Wycena”. */
  priceLabel: string;
  period: string;
  features: string[];
  cta: string;
  /** Wyróżniony wariant (ramka + „Najczęściej wybierany”). */
  popular?: boolean;
  /** Zamiast zakupu — kontakt z nami. */
  contact?: boolean;
  /** Funkcje zapowiedziane, jeszcze niedostępne. */
  comingSoon?: string[];
}

/** Program dla warsztatu (abonament podstawowy). */
export const WORKSHOP_PLANS: WorkshopPlan[] = [
  {
    id: 'darmowy',
    name: 'Darmowy',
    priceLabel: '0 zł',
    period: '/mc',
    features: [
      'Baza klientów + pojazdów, historia',
      'Terminarz + zlecenia 20/mc',
      'Zdjęcia przy przyjęciu',
      'Pomoc AI przy naprawie — 3 pytania / mc',
      'Dostęp do giełdy GetRido',
    ],
    cta: 'Zacznij za darmo',
  },
  {
    id: 'standard',
    name: 'Standard',
    popular: true,
    priceLabel: '89 zł',
    period: 'netto/mc',
    features: [
      'Zlecenia, wyceny, faktury — bez limitu',
      'Przechowalnia + fiskalizacja + KSeF',
      'Raporty + marża live, dane po VIN',
      'Dynamiczne statusy + e-podpis',
      'Pomoc AI przy naprawie — 50 pytań / mc',
      'Wyceny robocizny AI',
      'Dostęp do giełdy GetRido',
    ],
    cta: 'Wypróbuj 14 dni',
  },
  {
    id: 'pro',
    name: 'Pro',
    priceLabel: '169 zł',
    period: 'netto/mc',
    features: [
      'Wszystko ze Standard',
      'Magazyn + OCR faktur',
      'Integracje z hurtowniami',
      'Panel pracowników + listy kontrolne',
      'Pomoc AI przy naprawie — 300 pytań / mc',
      'Wyceny robocizny AI — 100 / mc',
      'Dostęp do giełdy GetRido',
    ],
    comingSoon: ['Dane naprawcze (TecRMI) + czas pracy mechanika'],
    cta: 'Wypróbuj 14 dni',
  },
  {
    id: 'sieci',
    name: 'Sieci',
    priceLabel: 'Wycena',
    period: 'indywidualna',
    contact: true,
    features: [
      'Wszystko z Pro',
      'Wiele lokalizacji, wspólna baza',
      'Analityka sieci + dedykowany opiekun',
      'Bez płacenia wielu osobnych abonamentów',
    ],
    cta: 'Napisz do nas',
  },
];

/** Agent AI (voicebot) — produkt dokupowany osobno. */
export const AGENT_PLANS: WorkshopPlan[] = [
  {
    id: 'agent',
    name: 'Agent',
    popular: true,
    priceLabel: '139 zł',
    period: 'netto/mc',
    features: [
      'AI voicebot ODBIERA telefon 24/7 — 120 min AI / mc w cenie',
      'Bot po godzinach + oddzwanianie do leadów',
      'Transkrypcje + umawianie wizyt',
      'Tworzy zlecenie (wpięty w program GetRido)',
    ],
    cta: 'Wypróbuj 14 dni',
  },
  {
    id: 'agent-pro',
    name: 'Agent Pro',
    priceLabel: '289 zł',
    period: 'netto/mc',
    features: [
      'AI voicebot 24/7 — 300 min AI / mc w cenie',
      'Obsługa wielu numerów / lokalizacji',
      'Wyceny AI + dobór części, protokoły napraw',
      'Priorytetowa jakość głosu i szybsze odpowiedzi',
      'Zaawansowana analityka rozmów (tagi, powody, raporty)',
      'Dedykowany opiekun klienta',
    ],
    cta: 'Wypróbuj 14 dni',
  },
];
