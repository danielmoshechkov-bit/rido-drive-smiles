// ============================================================================
// voice-agent-init — WEBHOOK INICJUJĄCY. Snapshot pobierany PRZY ODEBRANIU.
//
// Po co: `check_availability` w trakcie rozmowy to jedyna operacja, jaka została,
// i jedyna tura powyżej 2 s — zmierzone 5,2-7,3 s. W jednej turze ElevenLabs
// wystrzelił trzy równoległe żądania, które razem wywołały narzędzie SIEDEM razy,
// a jedno porzucił po 9,5 s. Tura trwała 17 sekund.
//
// Snapshot pobiera wszystko w czasie, gdy agent mówi powitanie — czyli za darmo,
// bo powitanie i tak trwa ~3 s.
//
// TRZY ZASADY, KTÓRE TU MIESZKAJĄ:
//
// 1. BUDŻET 300 ms, a przy przekroczeniu PUSTY SNAPSHOT, NIE BŁĄD. Rozmowa ma się
//    zacząć nawet bez terminów — agent wróci wtedy do `check_availability`.
//    Brak danych to nie awaria (zasada 12: błąd nie może wyglądać jak brak danych,
//    ale i brak danych nie może wywracać rozmowy).
//
// 2. MODEL NIE LICZY, TYLKO WYBIERA. Dni mają gotową formę „wtorek, osiemnastego
//    sierpnia", godziny są przefiltrowane per usługa. Agent trzykrotnie powiedział
//    „wtorek dziewiętnaście sierpnia" o dacie, która była ŚRODĄ, i zapisał
//    rezerwację o dzień za późno (zasada 24).
//
// 3. KONTRAKT GENERYCZNY. `dni`, `uslugi`, `zasoby` — nigdy `stanowiska`,
//    `naprawy`, `pojazdy`. Pola branżowe w `branza: {}`. Kryterium przy każdej
//    decyzji: czy zadziała dla fryzjera bez zmiany kodu?
// ============================================================================
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getPhase1Secret } from "../_shared/voicePhase1SecretReader.ts";
import {
  cenaDoWypowiedzenia, czasDoWypowiedzenia, czasUslugi, hhmm, kluczDnia, minuty, ostatniStart,
  wolneGodziny, zbudujDni, type GodzinyDnia, type Usluga,
} from "../_shared/voiceSnapshot.ts";
// ANGIELSKI — OSOBNY MODUŁ, DOKŁADANY OBOK. Moduł polski zostaje nietknięty:
// ma 22 asercje i trzy dni poprawek za sobą, a uogólnianie go na drugi język
// znaczyłoby przepisanie kodu sprawdzonego na produkcji dla języka, który
// jeszcze nikogo nie obsłużył.
import {
  cenaDoWypowiedzeniaEn, czasDoWypowiedzeniaEn, doWypowiedzeniaEn, powodEn,
} from "../_shared/voiceSnapshotEn.ts";
import {
  cenaDoWypowiedzeniaSlow, czasDoWypowiedzeniaSlow, doWypowiedzeniaSlow, powodSlow,
  type JezykSlow,
} from "../_shared/voiceSnapshotSlow.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

// BUDŻET. Podniesiony z 300 na 800 ms — POMIAR, nie przeczucie.
//
// 300 ms było ustalone z góry, zanim cokolwiek zmierzyliśmy. Na produkcji budowa
// zajmuje 133-310 ms zależnie od obciążenia bazy, więc limit wypadał W ŚRODKU
// rozkładu: przy wolniejszej bazie snapshot znikał, czyli był niedostępny
// dokładnie wtedy, gdy system jest pod obciążeniem.
//
// 800 ms nadal nie opóźnia odebrania: powitanie ("Dzień dobry, Warsztat, rozmowa
// rejestrowana — w czym mogę pomóc?") to ~3 s syntezy, a klient odzywa się dopiero
// po nim. Osiemset milisekund mieści się w tym oknie z zapasem.
//
// Zasada 21 zastosowana do progu: próg ustawia się na OGONIE rozkładu, nie na
// medianie, i po pomiarze — nie przed.
const BUDZET_MS = 800;
const DNI_W_PRZOD = 14;
const GODZINY_ZAPASOWE: GodzinyDnia = { open: "09:00", close: "17:00" };

