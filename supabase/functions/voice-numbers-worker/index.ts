// ============================================================================
// voice-numbers-worker — KOLEJKA NUMERÓW: aktywacja warsztatu i uzupełnianie puli.
//
// Wołana cronem co minutę. Bierze JEDNO zadanie na przebieg — u operatora zapis
// jest limitowany do 1 na 10 s, więc kolejkowanie w pamięci funkcji brzegowej
// tylko przenosiłoby problem w gorsze miejsce.
//
// TRZY ZASADY, KTÓRE TU MIESZKAJĄ:
//
// 1. WZNAWIAMY DO PRZODU, NIE WYCOFUJEMY. `krok` to ostatni UKOŃCZONY krok.
//    DELETE u operatora przy błędzie skasowałby działający numer płacącego
//    warsztatu, gdyby błąd okazał się fałszywy (429 wygląda jak awaria).
//
// 2. PRZED KAŻDYM ZAKUPEM SPRAWDZAMY, CZY NUMER JUŻ NIE JEST NASZ — także
//    przed pierwszą próbą. Klasyczny przypadek: POST doszedł, odpowiedź nie
//    wróciła. Ponowienie kupiłoby drugi numer; sprawdzenie zamienia to
//    w adopcję.
//
// 3. ZAPIS INTENCJI PRZED ZAPISEM U OPERATORA. Wiersz `voice_numbers` ze
//    statusem `kupowany` powstaje PRZED POST-em, żeby twardy zgon procesu
//    zostawił ślad, co kupowaliśmy. Pieniądze tracimy tylko wtedy, gdy
//    zapomnimy, że numer jest nasz.
// ============================================================================
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { przygotujZakup } from "../_shared/supervoipZakup.ts";
import { dopasujStrefe, type Strefa } from "../_shared/voiceRegiony.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const SV = "https://restapi.supervoip.pl";
const EL = "https://api.elevenlabs.io/v1";
const MAX_PROB = 5;
const BACKOFF_MIN = [1, 2, 4, 8, 16];

// ---------------------------------------------------------------- operator --
async function svGet(sciezka: string) {
  const r = await fetch(SV + sciezka, {
    headers: { Authorization: `Bearer ${Deno.env.get("SUPERVOIP_API_KEY")}`, Accept: "application/ld+json" },
  });
  const t = await r.text();
  if (!r.ok) throw new Error(`GET ${sciezka} → ${r.status}: ${t.slice(0, 200)}`);
  return t ? JSON.parse(t) : null;
}
/** Zapis do operatora. Osobna funkcja, żeby każdy zapis był widoczny w kodzie. */
async function svZapis(metoda: "POST" | "PUT", sciezka: string, cialo: unknown) {
  const r = await fetch(SV + sciezka, {
    method: metoda,
    headers: {
      Authorization: `Bearer ${Deno.env.get("SUPERVOIP_API_KEY")}`,
      "Content-Type": "application/ld+json", Accept: "application/ld+json",
    },
    body: JSON.stringify(cialo),
  });
  const t = await r.text();
  if (!r.ok) throw new Error(`${metoda} ${sciezka} → ${r.status}: ${t.slice(0, 300)}`);
  return t ? JSON.parse(t) : null;
}
const pozycje = (o: Record<string, unknown> | null) =>
  (o?.["hydra:member"] as unknown[]) ?? (o?.member as unknown[]) ?? [];

