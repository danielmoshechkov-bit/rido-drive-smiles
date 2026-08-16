// ============================================================================
// supervoip-zapis.mjs — JEDYNA DROGA ZAPISU DO API OPERATORA.
//
// Odczyt ma własną bramkę (`supervoip-odczyt.mjs`), w której metoda nie jest
// parametrem. Tu jest odwrotnie: metoda jest, ale wszystko dookoła niej ma
// utrudnić przypadkowy zapis.
//
// Dlaczego tak: u tego operatora zapis wydaje pieniądze i dzwoni do ludzi.
// `POST /api/voip_numbers` kupuje numer z salda prepaid,
// `POST /api/asterisk/do_call` WYKONUJE POŁĄCZENIE,
// `POST /api/sms_messages` WYSYŁA SMS.
// Dwa razy zapisałem produkcję ElevenLabs, „tylko sprawdzając" (15.08 model
// syntezy, 17.08 `turn_timeout: -1`). Tu ta sama pomyłka kończy się rachunkiem
// albo telefonem do losowej osoby.
//
//   import { zapiszSupervoip } from "./supervoip-zapis.mjs";
//   await zapiszSupervoip({
//     metoda: "PUT",
//     sciezka: "/api/voip_numbers/386734",
//     cialo: { localConnection: true, localConnectionType: "sip" },
//     zamierzone: true,
//     powod: "podpiecie numeru warsztatu Kowalski pod konto SIP z trunkiem",
//     sprawdz: { pole: "localConnection", wartosc: true },
//   });
// ============================================================================
import { odczytaj, BAZA } from "./supervoip-odczyt.mjs";

/**
 * BIAŁA LISTA. Nie „czarna lista rzeczy zakazanych", bo listy zakazów są
 * zawsze niekompletne — nowy niebezpieczny endpoint pojawi się w API bez
 * naszego udziału i domyślnie byłby dozwolony.
 */
const DOZWOLONE = [
  { metoda: "POST", wzor: /^\/api\/sips$/ },
  { metoda: "PUT", wzor: /^\/api\/sips\/\d+$/ },
  { metoda: "POST", wzor: /^\/api\/voip_numbers$/ },
  { metoda: "PUT", wzor: /^\/api\/voip_numbers\/\d+$/ },
];

/**
 * Ścieżki, które NIE SĄ zapisem konfiguracji — są akcją w świecie.
 * Wypisane osobno, żeby komunikat odmowy mówił, co dokładnie by się stało.
 */
const AKCJE_W_SWIECIE = {
  "/api/asterisk/do_call": "wykonałoby POŁĄCZENIE TELEFONICZNE do prawdziwej osoby",
  "/api/asterisk/do_call_remote": "wykonałoby POŁĄCZENIE TELEFONICZNE do prawdziwej osoby",
  "/api/sms_messages": "wysłałoby SMS-a z naszego numeru",
};

/** Ostatni zapis — operator przyjmuje 1 zapis na 10 s, przekroczenie to 429. */
let ostatniZapis = 0;
const ODSTEP_MS = 10_500;

export async function zapiszSupervoip({ metoda, sciezka, cialo, zamierzone, powod, sprawdz }) {
  if (zamierzone !== true) {
    throw new Error(
      "ODMOWA ZAPISU: brak `zamierzone: true`.\n" +
      "U tego operatora zapis wydaje pieniadze z salda prepaid albo dzwoni do ludzi.\n" +
      "Jesli chcesz tylko sprawdzic, co API zwraca — uzyj supervoip-odczyt.mjs.",
    );
  }
  if (!powod || String(powod).trim().length < 10) {
    throw new Error("ODMOWA ZAPISU: `powod` jest obowiazkowy i ma mowic, dla kogo i po co ten zapis.");
  }
  const akcja = AKCJE_W_SWIECIE[String(sciezka).split("?")[0]];
  if (akcja) {
    throw new Error(`ODMOWA ZAPISU: ${sciezka} to nie jest zmiana konfiguracji — ${akcja}. Ta bramka tego nie robi.`);
  }
  const wolno = DOZWOLONE.some((d) => d.metoda === metoda && d.wzor.test(String(sciezka)));
  if (!wolno) {
    throw new Error(
      `ODMOWA ZAPISU: ${metoda} ${sciezka} nie jest na bialej liscie.\n` +
      "Bialą liste rozszerza sie SWIADOMIE, w kodzie — nie parametrem wywolania.",
    );
  }
  const klucz = process.env.SUPERVOIP_API_KEY;
  if (!klucz) throw new Error("BRAK SUPERVOIP_API_KEY — zatrzymuje sie, nie obchodze.");

  // ODSTĘP. Nie „ponawianie po 429": ponawianie po odmowie znaczy, że pierwsze
  // żądanie MOGŁO dojść, a my go powtarzamy. Przy zakupie numeru to drugi zakup.
  const czekaj = ODSTEP_MS - (Date.now() - ostatniZapis);
  if (czekaj > 0) await new Promise((r) => setTimeout(r, czekaj));
  ostatniZapis = Date.now();

  const r = await fetch(BAZA + sciezka, {
    method: metoda,
    headers: {
      Authorization: `Bearer ${klucz}`,
      "Content-Type": metoda === "PATCH" ? "application/merge-patch+json" : "application/ld+json",
      Accept: "application/ld+json",
    },
    body: JSON.stringify(cialo ?? {}),
  });
  const tekst = await r.text();
  if (!r.ok) throw new Error(`${metoda} ${sciezka} → ${r.status}: ${tekst.slice(0, 400)}`);
  const odpowiedz = tekst ? JSON.parse(tekst) : null;

  // WERYFIKACJA PONOWNYM ODCZYTEM, nie po kodzie odpowiedzi.
  // 200 znaczy „przyjąłem żądanie", nie „ustawiłem wartość" — u ElevenLabs
  // `language_presets` przyjmowało zapis i przechowywało `null`.
  let sprawdzone = null;
  if (sprawdz) {
    const gdzie = sprawdz.sciezka || (metoda === "POST" ? odpowiedz?.["@id"] : sciezka);
    if (!gdzie) throw new Error("ZAPIS WYKONANY, ale nie wiem, skad go odczytac — podaj sprawdz.sciezka");
    const po = await odczytaj(gdzie);
    const faktyczna = String(sprawdz.pole).split(".").reduce((o, k) => (o == null ? o : o[k]), po);
    const zgodne = JSON.stringify(faktyczna) === JSON.stringify(sprawdz.wartosc);
    sprawdzone = { pole: sprawdz.pole, oczekiwana: sprawdz.wartosc, faktyczna, zgodne };
    if (!zgodne) {
      throw new Error(`ZAPIS NIE UTRZYMAL SIE: ${sprawdz.pole} = ${JSON.stringify(faktyczna)}, oczekiwano ${JSON.stringify(sprawdz.wartosc)}`);
    }
  }
  return { odpowiedz, powod, sprawdzone };
}