/** Wartości domyślne — agent ma działać u warsztatu, który niczego nie ustawił. */
// Teksty pisane JĘZYKIEM ROZMOWY, nie regulaminu — agent czyta je na głos.
// Każdy mówi klientowi KIEDY pozna cenę, nie tylko pod jakim warunkiem.
const POLITYKI: Record<string, string> = {
  kosztorys_przed_naprawa: "Kosztorys pokażemy przed rozpoczęciem naprawy — nic nie robimy bez Pana zgody.",
  diagnoza_bezplatna_przy_naprawie: "Jeśli zlecą Państwo naprawę, diagnoza jest bezpłatna.",
  diagnoza_platna_odliczana: "Diagnoza kosztuje {kwota}, a przy naprawie odliczamy ją od rachunku.",
  diagnoza_platna_zawsze: "Diagnoza kosztuje {kwota} — niezależnie od tego, czy zdecydują się Państwo na naprawę.",
};

const dzisiajWarszawa = (): string =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Warsaw" }).format(new Date());

const tylkoCyfry = (v: unknown) => String(v ?? "").replace(/\D/g, "").slice(-9);


/**
 * TOKENY, KTÓRE OTWIERAJĄ TEN WEBHOOK.
 *
 * `VOICE_INIT_TOKEN` czytamy WYŁĄCZNIE ze zmiennych środowiskowych — sekrety Edge
 * Functions tam właśnie żyją. `VOICE_LLM_TOKEN` zostaje jako zapas, żeby wdrożenie
 * nie zerwało konfiguracji, zanim nowy sekret powstanie.
 *
 * DLACZEGO NIE `getPhase1Secret` DLA OBU: pierwsza wersja pytała o oba przez ten
 * czytnik. Dla klucza spoza env schodzi on do bazy, a ten odczyt NIE MA LIMITU
 * CZASU — przy wolnej bazie funkcja wisiała. Zmierzone: OPTIONS 200 w 0,16 s,
 * POST bez odpowiedzi po 40 s. Zawiesiłem działający webhook dokładając
 * jedno zapytanie, które zawsze chybia.
 *
 * Fallback bazodanowy zostaje TYLKO dla VOICE_LLM_TOKEN, bo tam już był i działa
 * z env, ale i on dostaje limit czasu — autoryzacja nie ma prawa wisieć.
 */