// -------------------------------------------------------------- ElevenLabs --
async function el(sciezka: string, init?: RequestInit) {
  const r = await fetch(EL + sciezka, {
    ...init,
    headers: { "xi-api-key": Deno.env.get("ELEVENLABS_API_KEY") ?? "", "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const t = await r.text();
  if (!r.ok) throw new Error(`${init?.method ?? "GET"} ${sciezka} → ${r.status}: ${t.slice(0, 300)}`);
  return t ? JSON.parse(t) : null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const podany = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  const oczekiwany = Deno.env.get("VOICE_LLM_TOKEN") || "";
  if (!oczekiwany || podany !== oczekiwany) return json({ error: "unauthorized" }, 401);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const log = (event: string, extra: Record<string, unknown> = {}) =>
    console.info("[voice-numbers-worker]", JSON.stringify({ event, ...extra }));

  // POBRANIE I ZAJĘCIE ZADANIA W JEDNEJ OPERACJI (voice_pobierz_zadanie).
  //
  // Poprzednio były to dwa zapytania: `select ... limit 1`, a potem
  // `update status='w_toku'`. Między nimi jest okno. Cron chodzi co minutę,
  // a przebieg czekający na operatora potrafi trwać dłużej niż minutę — więc
  // dwa przebiegi brały TO SAMO zadanie. Przy zadaniu, które kupuje numer,
  // to są prawdziwe pieniądze wydane dwa razy.
  //
  // Funkcja używa FOR UPDATE SKIP LOCKED: wiersz zajęty przez inny przebieg
  // jest pomijany, a nie oczekiwany.
  const { data: zadanie, error: bladPobrania } = await admin.rpc("voice_pobierz_zadanie");
  if (bladPobrania) {
    console.error("[voice-numbers-worker] odczyt kolejki nieudany:", bladPobrania.code, bladPobrania.message);
    return json({ error: "odczyt kolejki nieudany" }, 500);
  }
  // ZAWSZE zostawiamy ślad przebiegu, także pustego (zasada 37): „brak zadań"
  // widziane co minutę znaczy, że worker chodzi. Cisza nie znaczy nic.
  if (!zadanie) { log("przebieg", { zadan: 0 }); return json({ ok: true, zadan: 0 }); }

  const { data: ust } = await admin.from("voice_pula_ustawienia").select("*").eq("id", true).maybeSingle();
  const ustawienia = ust ?? { prog_wolnych: 2, max_zakupow_na_dobe: 3, pierwszy_zakup_zrobiony: false };

  const zapiszKrok = (krok: string) =>
    admin.from("voice_number_jobs").update({ krok, updated_at: new Date().toISOString() }).eq("id", zadanie.id);

  const historia = (wiersz: Record<string, unknown>) => admin.from("voice_number_events").insert(wiersz);

  try {
    let wynik: Record<string, unknown> = {};
    if (zadanie.typ === "uzupelnienie_puli") wynik = await uzupelnijPule();
    else if (zadanie.typ === "aktywacja") wynik = await aktywuj();
    else if (zadanie.typ === "rekoncyliacja") wynik = await rekoncyliacja();
    else throw new Error(`nieznany typ zadania: ${zadanie.typ}`);

    if (wynik.odroczone) {
      // Odroczenie NIE JEST porażką i nie zużywa prób — inaczej „czekam
      // na wolny numer" wyczerpałoby limit i zadanie wylądowałoby
      // w `wymaga_uwagi`, choć nic złego się nie stało.
      await admin.from("voice_number_jobs").update({
        status: (wynik.status as string) ?? "oczekuje",
        nastepna_proba: new Date(Date.now() + Number(wynik.za_ms ?? 60_000)).toISOString(),
        ostatni_blad: (wynik.powod as string) ?? null,
        updated_at: new Date().toISOString(),
      }).eq("id", zadanie.id);
      log("odroczone", { id: zadanie.id, typ: zadanie.typ, powod: wynik.powod });
      return json({ ok: true, odroczone: wynik.powod });
    }

    await admin.from("voice_number_jobs").update({
      status: "zrobione", ostatni_blad: null, updated_at: new Date().toISOString(),
    }).eq("id", zadanie.id);
    log("zrobione", { id: zadanie.id, typ: zadanie.typ, ...wynik });
    return json({ ok: true, ...wynik });
  } catch (e) {
    const proby = Number(zadanie.proby ?? 0) + 1;
    const koniec = proby >= MAX_PROB;
    const opoznienie = BACKOFF_MIN[Math.min(proby - 1, BACKOFF_MIN.length - 1)] * 60_000;
    await admin.from("voice_number_jobs").update({
      status: koniec ? "wymaga_uwagi" : "oczekuje",
      proby,
      nastepna_proba: new Date(Date.now() + opoznienie).toISOString(),
      ostatni_blad: String((e as Error).message).slice(0, 500),
      updated_at: new Date().toISOString(),
    }).eq("id", zadanie.id);
    console.error("[voice-numbers-worker] zadanie nieudane:", zadanie.typ, proby, (e as Error).message);
    if (koniec) {
      await admin.from("system_alerts").insert({
        type: "error", category: "system", status: "pending",
        title: "Kolejka numerów: zadanie wymaga uwagi",
        description: `${zadanie.typ} — ${String((e as Error).message).slice(0, 300)}`,
        metadata: { zrodlo: "voice-numbers-worker", job_id: zadanie.id, proby },
      });
    }
    return json({ ok: false, blad: (e as Error).message, proby }, 200);
  }

  // ======================================================= UZUPEŁNIANIE PULI =
  async function uzupelnijPule(): Promise<Record<string, unknown>> {
    const { count: wolnych } = await admin.from("voice_numbers")
      .select("id", { count: "exact", head: true }).eq("status", "wolny");
    if ((wolnych ?? 0) >= Number(ustawienia.prog_wolnych)) {
      return { odroczone: true, powod: `pula pełna (${wolnych}/${ustawienia.prog_wolnych})`, za_ms: 6 * 3600_000 };
    }

    // BEZPIECZNIK DOBOWY. Nie limit biznesowy — ochrona przed własnym błędem.
    const doba = new Date(Date.now() - 24 * 3600_000).toISOString();
    const { count: kupionych } = await admin.from("voice_number_events")
      .select("id", { count: "exact", head: true }).eq("zdarzenie", "kupiony").gte("at", doba);
    if ((kupionych ?? 0) >= Number(ustawienia.max_zakupow_na_dobe)) {
      return { odroczone: true, powod: `bezpiecznik dobowy: ${kupionych} zakupów w 24 h`, za_ms: 3600_000 };
    }

    // PIERWSZY ZAKUP W HISTORII CZEKA NA CZŁOWIEKA.
    if (!ustawienia.pierwszy_zakup_zrobiony) {
      // Alert raz, nie przy każdym przebiegu. Dwadzieścia trzy alerty o tej samej
      // rzeczy uczą zamykać alerty bez czytania — a wtedy przestają być alertami.
      const { count: juzOtwarty } = await admin.from("system_alerts")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending").like("title", "Pierwszy automatyczny zakup%");
      if (!juzOtwarty) await admin.from("system_alerts").insert({
        type: "warning", category: "system", status: "pending",
        title: "Pierwszy automatyczny zakup numeru czeka na zgodę",
        description: "Worker chce po raz pierwszy kupić numer u operatora. Zatwierdź zadanie, "
          + "ustawiając voice_pula_ustawienia.pierwszy_zakup_zrobiony = true i status zadania na 'oczekuje'.",
        metadata: { zrodlo: "voice-numbers-worker", job_id: zadanie.id },
      });
      return { odroczone: true, status: "czeka_na_zgode", powod: "pierwszy zakup wymaga zgody", za_ms: 3600_000 };
    }

    const konto = await svGet("/api/customers/me");
    const strefy = (pozycje(await svGet("/api/regions?country=96&itemsPerPage=200")) as Strefa[])
      .map((s) => ({ id: Number((s as unknown as { id: number }).id), city: String(s.city), prefix: Number(s.prefix) }));

    // Strefę bierzemy z warsztatu, dla którego pula jest uzupełniana — a jeśli
    // zadanie nie wskazuje warsztatu, z tego, który czeka w kolejce aktywacji.
    const provider = zadanie.provider_id ?? (await admin.from("voice_number_jobs")
      .select("provider_id").eq("typ", "aktywacja").in("status", ["oczekuje", "w_toku"])
      .order("created_at", { ascending: true }).limit(1)).data?.[0]?.provider_id ?? null;
    let warsztat: { miasto?: string | null; telefon?: string | null } = {};
    if (provider) {
      const { data: sp } = await admin.from("service_providers")
        .select("company_city, company_phone").eq("id", provider).maybeSingle();
      warsztat = { miasto: sp?.company_city, telefon: sp?.company_phone };
    }
    const strefa = dopasujStrefe(warsztat, strefy);
    if (strefa.droga === "awaryjne") {
      // Warsztat dostaje numer spoza swojego regionu — to ma być WIDOCZNE.
      console.warn("[voice-numbers-worker]", JSON.stringify({
        event: "strefa_awaryjna", provider_id: provider, miasto_warsztatu: warsztat.miasto ?? null,
        skutek: "numer z Warszawy dla warsztatu bez rozpoznanego regionu",
      }));
    }

    const wolne = pozycje(await svGet(
      `/api/numbers?inUse=false&type=normal&itemsPerPage=1&region=${strefa.strefaId}`,
    )) as Array<Record<string, unknown>>;
    if (!wolne.length) return { odroczone: true, powod: `brak wolnych numerów w strefie ${strefa.miasto}`, za_ms: 3600_000 };

    const kandydat = wolne[0];
    const numerIri = String(kandydat["@id"]);
    const cena = {
      miesiecznie: Number((kandydat.servicePrice as Record<string, unknown>)?.pricePerMonth ?? 1.23),
      aktywacja: Number(kandydat.activationPrice ?? 0),
    };
    const pelnyNumer = `48${String(strefy.find((s) => s.id === strefa.strefaId)?.prefix ?? "")}${String(kandydat.number ?? "")}`;

    // ZAPIS INTENCJI PRZED ZAKUPEM.
    await admin.from("voice_numbers").upsert({
      phone_number: pelnyNumer, status: "kupowany",
      supervoip_number_id: String(numerIri.split("/").pop()),
      region: strefa.miasto, koszt_miesieczny: cena.miesiecznie,
    }, { onConflict: "phone_number" });
    await zapiszKrok("intencja");

    // CZY NUMER JUŻ NIE JEST NASZ — przed KAŻDĄ próbą, także pierwszą.
    const juzNasze = pozycje(await svGet(`/api/voip_numbers?itemsPerPage=200`)) as Array<Record<string, unknown>>;
    const adoptowany = juzNasze.find((v) => String(v.number) === numerIri);
    let voipIri: string;
    if (adoptowany) {
      voipIri = String(adoptowany["@id"]);
      await historia({ phone_number: pelnyNumer, zdarzenie: "adoptowany", status_po: "wolny", aktor: "cron",
        szczegoly: { powod: "numer byl juz nasz — POST doszedl, odpowiedz nie wrocila" } });
    } else {
      const { cialo } = przygotujZakup({
        numerIri, sipIri: `/api/sips/${Deno.env.get("SUPERVOIP_SIP_ID") ?? "1291084"}`,
        konto: {
          saldo: Number(konto.accountBalance), mozeKupic: !!konto.canBuyVoipNumber,
          numeryZablokowane: !!konto.voipNumberLock,
        },
        koszt: cena, zamierzone: true,
        powod: `uzupelnienie puli numerow, strefa ${strefa.miasto}`,
      });
      const odp = await svZapis("POST", "/api/voip_numbers", cialo);
      voipIri = String(odp?.["@id"] ?? "");
      await historia({ phone_number: pelnyNumer, zdarzenie: "kupiony", status_po: "wolny", aktor: "cron",
        szczegoly: { strefa: strefa.miasto, droga_strefy: strefa.droga, koszt: cena } });
    }
    await zapiszKrok("zakup");

    // WERYFIKACJA ODCZYTEM, nie po kodzie odpowiedzi.
    const po = await svGet(voipIri);
    if (!po?.phoneNumber) throw new Error(`zakup nie potwierdzony odczytem: ${voipIri}`);

    await admin.from("voice_numbers").update({
      status: "wolny", supervoip_voip_id: String(voipIri.split("/").pop()),
      phone_number: String(po.phoneNumber).replace(/\D/g, "").replace(/^(?!48)/, "48"),
      kupiony_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }).eq("phone_number", pelnyNumer);
    await admin.from("voice_pula_ustawienia").update({ pierwszy_zakup_zrobiony: true }).eq("id", true);
    return { kupiony: po.phoneNumber, strefa: strefa.miasto, droga_strefy: strefa.droga };
  }

  // ============================================================== AKTYWACJA =
  async function aktywuj(): Promise<Record<string, unknown>> {
    const providerId = zadanie.provider_id;
    if (!providerId) throw new Error("zadanie aktywacji bez provider_id");

    // Warsztat, który już ma numer, dostaje ten numer — nigdy drugi.
    const { data: juzMa } = await admin.from("voice_numbers")
      .select("phone_number").eq("provider_id", providerId).eq("status", "aktywny").maybeSingle();
    if (juzMa) return { numer: juzMa.phone_number, uwaga: "warsztat mial juz numer" };

    // KROK 1 — rezerwacja. Warunek na statusie robi z tego operację
    // idempotentną: drugie wywołanie nie zabierze drugiego numeru.
    let numer = zadanie.number_id
      ? (await admin.from("voice_numbers").select("*").eq("id", zadanie.number_id).maybeSingle()).data
      : null;
    if (!numer) {
      // REZERWACJA PRZEZ FUNKCJĘ BAZY, nie przez UPDATE z `limit(1)`.
      //
      // `limit` przy UPDATE to rozszerzenie PostgREST-a. Nie sprawdziłem, czy
      // ogranicza liczbę ZMIENIANYCH wierszy, czy tylko ZWRACANYCH — a jeśli to
      // drugie, pierwsza aktywacja przy pełniejszej puli przypisałaby jednemu
      // warsztatowi wszystkie wolne numery, my zobaczylibyśmy jeden i uznali,
      // że jest dobrze. Do tej pory pula miała jeden numer, więc różnicy nie
      // było widać (zasada 42: sprawdź, co się stanie, gdy zacznie działać).
      const { data: zarezerwowany, error: bladRezerwacji } = await admin
        .rpc("voice_zarezerwuj_numer", { p_provider: providerId });
      if (bladRezerwacji) {
        console.error("[voice-numbers-worker] rezerwacja numeru nieudana:", bladRezerwacji.code, bladRezerwacji.message);
        throw new Error(`rezerwacja numeru: ${bladRezerwacji.message}`);
      }
      if (!zarezerwowany) {
        // Brak wolnego numeru to nie porażka — to znak, że pula ma się uzupełnić.
        //
        // 23505 znaczy „zadanie uzupełnienia już stoi w kolejce" i JEST POPRAWNYM
        // wynikiem. Pierwsza wersja wstawiała bez zabezpieczenia i przy każdym
        // odroczeniu (co 90 s) dokładała kolejne zadanie: po dwudziestu minutach
        // stały 22 identyczne, każde z własnym alertem. Unikalność pilnuje teraz
        // indeks, bo kod sprawdzający przed wstawieniem przy dwóch przebiegach
        // obok siebie wstawi dwa razy.
        const { error: bladPuli } = await admin.from("voice_number_jobs")
          .insert({ typ: "uzupelnienie_puli", provider_id: providerId });
        if (bladPuli && bladPuli.code !== "23505") {
          console.error("[voice-numbers-worker] zlecenie uzupelnienia nieudane:", bladPuli.code, bladPuli.message);
        }
        return {
          odroczone: true,
          powod: bladPuli?.code === "23505"
            ? "czekam na uzupelnienie puli (zadanie juz stoi w kolejce)"
            : "brak wolnego numeru w puli — zlecono uzupelnienie",
          za_ms: 90_000,
        };
      }
      numer = zarezerwowany;
      await admin.from("voice_number_jobs").update({ number_id: numer.id }).eq("id", zadanie.id);
    }
    await zapiszKrok("rezerwacja");

    // KROK 2 — konfiguracja u operatora: numer ma dzwonić na nasze konto SIP.
    await svZapis("PUT", `/api/voip_numbers/${numer.supervoip_voip_id}`, {
      localConnection: true, localConnectionType: "sip",
      localConnectionSIPs: [`/api/sips/${Deno.env.get("SUPERVOIP_SIP_ID") ?? "1291084"}`],
      localConnectionAddPolishPrefix: true, localConnectionCallerIdExtras: null,
    });
    await zapiszKrok("konfiguracja");

    // KROK 3 — czy numer nie jest już w ElevenLabs (POST tam NIE jest idempotentny).
    const lista = await el("/v1/convai/phone-numbers").catch(() => null) ?? await el("/convai/phone-numbers");
    const wPlus = String(numer.phone_number).replace(/^/, "+");
    const istnieje = (Array.isArray(lista) ? lista : lista?.phone_numbers ?? [])
      .find((p: Record<string, unknown>) => String(p.phone_number).replace(/\D/g, "") === String(numer.phone_number));
    let phoneId = istnieje?.phone_number_id;
    if (!phoneId) {
      const utworzony = await el("/convai/phone-numbers", {
        method: "POST",
        body: JSON.stringify({
          phone_number: wPlus, label: `warsztat ${providerId.slice(0, 8)}`, provider: "sip_trunk",
        }),
      });
      phoneId = utworzony?.phone_number_id;
    }
    if (!phoneId) throw new Error("ElevenLabs nie zwrocil phone_number_id");
    await zapiszKrok("import_11l");

    // KROK 4 — przypisanie agenta.
    const agentId = Deno.env.get("ELEVENLABS_AGENT_ID") ?? "agent_8301ky7ve28ee6jsb3h30h11354g";
    await el(`/convai/phone-numbers/${phoneId}`, { method: "PATCH", body: JSON.stringify({ agent_id: agentId }) });
    await zapiszKrok("agent_11l");

    // KROK 5 — weryfikacja OBU stron. Kod odpowiedzi nie jest dowodem.
    const potwierdzenie = await el(`/convai/phone-numbers/${phoneId}`);
    const przypisany = potwierdzenie?.assigned_agent?.agent_id ?? potwierdzenie?.agent_id;
    if (przypisany !== agentId) throw new Error(`agent nieprzypisany po PATCH: ${przypisany ?? "brak"}`);

    await admin.from("voice_numbers").update({
      status: "aktywny", elevenlabs_phone_id: phoneId, elevenlabs_agent_id: agentId,
      supervoip_sip_id: Deno.env.get("SUPERVOIP_SIP_ID") ?? "1291084",
      przypisany_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }).eq("id", numer.id);
    await historia({
      number_id: numer.id, phone_number: numer.phone_number, provider_id: providerId,
      zdarzenie: "przypisany", status_przed: "przypisywany", status_po: "aktywny", aktor: "cron",
    });
    return { numer: numer.phone_number, provider_id: providerId };
  }

  // ========================================================== REKONCYLIACJA =
  async function rekoncyliacja(): Promise<Record<string, unknown>> {
    const uOperatora = (pozycje(await svGet("/api/voip_numbers?itemsPerPage=200")) as Array<Record<string, unknown>>)
      .map((v) => ({ iri: String(v["@id"]), numer: String(v.phoneNumber ?? "").replace(/\D/g, "") }))
      .filter((v) => v.numer);
    const { data: uNas } = await admin.from("voice_numbers").select("phone_number, status");
    const nasze = new Set((uNas ?? []).map((n) => String(n.phone_number).replace(/^48/, "")));

    const sieroty = uOperatora.filter((v) => !nasze.has(v.numer.replace(/^48/, "")));
    const duchy = (uNas ?? []).filter((n) =>
      !uOperatora.some((v) => v.numer.replace(/^48/, "") === String(n.phone_number).replace(/^48/, "")));

    // ŚLAD PRZY KAŻDYM PRZEBIEGU, także zerowym (zasada 37). Alert, który
    // odzywa się wyłącznie przy kłopocie, jest nietestowalny.
    await historia({
      phone_number: "-", zdarzenie: "rekoncyliacja", aktor: "cron",
      szczegoly: { u_operatora: uOperatora.length, u_nas: (uNas ?? []).length, sieroty: sieroty.length, duchy: duchy.length },
    });
    if (sieroty.length || duchy.length) {
      await admin.from("system_alerts").insert({
        type: "warning", category: "system", status: "pending",
        title: "Rekoncyliacja numerów: rozbieżność",
        description: `Sieroty (u operatora, nie u nas): ${sieroty.length}. Duchy (u nas, nie u operatora): ${duchy.length}.`,
        metadata: { zrodlo: "voice-numbers-worker" },
      });
    }
    return { u_operatora: uOperatora.length, u_nas: (uNas ?? []).length, sieroty: sieroty.length, duchy: duchy.length };
  }
});
