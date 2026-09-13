/**
 * ŁADUNEK DLA CONVERSIONS API — czysta funkcja, bez sieci.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * PO CO SERWEROWA KOPIA ZDARZENIA
 * ═══════════════════════════════════════════════════════════════════════════
 * Piksel w przeglądarce gubi 20–40% ruchu w Polsce — Safari, blokery, zakup
 * dokończony na innym urządzeniu niż kliknięcie w reklamę. I nie gubi losowo:
 * najczęściej tych bardziej technicznych, czyli często tych, którzy kupują.
 * Bez kopii z serwera kampania wygląda na słabszą, niż jest.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 🔴 `event_id` DECYDUJE, CZY TO JEDNA KONWERSJA, CZY DWIE
 * ═══════════════════════════════════════════════════════════════════════════
 * Meta łączy zdarzenie z przeglądarki i z serwera po parze
 * `event_name` + `event_id`, w oknie 48 godzin. Gdy identyfikatory się różnią,
 * ta sama sprzedaż liczy się DWA RAZY — a naprawa po fakcie to przeliczanie
 * historii kampanii od nowa.
 *
 * U nas `event_id` przy zakupie to **IDENTYFIKATOR ZAMÓWIENIA**. Przeglądarka
 * bierze go z `billing_orders.id` (`lib/doladowanie.ts`), serwer z tego samego
 * wiersza. Żadna ze stron nie musi się z drugą umawiać.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * CO WOLNO WYSŁAĆ
 * ═══════════════════════════════════════════════════════════════════════════
 * Wyłącznie dane zahaszowane (`em`, `ph`) oraz identyfikatory techniczne
 * (`fbp`, `fbc`, adres IP, przeglądarka). **Adres jawny nie opuszcza serwera.**
 *
 * Pole puste jest gorsze niż jego brak — Meta liczy jakość dopasowania po
 * wypełnionych polach, więc pusty `em` obniża wynik. Dlatego składamy
 * `user_data` wyłącznie z tego, co naprawdę mamy.
 */

import { skrotEmaila, skrotTelefonu } from "./normalizacjaMeta.ts";

export interface DaneZamowienia {
  /** `billing_orders.id` — on jest `event_id`. */
  idZamowienia: string;
  email?: string | null;
  telefon?: string | null;
  kwotaBrutto: number;
  waluta?: string | null;
  /** Ciasteczka piksela zapamiętane przy rozpoczęciu zakupu. */
  fbp?: string | null;
  fbc?: string | null;
  adresIp?: string | null;
  przegladarka?: string | null;
  /** Adres strony, z której poszedł zakup — pomaga w atrybucji. */
  adresStrony?: string | null;
  /** Sekundy uniksowe. Podawane z zewnątrz, żeby test był powtarzalny. */
  czas?: number;
}

export interface ZdarzenieCapi {
  event_name: "Purchase";
  event_id: string;
  event_time: number;
  action_source: "website";
  event_source_url?: string;
  user_data: Record<string, string>;
  custom_data: { value: number; currency: string; order_id: string };
}

export async function zbudujZdarzenieZakupu(d: DaneZamowienia): Promise<ZdarzenieCapi> {
  const user_data: Record<string, string> = {};

  const em = await skrotEmaila(d.email);
  if (em) user_data.em = em;
  const ph = await skrotTelefonu(d.telefon);
  if (ph) user_data.ph = ph;

  // Bez skrótu — to nie są dane osobowe, tylko identyfikatory piksela.
  if (d.fbp) user_data.fbp = d.fbp;
  if (d.fbc) user_data.fbc = d.fbc;
  if (d.adresIp) user_data.client_ip_address = d.adresIp;
  if (d.przegladarka) user_data.client_user_agent = d.przegladarka;

  return {
    event_name: "Purchase",
    event_id: d.idZamowienia,
    event_time: d.czas ?? Math.floor(Date.now() / 1000),
    action_source: "website",
    ...(d.adresStrony ? { event_source_url: d.adresStrony } : {}),
    user_data,
    custom_data: {
      value: Number(d.kwotaBrutto),
      currency: (d.waluta || "PLN").toUpperCase(),
      order_id: d.idZamowienia,
    },
  };
}

/**
 * Czy w ogóle warto wysyłać.
 *
 * Zdarzenie bez ŻADNEGO sygnału o osobie Meta przyjmie i policzy jako
 * niedopasowane — psuje statystykę jakości i nie daje nic w zamian.
 * Wysyłamy dopiero, gdy mamy co najmniej jeden uchwyt.
 */
export function wartoWyslac(z: ZdarzenieCapi): boolean {
  const u = z.user_data;
  return Boolean(u.em || u.ph || u.fbp || u.fbc);
}