async function tokenyDozwolone(admin: Parameters<typeof getPhase1Secret>[0]): Promise<string[]> {
  const zEnv = [Deno.env.get("VOICE_INIT_TOKEN"), Deno.env.get("VOICE_LLM_TOKEN")]
    .filter((t): t is string => !!t && t.length > 0);
  if (zEnv.length) return zEnv;
  // Dopiero gdy env nic nie dało — jedno zapytanie, z twardym limitem.
  const zBazy = await Promise.race([
    getPhase1Secret(admin, "VOICE_LLM_TOKEN"),
    new Promise<null>((r) => setTimeout(() => r(null), 1500)),
  ]);
  return zBazy ? [zBazy] : [];
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const started = performance.now();
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceRoleKey);

  // /warmup — jak w pozostałych funkcjach: jedno trywialne zapytanie za tokenem,
  // poza ścieżką rozmowy. Webhook inicjujący MUSI być ciepły, bo jego opóźnienie
  // idzie prosto w czas odebrania połączenia.
  if (new URL(req.url).pathname.endsWith("/warmup")) {
    const provided = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim()
      || new URL(req.url).searchParams.get("token") || "";
    const dozwoloneW = await tokenyDozwolone(admin);
    if (!dozwoloneW.length || !provided || !dozwoloneW.includes(provided)) {
      return json({ error: "unauthorized" }, 401);
    }
    const warmStarted = performance.now();
    await admin.from("voice_agent_configs").select("provider_id").limit(1);
    // Log jak w pozostałych funkcjach. Bez niego `warmup` nie pojawiał się
    // w logach i wyglądało to jak brak podtrzymywania — a pg_net dostawał 200.
    // Cicha gałąź jest nieodróżnialna od gałęzi niewywoływanej.
    console.info("[voice-agent-init]", JSON.stringify({
      event: "stage_timing", stage: "warmup",
      duration_ms: Math.round(performance.now() - warmStarted),
    }));
    return json({ ok: true, warm: true });
  }

  // OSOBNY TOKEN DLA TEGO WEBHOOKA.
  //
  // `VOICE_INIT_TOKEN` jest sprawdzany pierwszy; `VOICE_LLM_TOKEN` zostaje jako
  // zapas, żeby wdrożenie tej zmiany nie zerwało konfiguracji, zanim nowy sekret
  // powstanie. Po jego ustawieniu kompromitacja jednego nie otwiera drugiego,
  // a rotacja Custom LLM nie zrywa webhooka inicjującego.
  //
  // NAGŁÓWEK: przyjmujemy OBA warianty — „Bearer <token>" i sam token.
  // ElevenLabs, gdy wybierze się sekret jako wartość nagłówka, wstawia SAMĄ
  // WARTOŚĆ bez prefiksu. Wymuszanie „Bearer" zmuszałoby do wpisania tokenu
  // jawnie w panelu, czyli do trzymania sekretu poza sejfem.
  const provided = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  const dozwolone = await tokenyDozwolone(admin);
  if (!dozwolone.length || !provided || !dozwolone.includes(provided)) {
    return json({ error: "unauthorized" }, 401);
  }

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  // ElevenLabs podaje te pola w ładunku inicjującym; nazwy bywają różne
  // w zależności od wersji, więc bierzemy pierwszą niepustą.
  const agentId = String(
    (body as Record<string, unknown>)?.agent_id
    ?? ((body as Record<string, Record<string, unknown>>)?.conversation_initiation_client_data?.agent_id)
    ?? "",
  );
  const callerRaw = (body as Record<string, unknown>)?.caller_id
    ?? (body as Record<string, Record<string, unknown>>)?.call?.from_number
    ?? (body as Record<string, unknown>)?.from_number ?? "";
  const callerId = tylkoCyfry(callerRaw);

  // Pusty snapshot to POPRAWNA odpowiedź, nie awaria. Agent wraca wtedy do
  // check_availability i do „wycenimy po obejrzeniu auta".
  const pusty = (powod: string) => {
    console.info("[voice-agent-init]", JSON.stringify({
      event: "snapshot_pusty", powod, ms: Math.round(performance.now() - started),
    }));
    return json({
      // Kształt WYMAGANY przez ElevenLabs. Bez pola `type` webhook inicjujący
      // jest odrzucany, a agent startuje bez żadnych zmiennych dynamicznych.
      type: "conversation_initiation_client_data",
      dynamic_variables: { rido_snapshot: "", rido_caller_znany: callerId ? "tak" : "nie" },
      // Powód pustego snapshotu widoczny TYLKO przy ręcznym ?debug=1 — bez tego
      // „pusty" i „pusty z innego powodu" wyglądają identycznie.
      ...(new URL(req.url).searchParams.get("debug") === "1"
        ? { _powod: powod, _ms: Math.round(performance.now() - started) }
        : {}),
    });
  };

  try {
    const zbuduj = async () => {
      const { data: cfg } = await admin.from("voice_agent_configs")
        .select("provider_id, persona_key")
        .eq(agentId ? "elevenlabs_agent_id" : "persona_key", agentId || "workshop_secretary")
        .limit(1);
      const providerId = cfg?.[0]?.provider_id as string | undefined;
      if (!providerId) return null;

      const dzisiaj = dzisiajWarszawa();
      const koniecOkna = new Date(new Date(dzisiaj + "T12:00:00Z").getTime() + DNI_W_PRZOD * 864e5)
        .toISOString().slice(0, 10);

      // JEDNA RUNDA RÓWNOLEGŁA — sześć odczytów naraz, żeby zmieścić się w budżecie.
      const [prov, uslugi, zasobyGen, zasobyWarsztat, zajete, klient] = await Promise.all([
        admin.from("service_providers")
          .select("short_name, company_name, company_address, company_city, working_hours")
          .eq("id", providerId).limit(1),
        admin.from("provider_services")
          .select("id, name, price_from, price_to, duration_minutes, category")
          .eq("provider_id", providerId).eq("is_active", true).limit(40),
        admin.from("booking_resources")
          .select("id, name, type").eq("provider_id", providerId).eq("is_active", true).limit(30),
        admin.from("workshop_workstations")
          .select("id, name").eq("provider_id", providerId).limit(30),
        admin.from("workshop_client_bookings")
          .select("appointment_date, appointment_time, phone, status")
          .eq("provider_id", providerId)
          .gte("appointment_date", dzisiaj).lte("appointment_date", koniecOkna).limit(400),
        callerId
          ? admin.from("workshop_clients").select("id, first_name, phone").eq("provider_id", providerId).limit(500)
          : Promise.resolve({ data: [] as Array<Record<string, unknown>> }),
      ]);

      // BŁĄD ZAPYTANIA NIE MOŻE WYGLĄDAĆ JAK BRAK DANYCH (zasada 12).
      // Pierwsza wersja pobierała nieistniejącą kolumnę `phone`; PostgREST zwrócił
      // błąd, `data` było null, a snapshot pokazał WSZYSTKIE DNI jako zamknięte —
      // wyglądało to jak warsztat nieczynny cały tydzień, nie jak awaria zapytania.
      for (const [nazwa, wynik] of [["firma", prov], ["uslugi", uslugi], ["zasoby", zasobyGen],
        ["stanowiska", zasobyWarsztat], ["rezerwacje", zajete], ["klienci", klient]] as const) {
        const err = (wynik as { error?: { message?: string } }).error;
        if (err) {
          console.error("[voice-agent-init]", JSON.stringify({
            event: "zapytanie_nie_powiodlo_sie", zrodlo: nazwa, blad: err.message,
          }));
        }
      }

      const p = prov.data?.[0] as Record<string, unknown> | undefined;
      const godzinyTygodnia = (p?.working_hours as Record<string, GodzinyDnia>) || {};
      // Brak godzin pracy = wszystkie dni zamknięte, czyli snapshot bez ani jednego
      // terminu. To ma być WIDOCZNE, a nie ciche — inaczej agent milczy o terminach
      // i nikt nie wie dlaczego.
      if (!Object.keys(godzinyTygodnia).length) {
        console.error("[voice-agent-init]", JSON.stringify({
          event: "brak_godzin_pracy",
          skutek: "wszystkie dni wyjda jako zamkniete, agent nie zaproponuje terminu",
        }));
      }

      // ZASOBY: generyczne najpierw, warsztatowe jako zapas. Nie kopiujemy jednych
      // w drugie — dwa źródła prawdy o tym samym to gwarantowany rozjazd.
      const zasoby = (zasobyGen.data?.length
        ? zasobyGen.data.map((z: Record<string, unknown>) => ({ id: z.id, nazwa: z.name, typ: String(z.type || "zasob") }))
        : (zasobyWarsztat.data || []).map((z: Record<string, unknown>) => ({ id: z.id, nazwa: z.name, typ: "stanowisko" })));
      const pojemnosc = Math.max(1, zasoby.length);

      // USTAWIENIA — tabeli jeszcze nie ma, więc wartości domyślne. Kontrakt ma już
      // gałąź `ustawienia`, żeby zakładka w panelu weszła bez zmiany kształtu.
      // ŹRÓDŁEM BĘDZIE `workshop_clients.preferred_language` — kolumna czeka
      // na zatwierdzenie migracji. Do tego czasu null, czyli zachowanie
      // dzisiejsze: polski plus angielski, bez rosyjskiego i ukraińskiego.
      const jezykKlienta: string | null = null;

      const zamkniecieTypowe = (godzinyTygodnia["mon"] || GODZINY_ZAPASOWE).close;
      const DOMYSLNY_CZAS_MIN = 60;
      // NAJPÓŹNIEJSZE PRZYJĘCIE NIE MOŻE RÓWNAĆ SIĘ ZAMKNIĘCIU.
      //
      // Było `= zamkniecieTypowe`, czyli 17:00 przy pracy do 17:00. Pole nie
      // ograniczało niczego w wyliczeniach (bo `ostatniStart` bierze minimum
      // i pierwszy człon i tak wychodził niżej), ALE trafiało do snapshotu jako
      // tekst — i agent czytał je dosłownie.
      //
      // ROZMOWA 15.08, 10:49 — agent zaprzeczył sam sobie w osiem sekund:
      //   [83s] „Najpóźniej przyjmujemy do siedemnastej."
      //   [91s] „Niestety siedemnasta to już koniec dnia. Ostatnia godzina
      //          to szesnasta trzydzieści."
      // Do czasu powstania zakładki ustawień liczymy je z zamknięcia i czasu wizyty.
      const najpozniejszePrzyjecie = hhmm(
        ostatniStart(zamkniecieTypowe, DOMYSLNY_CZAS_MIN, null));
      const ustawienia = {
        najpozniejsze_przyjecie: najpozniejszePrzyjecie,
        domyslny_czas_wizyty_min: DOMYSLNY_CZAS_MIN,
        polityka_wyceny: "kosztorys_przed_naprawa",
        polityka_wyceny_tekst: POLITYKI.kosztorys_przed_naprawa,
        oplata_za_diagnoze_bez_usterki: "zalezy",
      };

      const zajeteWgDnia: Record<string, string[]> = {};
      for (const b of zajete.data || []) {
        const d = String((b as Record<string, unknown>).appointment_date);
        const t = String((b as Record<string, unknown>).appointment_time || "").slice(0, 5);
        (zajeteWgDnia[d] ||= []).push(t);
      }

      // Sloty liczymy dla DOMYŚLNEGO czasu wizyty — to jest lista „na kiedy w ogóle
      // można przyjechać". Usługa z własnym, dłuższym czasem ma swój `ostatni_start`
      // podany obok, więc agent widzi ograniczenie bez drugiego zapytania.
      // AKTUALNA GODZINA W WARSZAWIE — potrzebna, żeby nie proponować terminów,
      // które już minęły. Bez tego o 23:42 snapshot podawał poranek jako „dzisiaj".
      const terazWarszawa = new Intl.DateTimeFormat("pl-PL", {
        timeZone: "Europe/Warsaw", hour: "2-digit", minute: "2-digit", hour12: false,
      }).format(new Date());

      const dni = zbudujDni(dzisiaj, DNI_W_PRZOD, godzinyTygodnia, (iso, g) =>
        wolneGodziny(g, DOMYSLNY_CZAS_MIN, pojemnosc,
          zajeteWgDnia[iso] || [], 30, najpozniejszePrzyjecie, 3,
          // Filtr po aktualnej godzinie WYŁĄCZNIE dla dzisiejszego dnia.
          iso === dzisiaj ? terazWarszawa : null));

      // ANGIELSKIE POLA DNI — dokładane PO `zbudujDni`, nie w jego środku.
      // Funkcja polska zostaje bez zmiany, a my wzbogacamy jej wynik. Dzięki temu
      // usunięcie tego bloku wraca do stanu sprzed, bez dotykania polszczyzny.
      // JĘZYK DODATKOWY — DOKŁADNIE JEDEN, NIE WSZYSTKIE NARAZ.
      //
      // Kusi, żeby wysłać pola dla czterech języków i pozwolić modelowi wybrać.
      // Nie robimy tego: snapshot ma dziś 6,7 kB przy polskim i angielskim,
      // a cztery języki to około 10 kB — i ten payload wraca do nas
      // W KAŻDEJ TURZE, nie raz na rozmowę. To rachunek i opóźnienie za dane,
      // z których 3/4 nigdy nie zostanie użyte.
      //
      // Język bierzemy z tego, co zapamiętaliśmy przy poprzedniej rozmowie
      // tego numeru. Dopóki kolumna `preferred_language` nie istnieje,
      // `jezykKlienta` jest null i lecą wyłącznie pola polskie i angielskie
      // — czyli stan dzisiejszy, bez zmiany zachowania.
      const jezykSlow: JezykSlow | null =
        jezykKlienta === "ru" || jezykKlienta === "uk" ? jezykKlienta : null;

      const dniZAngielskim = dni.map((d) => ({
        ...d,
        do_wypowiedzenia_en: doWypowiedzeniaEn(d.data),
        ...(d.powod ? { powod_en: powodEn(d.powod) } : {}),
        ...(jezykSlow
          ? {
            [`do_wypowiedzenia_${jezykSlow}`]: doWypowiedzeniaSlow(d.data, jezykSlow),
            ...(d.powod ? { [`powod_${jezykSlow}`]: powodSlow(d.powod, jezykSlow) } : {}),
          }
          : {}),
      }));

      const uslugiOut = (uslugi.data || []).map((u: Record<string, unknown>) => {
        const usluga: Usluga = {
          id: String(u.id), nazwa: String(u.name),
          cena_od: u.price_from as number | null, cena_do: u.price_to as number | null,
          duration_minutes: u.duration_minutes as number | null,
          kategoria: u.category as string | null,
        };
        const czas = czasUslugi(usluga, ustawienia.domyslny_czas_wizyty_min);
        const od = usluga.cena_od, do_ = usluga.cena_do;
        // price_to = 0 znaczy „nie podano", nie „za darmo" — tak wypełnia to panel.
        const maCene = typeof od === "number" && od > 0;
        const widelki = maCene && typeof do_ === "number" && do_ > 0 && do_ !== od;
        return {
          nazwa: usluga.nazwa,
          cena: maCene
            ? {
              od, do: widelki ? do_ : od, typ: widelki ? "widelki" : "stala",
              // GOTOWE DO PRZECZYTANIA. Model przeliczał liczbę na słowa i pomylił
              // się: przy widełkach 150-250 powiedział „do TRZYSTU złotych".
              // Konwersja i odmiana to zadania dla kodu (zasada 24).
              do_powiedzenia: cenaDoWypowiedzenia(od as number, widelki ? (do_ as number) : null),
              do_powiedzenia_en: cenaDoWypowiedzeniaEn(od as number, widelki ? (do_ as number) : null),
              ...(jezykSlow
                ? { [`do_powiedzenia_${jezykSlow}`]: cenaDoWypowiedzeniaSlow(od as number, widelki ? (do_ as number) : null, jezykSlow) }
                : {}),
            }
            : null,
          czas_blokady_min: czas.czas_blokady_min,
          czas_znany: czas.czas_znany,
          czas_do_powiedzenia: czas.czas_znany ? czasDoWypowiedzenia(czas.czas_blokady_min) : null,
          czas_do_powiedzenia_en: czas.czas_znany ? czasDoWypowiedzeniaEn(czas.czas_blokady_min) : null,
          ...(jezykSlow && czas.czas_znany
            ? { [`czas_do_powiedzenia_${jezykSlow}`]: czasDoWypowiedzeniaSlow(czas.czas_blokady_min, jezykSlow) }
            : {}),
          ostatni_start: hhmm(ostatniStart(zamkniecieTypowe, czas.czas_blokady_min, najpozniejszePrzyjecie)),
          // USŁUGA DŁUŻSZA NIŻ POŁOWA DNIA ROBOCZEGO MUSI ZACZĄĆ SIĘ RANO.
          // Ceramika i folie ochronne trwają cały dzień albo dwa — proponowanie
          // ich na popołudnie to obietnica, której warsztat nie dotrzyma.
          // Pole mówi agentowi wprost, zamiast kazać mu liczyć.
          tylko_od_otwarcia: czas.czas_blokady_min * 2 > (minuty(zamkniecieTypowe) - minuty(
            (godzinyTygodnia["mon"] || GODZINY_ZAPASOWE).open)),
          kategoria: usluga.kategoria || null,
        };
      });

      const dopasowany = (klient.data || []).find((c: Record<string, unknown>) =>
        tylkoCyfry(c.phone) === callerId) as Record<string, unknown> | undefined;

      // AKTYWNE REZERWACJE DZWONIĄCEGO. Potrzebne, żeby agent wiedział, że klient
      // MA już wizytę — bez tego na „chcę przełożyć" założyłby drugą (ta sama klasa
      // co wants_cancel, który był wykrywany i przez nikogo nieczytany).
      // Dopasowanie po telefonie z sygnalizacji, nie po nazwisku.
      const rezerwacjeKlienta = callerId
        ? (zajete.data || [])
          .filter((b: Record<string, unknown>) =>
            tylkoCyfry(b.phone) === callerId && String(b.status || "") !== "cancelled")
          .slice(0, 3)
          .map((b: Record<string, unknown>) => ({
            data: String(b.appointment_date),
            godzina: String(b.appointment_time || "").slice(0, 5),
          }))
        : [];

      return {
        wersja: 1,
        firma: {
          nazwa: (p?.short_name || p?.company_name || "") as string,
          adres: [p?.company_address, p?.company_city].filter(Boolean).join(", "),
        },
        ustawienia,
        dni: dniZAngielskim,
        uslugi: uslugiOut,
        zasoby: zasoby.map((z) => ({ nazwa: z.nazwa, typ: z.typ })),
        klient: {
          caller_id_znany: !!callerId,
          imie: (dopasowany?.first_name as string) || null,
          aktywne_rezerwacje: rezerwacjeKlienta,
        },
        branza: { rodzaj: "warsztat" },
      };
    };

    // BUDŻET. Przekroczenie NIE jest błędem — rozmowa startuje bez snapshotu.
    const snapshot = await Promise.race([
      zbuduj(),
      new Promise<null>((r) => setTimeout(() => r(null), BUDZET_MS)),
    ]);
    if (!snapshot) return pusty("przekroczony budżet 300 ms albo brak konfiguracji agenta");

    const tekst = JSON.stringify(snapshot);
    console.info("[voice-agent-init]", JSON.stringify({
      event: "snapshot", ms: Math.round(performance.now() - started),
      dni: snapshot.dni.length, uslugi: snapshot.uslugi.length,
      zasoby: snapshot.zasoby.length, znakow: tekst.length,
      caller_znany: snapshot.klient.caller_id_znany,
    }));
    // Odpowiedź w kształcie WYMAGANYM przez ElevenLabs — bez dodatkowych pól.
    // `_ms` (czas budowy) dokładamy WYŁĄCZNIE przy ręcznym wywołaniu z ?debug=1,
    // żeby nie ryzykować odrzucenia zdarzenia przez ściślejszy parser.
    const debug = new URL(req.url).searchParams.get("debug") === "1";
    return json({
      type: "conversation_initiation_client_data",
      dynamic_variables: {
        rido_snapshot: tekst,
        rido_caller_znany: snapshot.klient.caller_id_znany ? "tak" : "nie",
      },
      ...(debug ? { _ms: Math.round(performance.now() - started) } : {}),
    });
  } catch (e) {
    // Awaria budowy snapshotu nie może przerwać odbierania połączenia.
    console.error("[voice-agent-init]", JSON.stringify({ event: "blad", msg: (e as Error).message }));
    return pusty("wyjątek: " + (e as Error).message);
  }
});
