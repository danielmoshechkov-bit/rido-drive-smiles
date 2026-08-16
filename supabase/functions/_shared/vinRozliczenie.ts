// Rozliczanie sprawdzeń pojazdu (VIN / nr rejestracyjny) — trzy poziomy.
//
// Kolejność: pula warsztatu → paczki warsztatu → własne kredyty pracownika.
// Pierwsze dwa poziomy obsługuje `billing_consume`. Trzeci NIE jest w niej
// zaszyty świadomie: pracownik ma świadomie zdecydować, że dokłada z własnej
// kieszeni do pracy. Funkcja bazy zwraca „brak środków w puli firmy", a zgodę
// zbiera interfejs i przysyła ją z powrotem jako `uzyjWlasnych`.
//
// Użytkownik BEZ warsztatu (portal klienta, flota) zostaje na własnym saldzie —
// dla niego nic się nie zmienia.
//
// ⚠️ Rozliczenie następuje PO udanym zapytaniu do zewnętrznego API, bo ono
// kosztuje niezależnie od wyniku, a klient nie ma płacić za „nie znaleziono".
// Dlatego sprawdzenie i pobranie to dwa osobne kroki: `ustalZrodlo` przed
// zapytaniem (żeby nie płacić dostawcy, gdy i tak nie mamy z czego pobrać)
// i `pobierz` po nim.

export type Zrodlo = 'firma' | 'wlasne';

export interface Kontekst {
  /** Warsztat, w kontekście którego pracuje użytkownik. `null` = portal klienta / flota. */
  providerId: string | null;
  /** Czy użytkownik jest właścicielem tego warsztatu (a nie pracownikiem). */
  jestWlascicielem: boolean;
}

export interface Decyzja {
  /** Skąd pobrać jednostkę. `null` = nie ma z czego. */
  zrodlo: Zrodlo | null;
  /** Pula firmy pusta, ale użytkownik ma własne kredyty i jeszcze nie wyraził zgody. */
  wymagaZgody: boolean;
  /** Ile własnych kredytów zostanie użytkownikowi PO tym sprawdzeniu. */
  wlasnePozostalo: number;
  /** Powód z `billing_consume`, gdy pula firmy odmówiła — do komunikatu i logów. */
  powodFirmy: string | null;
}

/**
 * W kontekście którego warsztatu działa użytkownik.
 *
 * Najpierw właściciel, potem pracownik. Kolejność ma znaczenie dla właściciela,
 * który bywa też wpisany jako pracownik własnego warsztatu — dla niego to i tak
 * jedna kieszeń, ale chcemy stabilnego wyniku, a nie zależnego od kolejności
 * wierszy w tabeli.
 */
export async function ustalKontekst(admin: any, userId: string): Promise<Kontekst> {
  const { data: wlasny } = await admin
    .from('service_providers')
    .select('id')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (wlasny?.id) return { providerId: wlasny.id, jestWlascicielem: true };

  const { data: zatrudniony } = await admin
    .from('workshop_employees')
    .select('provider_id')
    .eq('user_id', userId)
    .is('removed_at', null)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (zatrudniony?.provider_id) {
    return { providerId: zatrudniony.provider_id, jestWlascicielem: false };
  }

  return { providerId: null, jestWlascicielem: false };
}

async function wlasneSaldo(admin: any, userId: string): Promise<number> {
  const { data } = await admin
    .from('vehicle_lookup_credits')
    .select('remaining_credits')
    .eq('user_id', userId)
    .maybeSingle();
  return Number(data?.remaining_credits ?? 0);
}

/**
 * Czy mamy z czego pobrać — WYWOŁAĆ PRZED zapytaniem do płatnego API.
 *
 * Nie pobiera niczego. Tylko odpowiada, z którego poziomu pójdzie jednostka,
 * albo czy trzeba najpierw zapytać użytkownika o zgodę.
 */
