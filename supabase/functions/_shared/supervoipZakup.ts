// ============================================================================
// supervoipZakup.ts — BRAMKA ZAKUPU NUMERU U OPERATORA.
//
// `POST /api/voip_numbers` wydaje prawdziwe pieniądze z salda konta prepaid,
// a `POST /api/asterisk/do_call` DZWONI do ludzi. To nie są zapisy, które
// da się cofnąć edycją pola.
//
// Konto jest PREPAID, `creditLimit: 0`. Gdy saldo się skończy, nie dostajemy
// faktury — przestają działać numery, które już sprzedaliśmy warsztatom.
// Dlatego saldo sprawdzamy PRZED zakupem, a nie dowiadujemy się o nim z błędu.
//
// Zasada 32: pomyłka, w którą wpada się mimo wiedzy, że istnieje, jest brakiem
// kontroli, nie brakiem uwagi. Stąd `zamierzone: true` — tak jak przy zapisach
// do ElevenLabs, gdzie dwa razy zapisałem produkcję, „tylko sprawdzając".
// ============================================================================

/** Stan konta potrzebny do decyzji o zakupie — wprost z `GET /api/customers/me`. */
export interface StanKonta {
  saldo: number;                 // accountBalance
  mozeKupic: boolean;            // canBuyVoipNumber
  numeryZablokowane: boolean;    // voipNumberLock
}

export interface KosztNumeru {
  miesiecznie: number;           // servicePrice.pricePerMonth (brutto)
  aktywacja: number;             // activationPrice
}

export interface Werdykt {
  wolno: boolean;
  powod: string;
  saldoPo: number;
}

/**
 * Czy wolno kupić numer.
 *
 * Sprawdzamy TYLKO to, czego operator nie sprawdzi za nas w chwili zakupu:
 * czy konto nie jest zablokowane i czy saldo pokrywa ten jeden zakup.
 *
 * Pierwsza wersja wymagała zapasu na dwa miesiące stałych kosztów. Zdjęte:
 * SuperVoIP jest prepaid i sam pobiera abonament z salda, więc pilnowanie
 * tego po naszej stronie dublowało cudzy mechanizm i opierało się na liczbie
 * (stałe miesięczne), którą musielibyśmy utrzymywać ręcznie — a zdezaktualizowana
 * stała w kontroli jest gorsza niż brak kontroli, bo wygląda na pilnowanie.
 */
export function czyWolnoKupic(konto: StanKonta, koszt: KosztNumeru): Werdykt {
  const doZaplaty = Number((koszt.aktywacja + koszt.miesiecznie).toFixed(2));
  const saldoPo = Number((konto.saldo - doZaplaty).toFixed(2));

  if (!konto.mozeKupic) {
    return { wolno: false, powod: "operator zwraca canBuyVoipNumber=false — zakup zablokowany po ich stronie", saldoPo };
  }
  if (konto.numeryZablokowane) {
    return { wolno: false, powod: "voipNumberLock=true — numery na koncie są zablokowane", saldoPo };
  }
  if (saldoPo < 0) {
    return { wolno: false, powod: `saldo nie pokrywa zakupu: ${konto.saldo} zł, koszt ${doZaplaty.toFixed(2)} zł`, saldoPo };
  }
  return { wolno: true, powod: `saldo ${konto.saldo} zł → ${saldoPo} zł`, saldoPo };
}

/**
 * Buduje ładunek `POST /api/voip_numbers`. Sam NIE wysyła — wysyłka jest
 * osobno, żeby nie dało się kupić numeru, wołając funkcję „przygotowującą".
 *
 * Rzuca, gdy zakup jest niedozwolony ALBO gdy wywołujący nie zadeklarował
 * `zamierzone: true`. Wartości domyślnej celowo nie ma: brak parametru
 * to odmowa, nie zgoda.
 */
export function przygotujZakup(opcje: {
  numerIri: string;
  sipIri: string;
  konto: StanKonta;
  koszt: KosztNumeru;
  zamierzone?: boolean;
  powod?: string;
}): { sciezka: string; cialo: Record<string, unknown>; werdykt: Werdykt } {
  if (opcje.zamierzone !== true) {
    throw new Error(
      "ODMOWA ZAKUPU: brak `zamierzone: true`. POST /api/voip_numbers wydaje pieniądze z salda prepaid.",
    );
  }
  if (!opcje.powod || opcje.powod.trim().length < 10) {
    throw new Error("ODMOWA ZAKUPU: `powod` jest obowiązkowy — ma mówić, dla którego warsztatu kupujemy numer.");
  }
  if (!/^\/api\/numbers\/\d+$/.test(opcje.numerIri)) {
    throw new Error(`ODMOWA ZAKUPU: numerIri ma być postaci /api/numbers/{id}, dostałem: ${opcje.numerIri}`);
  }
  if (!/^\/api\/sips\/\d+$/.test(opcje.sipIri)) {
    throw new Error(`ODMOWA ZAKUPU: sipIri ma być postaci /api/sips/{id}, dostałem: ${opcje.sipIri}`);
  }
  const werdykt = czyWolnoKupic(opcje.konto, opcje.koszt);
  if (!werdykt.wolno) throw new Error(`ODMOWA ZAKUPU: ${werdykt.powod}`);

  return {
    sciezka: "/api/voip_numbers",
    // KSZTAŁT ŻĄDANIA JEST INNY, NIŻ MÓWI SPECYFIKACJA OPERATORA.
    //
    // OpenAPI na restapi.supervoip.pl dokumentuje ciało jako
    // `{number, sip, firstSubscriptionPeriod}`. Prawdziwe API odrzuca to
    // z błędem 400: „Cannot create an instance of VoipNumberMultipleRequest
    // because its constructor requires parameter »voipNumbers« to be present".
    // Czyli endpoint jest zbiorczy i oczekuje TABLICY.
    //
    // Wysyłamy DOKŁADNIE JEDEN element. To nie ostrożność na wyrost: przy
    // zbiorczym endpoincie pomyłka w budowie tablicy kupuje tyle numerów,
    // ile ma elementów, a każdy z nich to prawdziwe pieniądze z salda prepaid.
    //
    // `firstSubscriptionPeriod` jest wymagane TYLKO dla komórkowych; kupujemy
    // stacjonarne, więc null — nie zgadujemy okresu abonamentu.
    cialo: { voipNumbers: [{ number: opcje.numerIri, sip: opcje.sipIri, firstSubscriptionPeriod: null }] },
    werdykt,
  };
}
