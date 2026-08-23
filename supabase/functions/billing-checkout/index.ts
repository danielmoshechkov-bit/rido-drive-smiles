// Rozpoczęcie płatności za subskrypcję — sesja Stripe Checkout.
//
// Ta funkcja NIE zakłada subskrypcji w naszej bazie. Robi to dopiero webhook
// (podetap 4.6) po potwierdzeniu płatności przez operatora. Jedno źródło prawdy:
// subskrypcja istnieje wtedy, gdy pieniądze doszły, a nie wtedy, gdy ktoś
// kliknął „kupuję" i zamknął kartę na stronie płatności.
//
// Brama: zalogowany użytkownik. Podmiot (`subscriber_id`) ustalamy PO STRONIE
// SERWERA z `service_providers.user_id`, nigdy z ciała żądania — inaczej każdy
// mógłby opłacić subskrypcję cudzemu warsztatowi albo, co gorsza, przypisać
// sobie cudzą.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders } from "../_shared/cors.ts";
import { buildPublicUrl } from "../_shared/publicUrl.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

const STRIPE_API = "https://api.stripe.com/v1";

async function stripe(key: string, path: string, form?: Record<string, string>): Promise<any> {
  const res = await fetch(`${STRIPE_API}${path}`, {
    method: form ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form ? new URLSearchParams(form).toString() : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || `Stripe ${res.status}`);
  return data;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const accessToken = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
    if (!accessToken) return json({ error: "Musisz być zalogowany." }, 401);

    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    });
    const { data: userData } = await userClient.auth.getUser(accessToken);
    const caller = userData?.user;
    if (!caller) return json({ error: "Musisz być zalogowany." }, 401);

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) {
      // Fail-closed: bez bramki nie udajemy, że płatność ruszyła.
      console.error("billing-checkout: brak STRIPE_SECRET_KEY");
      return json({ error: "GATEWAY_NOT_CONFIGURED" }, 503);
    }

    const body = await req.json().catch(() => ({})) as Record<string, any>;
    const planCode = String(body?.plan_code ?? "").trim();
    if (!planCode) return json({ error: "Brak kodu planu" }, 400);

    // Okres rozliczeniowy. Cokolwiek innego niż „rok" znaczy miesiąc — nie
    // zgadujemy i nie odmawiamy, bo brak pola to po prostu starsze wywołanie.
    const okresRok = String(body?.okres ?? "miesiac").trim() === "rok";

    // ---- plan ----
    const { data: plan, error: planErr } = await admin
      .from("billing_plans")
      .select("id, code, name, product_line, price_net, is_active, is_custom, stripe_price_id, stripe_price_id_rok")
      .eq("code", planCode)
      .maybeSingle();
    if (planErr) throw planErr;
    if (!plan || !plan.is_active) return json({ error: "Plan niedostępny" }, 404);
    if (plan.is_custom) return json({ error: "Ten plan wyceniamy indywidualnie — napisz do nas." }, 400);
    /**
     * Plan darmowy NIE jest tu odrzucany. Wybór planu darmowego przez klienta,
     * który ma abonament, znaczy „anuluj mi subskrypcję" — i to jest operacja,
     * którą trzeba wykonać, a nie odmówić. Odmawiamy niżej, dopiero gdy okaże
     * się, że nie ma czego anulować.
     */
    const planDarmowy = Number(plan.price_net) === 0;
    /**
     * Cena w Stripe zależy od OKRESU, bo obiekty Price są tam niezmienne
     * i każdy okres ma własny. Zakłada je synchronizacja cennika — jeśli
     * roczna nie istnieje, mówimy to wprost zamiast po cichu sprzedawać
     * miesiąc komuś, kto wybrał rok.
     */
    const cenaStripe = okresRok ? plan.stripe_price_id_rok : plan.stripe_price_id;
    if (!planDarmowy && okresRok && !plan.stripe_price_id_rok) {
      return json({
        error: "Ten plan nie ma jeszcze ceny rocznej. Wybierz miesiąc albo odezwij się do nas.",
        code: "PLAN_ROK_NOT_SYNCED",
      }, 409);
    }
    if (!planDarmowy && !plan.stripe_price_id) {
      // Plan po zmianie ceny czeka na resynchronizację — lepiej odmówić niż
      // obciążyć klienta kwotą, której nie ma już w cenniku.
      return json({ error: "Plan wymaga synchronizacji ze Stripe", code: "PLAN_NOT_SYNCED" }, 409);
    }

    // ---- podmiot: wyłącznie z serwera ----
    const { data: providers, error: provErr } = await admin
      .from("service_providers")
      .select("id, company_name")
      .eq("user_id", caller.id)
      .order("created_at", { ascending: true });
    if (provErr) throw provErr;
    if (!providers?.length) {
      return json({ error: "To konto nie ma jeszcze warsztatu.", code: "NO_PROVIDER" }, 409);
    }
    // Do czasu przełącznika podmiotu (4.1) bierzemy najstarszy warsztat konta.
    const provider = providers[0];

    // ---- już opłacone? ----
    // Schemat dopuszcza jedną aktywną subskrypcję na linię produktową i pilnuje
    // tego indeksem. Sprawdzamy wcześniej, żeby klient nie zapłacił za coś,
    // czego baza i tak nie przyjmie.
    //
    // `read_only` ŚWIADOMIE NIE BLOKUJE. To stan po wygasłej karencji, w którym
    // klient widzi ekran „Wybierz plan, aby wrócić do pracy" — i musi móc
    // z niego kupić. Wcześniej ta lista zawierała `read_only`, więc kliknięcie
    // kończyło się komunikatem „masz już aktywną subskrypcję": jedyna ścieżka
    // powrotu prowadziła w ślepy zaułek.
    //
    // Baza na to pozwala: indeks `billing_subscriptions_one_active` obejmuje
    // wyłącznie 'trialing', 'active' i 'past_due', więc nowy wiersz nie wchodzi
    // w konflikt ze starym. Wszędzie, gdzie czytamy subskrypcję, bierzemy
    // najnowszą (`ORDER BY created_at DESC LIMIT 1`) — czyli tę opłaconą.
    // 🔴 NAPRAWIONE 22.08.2026 — TO BLOKOWAŁO CAŁĄ SPRZEDAŻ KARTĄ.
    //
    // Warunek brzmiał `status IN ('trialing','active','past_due')` i był
    // poprawny dokładnie do wariantu A, który dał wiersz `trialing` KAŻDEMU
    // warsztatowi. Od tamtej chwili każdy był „już zasubskrybowany", a klient,
    // który chciał zapłacić, dostawał odmowę 409.
    //
    // Okres próbny i miesiąc kupiony BLIK-iem to stany, z KTÓRYCH klient
    // wychodzi, kupując. Odmawiamy wyłącznie wtedy, gdy naprawdę jest już
    // subskrypcja odnawiana u operatora — bo wtedy druga byłaby podwójnym
    // obciążeniem, a nie zakupem.
    const { data: istniejaca } = await admin
      .from("billing_subscriptions")
      .select("id, status, provider, provider_subscription_id, plan_id, plan_od_nastepnego_okresu")
      .eq("subscriber_type", "service_provider")
      .eq("subscriber_id", provider.id)
      .eq("product_line", plan.product_line)
      .in("status", ["active", "past_due"])
      .eq("provider", "stripe")
      .not("provider_subscription_id", "is", null)
      .maybeSingle();
    if (istniejaca) {
      /**
       * ═══════════════════════════════════════════════════════════════════
       * ZMIANA PLANU — PODMIANA POZYCJI, NIE ODMOWA
       * ═══════════════════════════════════════════════════════════════════
       * Wcześniej stała tu odmowa 409 z komunikatem „zmienisz plan w panelu
       * rozliczeń" — a w panelu rozliczeń nie było czym zmienić. Klient na
       * Standardzie, który chciał Pro, nie miał żadnej drogi.
       *
       * W GÓRĘ OD RAZU: podmieniamy pozycję z `always_invoice`, więc operator
       * wystawia i pobiera RÓŻNICĘ natychmiast. Klient dostaje wyższy plan
       * w tej samej chwili, bo za niego zapłacił.
       *
       * W DÓŁ OD NASTĘPNEGO OKRESU: podmieniamy pozycję z `none`, więc niższa
       * kwota wchodzi dopiero przy najbliższym rachunku, a dostęp zostaje
       * wyższy do końca opłaconego okresu. Nie odbieramy tego, za co klient
       * już zapłacił, i nie zwracamy pieniędzy za niewykorzystane dni —
       * obie strony dostają dokładnie to, na co się umówiły.
       *
       * `plan_id` w naszej bazie przy zejściu NIE ZMIENIA SIĘ. Dostęp liczy
       * się z niego, a odłożony plan siedzi w `plan_od_nastepnego_okresu`
       * i wchodzi przy odnowieniu.
       */
      const { data: obecny } = await admin
        .from("billing_plans")
        .select("id, code, name, price_net, billing_interval, stripe_price_id, stripe_price_id_rok")
        .eq("id", istniejaca.plan_id ?? "")
        .maybeSingle();

      if (!obecny) {
        // Fail-closed: bez wiedzy, co klient ma teraz, nie umiemy powiedzieć,
        // czy to wejście w górę czy zejście — a od tego zależy, czy pobrać
        // pieniądze od razu. Zgadywanie kosztowałoby klienta gotówkę.
        return json({
          error: "Nie umiem odczytać obecnego planu tego warsztatu. Odezwij się do nas.",
          code: "PLAN_OBECNY_NIEZNANY",
        }, 409);
      }

      // KIERUNEK. Najpierw cena planu; przy tym samym planie decyduje okres,
      // bo rok to większa kwota naraz. Porównujemy ceny katalogowe, nie to,
      // co klient płaci — gwarancja ceny dotyczy stawki, nie kolejności planów.
      const obecnyRok = String(obecny.billing_interval ?? "month") === "year";
      const roznicaPlanu = Number(plan.price_net) - Number(obecny.price_net);
      const wGore = roznicaPlanu !== 0
        ? roznicaPlanu > 0
        : (okresRok && !obecnyRok);
      const bezZmiany = roznicaPlanu === 0 && okresRok === obecnyRok;

      /**
       * WYBÓR OBECNEGO PLANU PRZY ODŁOŻONEJ ZMIANIE = WYCOFANIE JEJ.
       *
       * Nie ma osobnego przycisku „wycofaj" i nie ma go być: okno wyboru planów
       * jest jedyną drogą, a ostatni wybór klienta wygrywa. Klient, który
       * 10 września zgłosił zejście na Standard, a 15 września klika Pro,
       * mówi „zostaję na Pro" — i to ma po prostu zadziałać, bez płatności.
       *
       * POZYCJĘ U OPERATORA TRZEBA COFNĄĆ RAZEM Z KOLUMNĄ. Przy zejściu
       * podmieniliśmy ją na cenę niższego planu (bez rachunku, `none`), więc
       * samo wyczyszczenie kolumny zostawiłoby klienta z Pro w naszej bazie
       * i rachunkiem na Standard u operatora. Klient płaciłby mniej, niż ma —
       * to jest dziura w przychodzie, tylko odwrócona.
       */
      if (bezZmiany && istniejaca.plan_od_nastepnego_okresu) {
        const cenaObecnego = obecnyRok ? obecny.stripe_price_id_rok : obecny.stripe_price_id;
        if (!cenaObecnego) {
          return json({
            error: "Nie umiem przywrócić Twojego obecnego planu u operatora. Napisz do nas.",
            code: "BRAK_CENY_OBECNEGO",
          }, 409);
        }

        let subDoCofniecia: any = null;
        try {
          subDoCofniecia = await stripe(stripeKey, `/subscriptions/${istniejaca.provider_subscription_id}`);
        } catch (bladOperatora) {
          console.error(JSON.stringify({
            event: "subskrypcja_nieznana_u_operatora", faza: "wycofanie",
            subskrypcja: istniejaca.provider_subscription_id, provider: provider.id,
            blad: bladOperatora instanceof Error ? bladOperatora.message : String(bladOperatora),
          }));
          return json({
            error: "Twój abonament figuruje u nas jako opłacany kartą, ale operator go nie potwierdza. Napisz do nas, odblokujemy to ręcznie.",
            code: "SUBSKRYPCJA_NIEZNANA",
          }, 409);
        }

        const pozycjaCofana = subDoCofniecia?.items?.data?.[0];
        if (!pozycjaCofana?.id) {
          return json({
            error: "Nie umiem odczytać pozycji subskrypcji u operatora. Napisz do nas.",
            code: "BRAK_POZYCJI",
          }, 409);
        }

        await stripe(stripeKey, `/subscriptions/${istniejaca.provider_subscription_id}`, {
          "items[0][id]": pozycjaCofana.id,
          "items[0][price]": cenaObecnego,
          proration_behavior: "none",
          // Wycofanie zejścia zdejmuje też anulowanie — klient wybrał plan
          // płatny, więc subskrypcja ma dalej żyć. Bez tego wybór planu
          // darmowego, a potem powrót, zostawiłby subskrypcję do skasowania.
          cancel_at_period_end: "false",
        });

        const { error: bladWycofania } = await admin.rpc("billing_wycofaj_zmiane_planu", {
          p_sub_id: istniejaca.id,
        });
        if (bladWycofania) throw bladWycofania;

        console.log(JSON.stringify({
          event: "plan_zmieniony", kierunek: "wycofanie",
          plan: obecny.code, provider: provider.id,
        }));

        return json({
          zmiana: "wycofana",
          plan: obecny.code,
          nazwa_planu: obecny.name,
        });
      }

      if (bezZmiany) {
        return json({
          error: "Ten plan i okres już masz.",
          code: "PLAN_BEZ_ZMIANY",
        }, 409);
      }

      /**
       * PLAN DARMOWY = ANULOWANIE SUBSKRYPCJI, nie podmiana ceny.
       *
       * `cancel_at_period_end` zamiast natychmiastowego skasowania: klient ma
       * opłacony okres i ma go domknąć. Ceny nie ruszamy — subskrypcja ma
       * dożyć swojego końca na dotychczasowej stawce, a potem zniknąć.
       *
       * Skutek uboczny, o którym klient jest uprzedzony w oknie: powrót na plan
       * płatny wymaga podania karty od nowa, bo subskrypcji już nie będzie.
       */
      if (planDarmowy) {
        try {
          await stripe(stripeKey, `/subscriptions/${istniejaca.provider_subscription_id}`, {
            cancel_at_period_end: "true",
          });
        } catch (bladOperatora) {
          console.error(JSON.stringify({
            event: "anulowanie_nieudane",
            subskrypcja: istniejaca.provider_subscription_id, provider: provider.id,
            blad: bladOperatora instanceof Error ? bladOperatora.message : String(bladOperatora),
          }));
          return json({
            error: "Nie udało się anulować subskrypcji u operatora. Napisz do nas — nie chcemy zostawić Cię z obciążeniem, którego nie chcesz.",
            code: "ANULOWANIE_NIEUDANE",
          }, 409);
        }

        const { data: wynikFree, error: bladFree } = await admin.rpc("billing_zaplanuj_zmiane_planu", {
          p_sub_id: istniejaca.id,
          p_plan_id: plan.id,
        });
        if (bladFree) throw bladFree;

        console.log(JSON.stringify({
          event: "plan_zmieniony", kierunek: "anulowanie",
          z: obecny.code, provider: provider.id,
        }));

        return json({
          zmiana: "anulowana",
          plan: plan.code,
          nazwa_planu: plan.name,
          z_planu: obecny.code,
          obowiazuje_od: (wynikFree as any)?.obowiazuje_od ?? null,
        });
      }

      // Pozycja subskrypcji u operatora. Bierzemy ją z odczytu, nie zakładamy
      // że jest jedna i pierwsza — brak pozycji znaczy, że subskrypcja jest
      // w stanie, którego ta ścieżka nie obsługuje, i wtedy odmawiamy zamiast
      // zgadywać, co podmienić.
      let subStripe: any = null;
      try {
        subStripe = await stripe(stripeKey, `/subscriptions/${istniejaca.provider_subscription_id}`);
      } catch (bladOperatora) {
        /**
         * ROZJAZD MIĘDZY NASZĄ BAZĄ A OPERATOREM. Wiersz mówi „subskrypcja
         * odnawiana kartą", a operator jej nie zna — subskrypcja została tam
         * usunięta albo klucz wskazuje na inne środowisko.
         *
         * To jest ślepy zaułek dla klienta: karta prowadzi tutaj, a BLIK
         * odmawia właśnie dlatego, że w bazie stoi karta. Dlatego mówimy wprost,
         * co się stało, zamiast oddawać 500 z komunikatem operatora — „No such
         * subscription" nie znaczy dla klienta nic i wygląda jak awaria.
         */
        console.error(JSON.stringify({
          event: "subskrypcja_nieznana_u_operatora",
          subskrypcja: istniejaca.provider_subscription_id,
          provider: provider.id,
          blad: bladOperatora instanceof Error ? bladOperatora.message : String(bladOperatora),
        }));
        return json({
          error: "Twój abonament figuruje u nas jako opłacany kartą, ale operator go nie potwierdza. Nie zmieniamy planu po omacku — napisz do nas, odblokujemy to ręcznie.",
          code: "SUBSKRYPCJA_NIEZNANA",
        }, 409);
      }

      const pozycja = subStripe?.items?.data?.[0];
      if (!pozycja?.id) {
        return json({
          error: "Nie umiem odczytać pozycji subskrypcji u operatora. Odezwij się do nas.",
          code: "BRAK_POZYCJI",
        }, 409);
      }

      /**
       * `pending_if_incomplete` PRZY WEJŚCIU W GÓRĘ — ODPOWIEDŹ NA PYTANIE
       * „CO, GDY KARTA ODRZUCI RACHUNEK ZA RÓŻNICĘ".
       *
       * Dokumentacja operatora mówi wprost: przy samym `always_invoice`
       * „the subscription change request succeeds and the subscription
       * transitions to past_due" — czyli plan JEST zmieniony, a pieniędzy nie
       * ma. Klient dostawałby wyższy plan za darmo do czasu, aż zauważymy.
       *
       * Z `pending_if_incomplete` operator stosuje zmianę WYŁĄCZNIE po udanej
       * zapłacie. Gdy zapłata się nie uda, oddaje subskrypcję z wypełnionym
       * `pending_update` i nie zmienia niczego. Wtedy my też nie zmieniamy —
       * ani u siebie, ani w komunikacie dla klienta.
       *
       * Zmiana wisi u operatora 23 godziny; potem rachunek jest unieważniany,
       * a zmiana przepada. Zdarzenia `pending_update_applied` i
       * `pending_update_expired` dopina 4/4 — DZIŚ ICH NIE OBSŁUGUJEMY, więc
       * klient, który opłaci rachunek później z panelu operatora, dostanie
       * plan u operatora, a u nas zostanie stary. To jest znany dług, opisany
       * w STAN-PRAC.md, a nie przeoczenie.
       */
      const odpowiedz = await stripe(stripeKey, `/subscriptions/${istniejaca.provider_subscription_id}`, {
        "items[0][id]": pozycja.id,
        "items[0][price]": cenaStripe!,
        // `always_invoice` przy wejściu w górę: różnica idzie na rachunek OD RAZU.
        // `none` przy zejściu: nowa kwota dopiero przy najbliższym odnowieniu.
        proration_behavior: wGore ? "always_invoice" : "none",
        ...(wGore ? { payment_behavior: "pending_if_incomplete" } : {}),
      });

      // Wypełniony `pending_update` znaczy: zapłata NIE przeszła i operator
      // niczego nie zmienił. Nie piszemy planu do bazy i mówimy prawdę.
      if (wGore && odpowiedz?.pending_update) {
        console.warn(JSON.stringify({
          event: "zmiana_planu_bez_zaplaty",
          z: obecny.code, na: plan.code, provider: provider.id,
          wygasa: odpowiedz.pending_update?.expires_at ?? null,
        }));
        return json({
          error: "Karta nie przyjęła płatności za różnicę, więc plan pozostaje bez zmian. Sprawdź kartę w panelu rozliczeń i spróbuj ponownie.",
          code: "ZMIANA_BEZ_ZAPLATY",
        }, 402);
      }

      if (wGore) {
        // Baza dogania stan opłacony. Webhook zrobi to samo, gdy dojedzie —
        // zapis jest ten sam, więc powtórzenie niczego nie psuje, a klient
        // nie czeka na operatora, żeby zobaczyć swój nowy plan.
        const { error: bladZapisu } = await admin
          .from("billing_subscriptions")
          .update({
            plan_id: plan.id,
            plan_od_nastepnego_okresu: null,
            plan_zmiana_zgloszona_at: null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", istniejaca.id);
        if (bladZapisu) throw bladZapisu;

        console.log(JSON.stringify({
          event: "plan_zmieniony", kierunek: "w_gore",
          z: obecny.code, na: plan.code, provider: provider.id,
        }));

        return json({
          zmiana: "natychmiast",
          plan: plan.code,
          nazwa_planu: plan.name,
          z_planu: obecny.code,
        });
      }

      // ZEJŚCIE. Odkładamy w bazie funkcją, która bierze blokadę wiersza —
      // zadanie odnowieniowe może właśnie stosować poprzednią zmianę.
      const { data: wynik, error: bladPlanu } = await admin.rpc("billing_zaplanuj_zmiane_planu", {
        p_sub_id: istniejaca.id,
        p_plan_id: plan.id,
      });
      if (bladPlanu) throw bladPlanu;

      console.log(JSON.stringify({
        event: "plan_zmieniony", kierunek: "w_dol",
        z: obecny.code, na: plan.code, provider: provider.id, wynik,
      }));

      return json({
        zmiana: "od_nastepnego_okresu",
        plan: plan.code,
        nazwa_planu: plan.name,
        z_planu: obecny.code,
        obowiazuje_od: (wynik as any)?.obowiazuje_od ?? null,
      });
    }

    /**
     * PLAN DARMOWY BEZ SUBSKRYPCJI KARTOWEJ.
     *
     * Klient płacący BLIK-iem nie ma czego anulować u operatora — jego okres
     * po prostu się skończy. Zapisujemy jednak wybór, żeby po wygaśnięciu
     * wylądował na planie darmowym, a nie w stanie „miał Pro, nie zapłacił".
     * To są dwie różne sytuacje i mają różne ekrany.
     */
    if (planDarmowy) {
      const { data: zywa } = await admin
        .from("billing_subscriptions")
        .select("id")
        .eq("subscriber_type", "service_provider")
        .eq("subscriber_id", provider.id)
        .eq("product_line", plan.product_line)
        .in("status", ["trialing", "active", "past_due", "read_only"])
        .maybeSingle();

      if (!zywa) {
        return json({
          error: "Nie masz aktywnego abonamentu, więc nie ma czego anulować.",
          code: "NIE_MA_CZEGO_ANULOWAC",
        }, 409);
      }

      const { data: wynikFree, error: bladFree } = await admin.rpc("billing_zaplanuj_zmiane_planu", {
        p_sub_id: zywa.id,
        p_plan_id: plan.id,
      });
      if (bladFree) throw bladFree;

      console.log(JSON.stringify({
        event: "plan_zmieniony", kierunek: "anulowanie_bez_karty",
        provider: provider.id,
      }));

      return json({
        zmiana: "anulowana",
        plan: plan.code,
        nazwa_planu: plan.name,
        obowiazuje_od: (wynikFree as any)?.obowiazuje_od ?? null,
      });
    }

    /**
     * WYCOFANIE ODŁOŻONEJ ZMIANY U KLIENTA BEZ KARTY.
     *
     * Wyżej ta sama zasada obsłużona jest dla subskrypcji kartowej, gdzie trzeba
     * dodatkowo cofnąć pozycję u operatora. Tutaj nie ma czego cofać — wystarczy
     * wyczyścić kolumnę. Bez tej gałęzi klient płacący BLIK-iem, który zgłosił
     * zejście i się rozmyślił, zostałby wysłany do bramki i zapłacił za coś,
     * o co nie prosił.
     */
    {
      // BEZ DOŁĄCZANIA PLANU PRZEZ RELACJĘ. `billing_subscriptions` ma teraz
      // DWA klucze obce do `billing_plans` (`plan_id` i `plan_od_nastepnego_okresu`),
      // więc `plan:billing_plans(...)` jest niejednoznaczne i całe zapytanie pada.
      // Pierwsza wersja połykała ten błąd i szła dalej — klient, który chciał
      // wycofać zmianę, dostawał bramkę płatności. Dlatego błąd jest tu twardy.
      const { data: zywaBezKarty, error: bladZywej } = await admin
        .from("billing_subscriptions")
        .select("id, plan_id, plan_od_nastepnego_okresu")
        .eq("subscriber_type", "service_provider")
        .eq("subscriber_id", provider.id)
        .eq("product_line", plan.product_line)
        .in("status", ["trialing", "active", "past_due", "read_only"])
        .not("plan_od_nastepnego_okresu", "is", null)
        .maybeSingle();
      if (bladZywej) throw bladZywej;

      const tenSamPlan = !!zywaBezKarty && zywaBezKarty.plan_id === plan.id;
      const { data: planObecnyBezKarty } = tenSamPlan
        ? await admin.from("billing_plans").select("billing_interval")
            .eq("id", zywaBezKarty!.plan_id).maybeSingle()
        : { data: null };
      const obecnyRokBezKarty = String(planObecnyBezKarty?.billing_interval ?? "month") === "year";

      if (zywaBezKarty && tenSamPlan && okresRok === obecnyRokBezKarty) {
        const { error: bladWycofania } = await admin.rpc("billing_wycofaj_zmiane_planu", {
          p_sub_id: zywaBezKarty.id,
        });
        if (bladWycofania) throw bladWycofania;

        console.log(JSON.stringify({
          event: "plan_zmieniony", kierunek: "wycofanie_bez_karty",
          plan: plan.code, provider: provider.id,
        }));

        return json({
          zmiana: "wycofana",
          plan: plan.code,
          nazwa_planu: plan.name,
        });
      }
    }

    // ---- klient u operatora ----
    // Szukamy po e-mailu, zanim założymy nowego — inaczej przy drugim zakupie
    // (Warsztat + Agent) klient miałby dwie karty i dwie historie płatności.
    let customerId: string | null = null;
    const znalezieni = await stripe(stripeKey, `/customers?email=${encodeURIComponent(caller.email ?? "")}&limit=1`);
    if (znalezieni?.data?.length) {
      customerId = znalezieni.data[0].id;
    } else {
      const utworzony = await stripe(stripeKey, "/customers", {
        email: caller.email ?? "",
        name: provider.company_name ?? "",
        "metadata[user_id]": caller.id,
        "metadata[provider_id]": provider.id,
      });
      customerId = utworzony.id;
    }

    // ---- sesja ----
    // `session_id` w success_url jest konieczny: webhook potrafi dojechać PO
    // przekierowaniu, więc panel musi mieć czego odpytywać przez chwilę po
    // powrocie. Bez tego klient widzi brak dostępu i płaci drugi raz.
    const sesja = await stripe(stripeKey, "/checkout/sessions", {
      mode: "subscription",
      customer: customerId!,
      "line_items[0][price]": cenaStripe,
      "line_items[0][quantity]": "1",
      success_url: buildPublicUrl("/uslugi/panel?platnosc=ok&session_id={CHECKOUT_SESSION_ID}"),
      cancel_url: buildPublicUrl("/cennik?platnosc=anulowana"),
      client_reference_id: provider.id,
      "metadata[plan_id]": plan.id,
      "metadata[plan_code]": plan.code,
      "metadata[product_line]": plan.product_line,
      "metadata[subscriber_type]": "service_provider",
      "metadata[subscriber_id]": provider.id,
      "metadata[user_id]": caller.id,
      // Te same dane na subskrypcji, nie tylko na sesji: zdarzenia cyklu życia
      // (invoice.paid, subscription.updated) nie niosą metadanych sesji.
      "subscription_data[metadata][plan_id]": plan.id,
      "subscription_data[metadata][subscriber_type]": "service_provider",
      "subscription_data[metadata][subscriber_id]": provider.id,
      "subscription_data[metadata][user_id]": caller.id,
      locale: "pl",
    });

    console.log(JSON.stringify({
      event: "checkout_utworzony",
      plan: plan.code,
      provider: provider.id,
      session: sesja.id,
    }));

    return json({ url: sesja.url, session_id: sesja.id });
  } catch (e: any) {
    console.error("billing-checkout error:", e);
    return json({ error: e?.message ?? "Unknown error" }, 500);
  }
});