export async function ustalZrodlo(
  admin: any,
  userId: string,
  kontekst: Kontekst,
  uzyjWlasnych: boolean,
): Promise<Decyzja> {
  const wlasne = await wlasneSaldo(admin, userId);

  // Bez warsztatu — jak dotąd, własne saldo i tyle.
  if (!kontekst.providerId) {
    return {
      zrodlo: wlasne > 0 ? 'wlasne' : null,
      wymagaZgody: false,
      wlasnePozostalo: Math.max(wlasne - 1, 0),
      powodFirmy: null,
    };
  }

  const { data: stan, error } = await admin.rpc('check_usage', {
    p_subscriber_type: 'service_provider',
    p_subscriber_id: kontekst.providerId,
    p_feature_key: 'vehicle_lookup',
    p_amount: 1,
  });

  // Fail-closed: nie wiemy, czy warsztat ma pokrycie, więc nie wydajemy jego
  // jednostki. Zostaje ścieżka własnych kredytów za zgodą — nikt nie traci
  // dostępu, ale nikt też nie dostaje nic za darmo.
  const firmaMoze = !error && stan?.allowed === true;

  if (firmaMoze) {
    return { zrodlo: 'firma', wymagaZgody: false, wlasnePozostalo: wlasne, powodFirmy: null };
  }

  const powod = error ? `check_usage_blad: ${error.message}` : (stan?.reason ?? 'nieznany');

  // Właściciel nie jest pytany o zgodę — jego „własne" kredyty i pula firmy to
  // ta sama kieszeń, więc pytanie brzmiałoby absurdalnie.
  if (kontekst.jestWlascicielem) {
    return {
      zrodlo: wlasne > 0 ? 'wlasne' : null,
      wymagaZgody: false,
      wlasnePozostalo: Math.max(wlasne - 1, 0),
      powodFirmy: powod,
    };
  }

  if (wlasne <= 0) {
    return { zrodlo: null, wymagaZgody: false, wlasnePozostalo: 0, powodFirmy: powod };
  }

  if (!uzyjWlasnych) {
    return { zrodlo: null, wymagaZgody: true, wlasnePozostalo: wlasne - 1, powodFirmy: powod };
  }

  return { zrodlo: 'wlasne', wymagaZgody: false, wlasnePozostalo: wlasne - 1, powodFirmy: powod };
}

/**
 * Pobranie jednostki — WYWOŁAĆ PO udanym zapytaniu.
 *
 * Zwraca `false`, gdy pobranie się nie udało. Wywołujący ma wtedy oddać dane
 * (są już kupione u dostawcy) i zapisać ostrzeżenie: to jest strata, ale
 * mniejsza niż odmowa klientowi, który zrobił wszystko dobrze.
 */
export async function pobierz(
  admin: any,
  userId: string,
  kontekst: Kontekst,
  decyzja: Decyzja,
  opis: { regNum: string | null; vin: string | null; sourceType: string },
): Promise<boolean> {
  if (decyzja.zrodlo === 'firma' && kontekst.providerId) {
    const { data, error } = await admin.rpc('billing_consume', {
      p_subscriber_type: 'service_provider',
      p_subscriber_id: kontekst.providerId,
      p_feature_key: 'vehicle_lookup',
      p_amount: 1,
    });
    if (error || data?.ok !== true) {
      console.warn(
        `vin: pula firmy odmówiła przy pobraniu (${error?.message ?? data?.reason}) — ` +
        `warsztat ${kontekst.providerId}, użytkownik ${userId}. Dane wydane, jednostka NIEROZLICZONA.`,
      );
      return false;
    }
    await zapiszUzycie(admin, userId, kontekst.providerId, opis);
    return true;
  }

  if (decyzja.zrodlo === 'wlasne') {
    const { error } = await admin.rpc('deduct_vehicle_lookup_credit', { p_user_id: userId });
    if (error) {
      console.warn(`vin: nie udało się zdjąć własnego kredytu ${userId}: ${error.message}`);
      return false;
    }
    await zapiszUzycie(admin, userId, kontekst.providerId, opis);
    await admin.from('vehicle_lookup_credit_transactions').insert({
      user_id: userId,
      type: 'usage',
      credits: -1,
      source: 'system',
      note: opis.regNum ? `Sprawdzenie: ${opis.regNum}` : `Sprawdzenie VIN: ${opis.vin}`,
    });
    return true;
  }

  return false;
}

async function zapiszUzycie(
  admin: any,
  userId: string,
  providerId: string | null,
  opis: { regNum: string | null; vin: string | null; sourceType: string },
) {
  // Ewidencja użycia zostaje przy użytkowniku nawet przy pobraniu z puli firmy —
  // właściciel ma widzieć, KTO sprawdzał, a nie tylko ile jednostek zeszło.
  const wiersz = {
    user_id: userId,
    registration_number: opis.regNum,
    vin: opis.vin,
    source_type: opis.sourceType,
    credits_used: 1,
  };

  const { error } = await admin
    .from('vehicle_lookup_usage')
    .insert({ ...wiersz, provider_id: providerId });

  if (error) {
    // `provider_id` dokłada migracja 4.12. Gdyby funkcja pojechała przed nią,
    // ewidencja nie może wywrócić sprawdzenia, za które klient już zapłacił —
    // zapisujemy bez tej kolumny i zostawiamy ślad w logu.
    console.warn(`vin: ewidencja bez provider_id (${error.message})`);
    await admin.from('vehicle_lookup_usage').insert(wiersz);
  }
}
