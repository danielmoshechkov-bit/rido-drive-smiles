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
  staleMiesieczne: number;       // pakiet + usługi, brutto
}

export interface KosztNumeru {
  miesiecznie: number;           // servicePrice.pricePerMonth (brutto)
  aktywacja: number;             // activationPrice
}

export interface Werdykt {
  wolno: boolean;
  powod: string;
  saldoPo: number;
  miesiecyZapasu: number;
}

/**
 * Czy wolno kupić numer.
 *
 * `zapasMiesiecy` to nie ostrożność dla ostrożności: numer sprzedany warsztatowi
 * ma działać w kolejnym miesiącu, a saldo prepaid schodzi też na abonament
 * i rozmowy. Zakup, po którym nie stać nas na następny okres rozliczeniowy,
 * jest zakupem, który zaraz zabierze numer klientowi.
 */
export function czyWolnoKupic(
  konto: StanKonta,
  koszt: KosztNumeru,
  zapasMiesiecy = 2,
): Werdykt {
  const saldoPo = Number((konto.saldo - koszt.aktywacja - koszt.miesiecznie).toFixed(2));
  const naMiesiac = konto.staleMiesieczne + koszt.miesiecznie;
  const miesiecyZapasu = naMiesiac > 0 ? Number((saldoPo / naMiesiac).toFixed(2)) : Infinity;

  if (!konto.mozeKupic) {
    return { wolno: false, powod: "operator zwraca canBuyVoipNumber=false — zakup zablokowany po ich stronie", saldoPo, miesiecyZapasu };
  }
  if (konto.numeryZablokowane) {
    return { wolno: false, powod: "voipNumberLock=true — numery na koncie są zablokowane", saldoPo, miesiecyZapasu };
  }
  if (saldoPo < 0) {
    return { wolno: false, powod: `saldo nie pokrywa zakupu: ${konto.saldo} zł, koszt ${(koszt.aktywacja + koszt.miesiecznie).toFixed(2)} zł`, saldoPo, miesiecyZapasu };
  }
  if (miesiecyZapasu < zapasMiesiecy) {
    return {
      wolno: false,
      powod: `po zakupie zostaje ${saldoPo} zł, czyli ${miesiecyZapasu} miesiąca przy stałych ${naMiesiac.toFixed(2)} zł/mc — `
        + `wymagany zapas to ${zapasMiesiecy}. Numer, za który nie ma z czego zapłacić, przestanie działać warsztatowi.`,
      saldoPo,
      miesiecyZapasu,
    };
  }
  return { wolno: true, powod: `saldo ${konto.saldo} zł → ${saldoPo} zł, zapas ${miesiecyZapasu} mies.`, saldoPo, miesiecyZapasu };
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
  zapasMiesiecy?: number;
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
  const werdykt = czyWolnoKupic(opcje.konto, opcje.koszt, opcje.zapasMiesiecy);
  if (!werdykt.wolno) throw new Error(`ODMOWA ZAKUPU: ${werdykt.powod}`);

  return {
    sciezka: "/api/voip_numbers",
    // firstSubscriptionPeriod jest wymagane TYLKO dla numerów komórkowych.
    // Kupujemy stacjonarne, więc null — nie zgadujemy okresu abonamentu.
    cialo: { number: opcje.numerIri, sip: opcje.sipIri, firstSubscriptionPeriod: null },
    werdykt,
  };
}
