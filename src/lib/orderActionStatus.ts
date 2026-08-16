/**
 * Kolory trzech przycisków na karcie zlecenia: przyjęcie, kosztorys, odbiór.
 *
 * Do tej pory każdy świecił na żółto od otwarcia zlecenia do momentu, w którym
 * klient coś podpisał. Żółty znaczył jednocześnie „nie ma jeszcze czego wysyłać",
 * „trzeba wysłać" i „wysłano, czekamy" — czyli nie znaczył nic. Warsztat nie
 * wiedział, czy protokół poszedł do klienta, dopóki nie otworzył rozwijanej listy.
 *
 * Cztery stany, jeden rzut oka:
 *   szary            — etap jeszcze nieaktualny (nie ma czego wysłać),
 *   czerwony migający — JEST co wysłać i nikt tego nie wysłał,
 *   żółty            — wysłane, czekamy na klienta,
 *   zielony          — klient podpisał / zaakceptował / rzecz załatwiona.
 *
 * Funkcje są czyste, żeby dało się je sprawdzić testem bez klikania w kartę.
 */

export type StanAkcji = 'nieaktywny' | 'do_wyslania' | 'wyslane' | 'gotowe';

export interface OpisAkcji {
  stan: StanAkcji;
  /** Klasy Tailwind na ikonę przycisku. */
  klasa: string;
  /** Podpowiedź pod kursorem — mówi, co zrobić, nie jak się nazywa etap. */
  podpowiedz: string;
}

const KLASY: Record<StanAkcji, string> = {
  nieaktywny: 'text-muted-foreground/50',
  do_wyslania: 'text-red-500 animate-pulse',
  wyslane: 'text-amber-500',
  gotowe: 'text-green-500',
};

const opis = (stan: StanAkcji, podpowiedz: string): OpisAkcji => ({ stan, klasa: KLASY[stan], podpowiedz });

export interface DaneZlecenia {
  client_acceptance_confirmed?: boolean | null;
  estimate_sent_to_client?: boolean | null;
  estimate_changed_after_send?: boolean | null;
  quote_accepted?: boolean | null;
  ready_notification_sent?: boolean | null;
  status_name?: string | null;
}

/** PROTOKÓŁ PRZYJĘCIA — klient potwierdza, w jakim stanie zostawia auto. */
export function stanPrzyjecia(order: DaneZlecenia, maKontaktDoKlienta: boolean, wyslanoProtokol: boolean): OpisAkcji {
  if (order.client_acceptance_confirmed) return opis('gotowe', 'Klient podpisał przyjęcie auta');
  if (wyslanoProtokol) return opis('wyslane', 'Protokół wysłany — czekamy na podpis klienta');
  if (!maKontaktDoKlienta) return opis('nieaktywny', 'Dodaj klienta z numerem telefonu, żeby wysłać protokół przyjęcia');
  return opis('do_wyslania', 'Wyślij klientowi protokół przyjęcia do podpisu');
}

/** KOSZTORYS — klient akceptuje zakres i kwotę przed naprawą. */
export function stanKosztorysu(order: DaneZlecenia, maPozycjeZCena: boolean): OpisAkcji {
  // Zmiana po wysłaniu jest ważniejsza niż wcześniejsza akceptacja: klient
  // zaakceptował INNY kosztorys niż ten, który warsztat ma teraz.
  if (order.estimate_changed_after_send) return opis('do_wyslania', 'Kosztorys zmieniony po wysłaniu — wyślij go ponownie do akceptacji');
  if (order.quote_accepted) return opis('gotowe', 'Klient zaakceptował kosztorys');
  if (order.estimate_sent_to_client) return opis('wyslane', 'Kosztorys wysłany — czekamy na akceptację klienta');
  if (!maPozycjeZCena) return opis('nieaktywny', 'Dodaj pozycje z cenami, żeby wysłać kosztorys');
  return opis('do_wyslania', 'Wyceniłeś zlecenie — wyślij kosztorys klientowi do akceptacji');
}

const GOTOWE_STATUSY = ['Gotowy do odbioru', 'Zakończone', 'Do odbioru'];

/** ODBIÓR — „auto gotowe, można odbierać". Tu nie ma podpisu, wysłanie kończy sprawę. */
export function stanOdbioru(order: DaneZlecenia): OpisAkcji {
  if (order.ready_notification_sent) return opis('gotowe', 'Klient powiadomiony, że auto jest gotowe');
  if (GOTOWE_STATUSY.includes(String(order.status_name || ''))) {
    return opis('do_wyslania', 'Auto gotowe — powiadom klienta, że może odebrać');
  }
  return opis('nieaktywny', 'Oznacz zlecenie jako gotowe do odbioru, żeby powiadomić klienta');
}
