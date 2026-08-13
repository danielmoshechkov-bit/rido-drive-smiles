import { supabase } from '@/integrations/supabase/client';

/**
 * Sklejanie zapytań „kim jest zalogowany użytkownik".
 *
 * `supabase.auth.getUser()` NIE czyta z pamięci przeglądarki — za każdym razem
 * pyta serwer, żeby zweryfikować token. W aplikacji woła go 174 pliki, więc samo
 * wejście w panel wysyłało osiem takich zapytań pod rząd, jedno po drugim,
 * zanim cokolwiek się wyświetliło.
 *
 * Zamiast przepisywać wszystkie miejsca wywołania, podmieniamy samą metodę:
 *  - równoległe wywołania dostają JEDNO wspólne zapytanie (dedupe),
 *  - wynik żyje przez chwilę (TTL), więc seria hooków montujących się razem
 *    korzysta z jednej odpowiedzi,
 *  - każda zmiana sesji (logowanie, wylogowanie, odświeżenie tokenu) natychmiast
 *    czyści pamięć, więc nikt nie zobaczy nieaktualnego użytkownika.
 *
 * Plik klienta Supabase jest generowany automatycznie, dlatego podmiana siedzi
 * tutaj i jest włączana raz, przy starcie aplikacji.
 */

const TTL_MS = 15_000;

type GetUser = typeof supabase.auth.getUser;

let wlaczone = false;

export function enableAuthCache() {
  if (wlaczone) return;
  wlaczone = true;

  const oryginal: GetUser = supabase.auth.getUser.bind(supabase.auth);

  let wynik: Awaited<ReturnType<GetUser>> | null = null;
  let czasWyniku = 0;
  let wLocie: Promise<Awaited<ReturnType<GetUser>>> | null = null;

  const wyczysc = () => { wynik = null; czasWyniku = 0; wLocie = null; };

  supabase.auth.onAuthStateChange(() => wyczysc());

  (supabase.auth as any).getUser = ((...args: Parameters<GetUser>) => {
    // Wywołanie z jawnym tokenem omijamy — to inne pytanie niż „kto jest zalogowany".
    if (args.length > 0 && args[0]) return oryginal(...args);

    if (wynik && Date.now() - czasWyniku < TTL_MS) return Promise.resolve(wynik);
    if (wLocie) return wLocie;

    wLocie = oryginal().then((odpowiedz) => {
      wynik = odpowiedz;
      czasWyniku = Date.now();
      wLocie = null;
      return odpowiedz;
    }).catch((e) => {
      wLocie = null;
      throw e;
    });

    return wLocie;
  }) as GetUser;
}
