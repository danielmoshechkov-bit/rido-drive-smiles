# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project context

GetRido is a Polish-market multi-tenant SaaS that bundles several related portals into a single SPA:
- **Admin / Fleet / Driver** dashboards (the original "RIDO" rental-fleet management core: vehicles, drivers, settlements, fuel, documents)
- **Marketplace** (`/gielda`) — vehicle classifieds with comparison
- **Real estate** (`/nieruchomosci`) — property classifieds + agent panel
- **Services** (`/uslugi`) — service-provider marketplace
- **Accounting / Invoicing** (`/ksiegowosc`, `/faktury`)
- **AI Pro** (`/ai-pro`), **RidoAI** chat, **Meetings**, **RidoMail**, plus insurance & sales portals

All of these share routes inside one `App.tsx`. The default route `/` and `/easy` render `EasyHub` — the universal landing/hub. The catch-all `*` is `NotFound` and must stay last.

This was bootstrapped by [Lovable](https://lovable.dev/) and the Lovable Cloud editor still pushes commits to this repo. Keep this in mind:
- `src/integrations/supabase/client.ts` and `src/integrations/supabase/types.ts` are auto-generated. The types file is ~20k lines and the schema-of-record for the Supabase project. Don't edit either by hand.
- The Supabase URL and anon key are hardcoded in `client.ts` (project ref `wclrrytmrscqvsyxyvnn`); there is no `import.meta.env.VITE_…` in this codebase.
- `lovable-tagger` (a Vite plugin) only runs in dev mode (see `vite.config.ts`).

## Commands

Package manager: npm is the source of truth (`package-lock.json` + CI), though a `bun.lockb` also exists.

```bash
npm install         # install
npm run dev         # Vite dev server on http://localhost:8080 (host '::')
npm run build       # production build → dist/
npm run build:dev   # development-mode build (keeps the Lovable component tagger)
npm run lint        # eslint . — note: @typescript-eslint/no-unused-vars is disabled
npm run preview     # serve the built dist/
```

There is **no test script and no test runner configured**. Don't claim "tests pass" — there are none to run. Verify changes by exercising the UI in the dev server.

Supabase Edge Functions (Deno) live under `supabase/functions/`. They are deployed via Lovable/Supabase, not from this repo's CI. If you need to run one locally you'd use `supabase functions serve <name>`, but the project's normal workflow is to edit and let Lovable deploy.

Deployment to production (`getrido.pl` on LH.pl shared hosting) is the **GitHub Action `.github/workflows/deploy.yml`** — manually triggered via `workflow_dispatch`. It runs `npm run build`, copies `public/.htaccess` and `public/foto-proxy.php` into `dist/`, then FTPs the result. Do not assume merges auto-deploy.

## Architecture

### Frontend stack
- **Vite + React 18 + TypeScript**, SWC via `@vitejs/plugin-react-swc`
- **shadcn-ui** components under `src/components/ui/` (configured in `components.json`, base color `slate`, no prefix). Treat these as vendored — extend rather than reformat.
- **Tailwind** with CSS variables (`hsl(var(--…))`) for all design tokens. Colors, gradients, shadows, and the border radius all come from `--*` variables defined in `src/index.css`. Don't introduce raw hex colors in components — add a token if you need a new one.
- **React Router v6** (single `BrowserRouter` in `App.tsx`)
- **TanStack Query v5** (one `QueryClient` provided at the root)
- **react-hook-form + zod** for forms, **i18next** for translations
- **PWA** via `vite-plugin-pwa` with NetworkFirst caching for the Supabase domain (`supabase-cache`, 24h, 50 entries). When you change Supabase response shapes, remember service workers may serve stale data on next load.
- **Path alias**: `@/*` → `src/*` (`vite.config.ts` + `tsconfig.json`).

### Folder layout (the parts that aren't self-explanatory)
- `src/pages/*` — one file per route, listed in `App.tsx`. Add new routes **above** the `<Route path="*" element={<NotFound />} />` catch-all.
- `src/components/*` — flat top-level files plus topical subfolders (`fleet/`, `marketplace/`, `realestate/`, `services/`, `ai/`, `ai-agents/`, `workshop/`, `accounting/`, `ksef/`, etc.). The subfolder is the source of truth for that domain; the top-level files are older / cross-cutting.
- `src/components/ui/` — shadcn primitives. Reuse, don't reinvent.
- `src/hooks/*` — domain hooks (`useDrivers`, `useCalendar`, `useAIAgent*`, `useUserRole`, `useFeatureToggles`, `useUISettings`, …). When adding data-fetching logic for a new domain, add a hook here rather than fetching inline.
- `src/contexts/*` — only `CompareContext` (marketplace compare list) and `OnboardingContext` are global. Default to TanStack Query, not context, for server state.
- `src/integrations/supabase/` — generated client + types. Always `import { supabase } from "@/integrations/supabase/client"`.
- `src/i18n/` — 7 portal languages (`pl`, `en`, `ru`, `ua`, `kz`, `de`, `vi`) plus a longer translation list. UI defaults to Polish (`fallbackLng: 'pl'`) and many user-visible strings are still hardcoded Polish — that's expected, not a bug.
- `src/utils/`, `src/lib/` — pure helpers (formatters, CSV mapping, contract/invoice HTML generators, watermark, image compression).

### Backend (Supabase)
- 90+ Edge Functions under `supabase/functions/`. The shared CORS headers are in `_shared/cors.ts` — always import and respond to `OPTIONS` with them.
- `supabase/config.toml` lists every function with `verify_jwt = false`. This means **the functions themselves must authenticate / authorize callers** — don't assume the JWT was checked at the gateway. Use the user's access token from the `Authorization` header, then call Supabase with it, or use the service-role key for explicit admin paths.
- 380+ migrations in `supabase/migrations/`. New migrations are filename-prefixed with a UTC-style timestamp (e.g. `20260404_fix_sms_settings.sql`). Don't reorder or edit older ones.
- **RLS is on for everything.** When debugging "missing data" issues, suspect RLS / role filtering before suspecting the query.

### Domain patterns to know

- **Multi-role users.** A single auth user can be admin, fleet owner, driver, marketplace user, insurance agent, etc. Role and feature gating goes through `useUserRole`, `useDelegatedRole`, `useTabPermissions`, `useFeatureToggles`, `useModuleVisibility`, `useOwnerAccess`, and the `FleetRoleDelegationModal` flow. Read these before adding a new permission check.
- **Cascade deletes are manual.** The `drivers` table has FKs from 30+ other tables, and many of them don't have `ON DELETE CASCADE`. Any code that deletes a driver must delete from every dependent table first — see `.lovable/plan.md` for the canonical list and `DriversManagement.tsx` `deleteDriver` for the current implementation. The same care applies to vehicles and fleet accounts. When you add a new table referencing `drivers`/`vehicles`/`fleets`, update the deletion paths.
- **Platform-ID matching for ride-hailing.** Settlement imports (Uber/Bolt/FreeNow CSV → `settlements_weekly`) match rows to drivers via `driver_platform_ids`. If no match and no fuzzy-name hit, **create a new driver record** — silently dropping unmatched rows is a known regression class.
- **Fuel card numbers** are stored with and without leading zeros depending on source (CSV vs. manual entry). When comparing card numbers (e.g. unmapped-card detection), normalize by stripping leading zeros and check both forms.
- **`UISettingsLoader`** (in `App.tsx`) loads admin-configurable UI settings from the DB and applies them as CSS variables on mount. Settings changes are reflected via this hook; don't hardcode what should be themeable.
- **`GlobalRidoAIButton`** and **`OnboardingWidget`** are mounted globally below the route tree — they appear on every page unless the page hides them.
- **AI features** are split between `ai-*` and `ai-agent-*` Edge Functions plus the `src/components/ai/`, `ai-agents/`, `ai-sales/` UI trees. Model selection comes from `src/config/aiModels.ts`. Don't hardcode model names in callers.
- **Localized routes.** URL slugs are Polish (`/gielda`, `/nieruchomosci`, `/uslugi`, `/ksiegowosc`, `/faktury`, `/kierowca-info`, `/sprzedaz`, `/warsztat/klient/:code`, `/umowa/:rentalId`, …). Don't "translate" route paths.

### Build / bundling notes
- Manual chunks in `vite.config.ts` split `vendor` (react/router), `ui` (Radix), and `supabase` — keep imports compatible with that split (don't drag react-dom into a Radix-only file, etc.).
- The PWA caches the Supabase domain NetworkFirst; if you add a different backend host, add a matching `runtimeCaching` rule.
- The `dist/` upload includes `public/foto-proxy.php` — there is a PHP image proxy on the production host used by `foto-proxy` Edge Function callers / marketplace image fetching. Keep it in `public/`.

## Zasady pracy z tym repozytorium (ustalone 21.08.2026)

### Warunek w kodzie i więz w bazie muszą mówić to samo

Najważniejsza rzecz, jaka wyszła z tej sesji. Zmiana jednego bez drugiego nie naprawia
błędu — **przenosi go w gorsze miejsce**.

`billing-checkout` odmawiał zakupu wszystkim, bo sprawdzał obecność wiersza subskrypcji.
Poluzowanie tego warunku wyglądało na całą naprawę. Nie było: webhook robi `INSERT`,
a indeks `billing_subscriptions_one_active` odrzuciłby drugi wiersz. Klient zapłaciłby,
Stripe pobrałby pieniądze, a subskrypcja by nie powstała — **ciche gubienie płatności
zamiast widocznej odmowy**.

Przy każdej zmianie warunku decydującego o zapisie sprawdź, czy baza mówi to samo:

```sql
-- więzy i indeksy na tabeli, którą ruszasz
SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid = 'public.tabela'::regclass;
SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'tabela';
```

Odmowa jest stanem bezpiecznym — widać ją i ktoś ją zgłosi. Zapis, który cicho nie
dochodzi, wychodzi na jaw przy reklamacji.


### Dostęp do bazy produkcyjnej

Dostęp DZIAŁA: `supabase db query --linked -f plik.sql` (project ref `wclrrytmrscqvsyxyvnn`).
Jeśli `Cannot find project ref`, skopiuj `supabase/.temp/` z `/Users/moshechkov/rido-drive-smiles`
— w tym `pooler-url`, bez którego CLI próbuje IPv6 i nie dochodzi.

- **Zapytania sprawdzające** (`SELECT`, diagnostyka, kontrole po migracji, rozpoznania)
  — uruchamiaj SAM. Nie proś użytkownika o klikanie kilkudziesięciu zapytań; podaj wynik
  i wnioski.
- **Migracje i zmiany danych** — nadal wyłącznie przez użytkownika, po pokazaniu treści.
  To nie jest formalność. W jednej sesji kontrole napisane przez asystenta dały fałszywy
  wynik pięć razy (trzykrotnie przy audycie RLS, raz przy porównaniu SHA, raz przy migracji
  kasującej własny wynik pomiaru). Każdy z nich wyszedł przy kolejnym podejściu — ale przy
  migracji ruszającej salda klientów ten jeden krok, w którym człowiek patrzy, co wykonuje,
  jest tańszy niż jego brak.

### Migracja zmieniająca stan bazy unieważnia założenia w kodzie, który jej nie dotyczy

Wariant A dał wiersz w `billing_subscriptions` **każdemu** warsztatowi. `PlanBadge`
w zupełnie innym pliku zakładał, że **brak** tego wiersza znaczy okres próbny:

```ts
if (!szczegoly && dostep.koniecOkresu) {   // ← było prawdą do wariantu A
```

Od migracji warunek jest zawsze fałszywy. Licznik dni zniknął z paska wszystkim
w okresie próbnym — bez błędu, bez ostrzeżenia, bez śladu w logach. Znalazł to
dopiero test na żywym koncie.

**Przy każdej migracji zmieniającej to, CZY wiersz istnieje** (uzupełnienie wsteczne,
zakładanie brakujących wierszy, kasowanie), przejdź po kodzie szukającym **jego braku**:

```
grep -rn "!szczegoly\|=== null\|== null\|IS NULL\|maybeSingle" src/
```

Szukaj kodu sprawdzającego **samą obecność albo brak**, nie kodu czytającego treść
wiersza. To inne zapytanie i łatwiej je przeoczyć — czytający treść zwykle i tak ma
gałąź na `null`, a sprawdzający istnienie traktuje je jako znaczące.

**Trzeba przejść po OBU kierunkach.** Wariant A ugryzł dwa razy, w dwóch przeciwnych
formach:

| Forma | Co się stało | Czym szukać |
|---|---|---|
| „brak wiersza znaczy X" | `PlanBadge` przestał pokazywać licznik okresu próbnego | `grep -rn "!szczegoly\|=== null\|== null\|!dane\|IS NULL" src/ supabase/functions/` |
| „obecność wiersza znaczy Y" | `billing-checkout` odmawiał WSZYSTKIM zakupu kartą | `grep -rn "if (istniejaca\|if (dane\|EXISTS (\|maybeSingle()" src/ supabase/functions/` |

Druga forma jest groźniejsza, bo objawia się odmową, a odmowa wygląda jak zamierzone
zabezpieczenie. Pierwsza tylko czegoś nie pokazuje.


### ⚠️ NAJCZĘSTSZA PRZYCZYNA BŁĘDÓW W TYM PROJEKCIE — policzona

Zmiana w schemacie unieważnia założenie w kodzie, **którego ta zmiana nie dotyczy**.
W jednej sesji (23.08.2026) ten sam wzorzec wystąpił **dziewięć razy**, a 09.09.2026
doszły **dziesiąty i jedenasty**. Żaden inny nie zbliżył się do trzech.

Przykłady, wszystkie tej samej klasy:

| zmiana | co po cichu przestało działać |
|---|---|
| wariant A dał wiersz `trialing` każdemu warsztatowi | `billing-checkout` odmawiał zakupu WSZYSTKIM |
| ta sama zmiana | `PlanBadge` przestał pokazywać licznik okresu próbnego |
| `grant_sms_credits` zaczęła zakładać paczkę | pakiet startowy dawał 60 SMS przy 30 w księdze |
| druga kolumna FK do `billing_plans` | `plan:billing_plans(...)` stało się niejednoznaczne → zapytanie padało → klient chcący WYCOFAĆ zmianę dostawał bramkę płatności |
| `product_line` z wartością domyślną `other` | nowa subskrypcja omijałaby indeks pilnujący jednej aktywnej |
| kolumna `dokanczanie_do` + wyzwalacz na `status` | zapis ustawiający oba naraz cicho gubił termin |
| `trial_ends_at` zakładany przy rejestracji | ostrzeżenie „kończy Ci się dostęp" w środku OPŁACONEGO okresu |
| **(10, 09.09)** `faktura_rodzaj_nabywcy` wszedł jako WARUNEK bramki zakupu | formularz Ustawienia → Zakład pisze te same kolumny, ale znacznika nie ustawia. Klient wpisał NIP, ulicę, miasto i kod, w bazie leżał komplet — a `billing_dane_nabywcy_kompletne` zwracała `false` i zakup był odmawiany. Kolumnę ustawiało WYŁĄCZNIE okno zakupu, o którym formularz nic nie wie |
| **(11, 09.09)** `billing_settings.ksef_enabled` powstała razem ze schematem billingu | nie przeczytał jej NIKT — ani `src/`, ani funkcje brzegowe, ani `pg_proc.prosrc`. Panel pokazywał „KSeF WŁĄCZONE" (to napis z INNEJ flagi, `company_settings`), faktury stały na `not_sent`, a szukający przyczyny trafiał na `ksef_enabled = false` i tracił godzinę na przełączniku, który niczego nie przełącza |

Dziesiąty i jedenasty dołożyły do listy **piąte pytanie**, którego wcześniej nie było:
nowy warunek bramki i nowa flaga to nie to samo, co nowa kolumna. Pytanie „kto to
CZYTA" trzeba zadać w obie strony — kto czyta, ORAZ kto **powinien pisać**, a nie pisze.

**Zanim uznasz zmianę w bazie za skończoną**, przejdź te pytania:

1. **Kto czyta te kolumny?** `grep` po nazwie kolumny w `src/` i `supabase/functions/`.
2. **Co znaczyła PUSTKA, a co ZNACZY TERAZ?** Wiersz, którego wcześniej nie było,
   zmienia sens każdego `maybeSingle()`, `EXISTS` i `IS NULL` w okolicy.
3. **Czy dołożyłeś drugi klucz obcy do tej samej tabeli?** Jeśli tak, każde
   zagnieżdżenie PostgREST po tej relacji przestaje się rozstrzygać i pada.
4. **Czy wartość domyślna nowej kolumny wchodzi w skład indeksu albo warunku?**
5. **Jeśli dokładasz WARUNEK albo FLAGĘ: kto ma go USTAWIAĆ?** Wypisz wszystkie
   miejsca zapisujące sąsiednie kolumny (`grep` po nazwie tabeli, nie po nazwie
   nowej kolumny — ona jeszcze nigdzie nie występuje). Każde z nich, które nie
   ustawi nowego pola, zostawia dane wyglądające na kompletne i odrzucane przez
   bramkę. Jeżeli tych miejsc jest więcej niż jedno, **właściwą naprawą jest
   wyzwalacz w bazie, nie łatka w formularzu** — łatka staje się kolejnym
   miejscem na tę samą decyzję.
6. **Flaga, której nikt nie czyta, jest gorsza niż jej brak.** Zanim ją dołożysz,
   napisz kod, który ją czyta — w tym samym zapisie. Zanim uznasz istniejącą za
   działającą, sprawdź `grep` w `src/`, w `supabase/functions/` **oraz**
   `SELECT proname FROM pg_proc WHERE prosrc ILIKE '%nazwa_flagi%'`.

I najważniejsze: **zapytanie, którego wynik decyduje o pobraniu pieniędzy albo
o dostępie, nie ma prawa cicho zwrócić pustki.** Sprawdzaj `error`, nie tylko `data`.


### Migracja zmieniająca sposób NADAWANIA musi rozstrzygnąć, co z tym, co JUŻ NADANO

Poprawiona funkcja działa od chwili wykonania. Wiersze założone wcześniej zostają
takie, jakie były — i nikt ich nie naprawi, bo migracja przeszła na zielono.

Tak było z pakietem startowym: `20260823120000` usunęła podwójne zakładanie paczki
SMS i naprawiła to skutecznie, ale jedenaście kont założonych kilka godzin wcześniej
dalej miało po 60 SMS-ów przy 30 w księdze. Kontrola w migracji sprawdzała treść
funkcji, więc mówiła „zielono" nad niewyrównanymi danymi.

Każda migracja zmieniająca **jak coś jest nadawane, liczone albo zapisywane** ma
odpowiedzieć na trzy pytania i zapisać odpowiedzi w nagłówku:

1. **Ile wierszy powstało po staremu?** Policzyć zapytaniem, nie oszacować.
2. **Naprawiamy je czy zostawiamy?** Zostawienie bywa słuszne (dane historyczne,
   zbyt mały zasięg), ale ma być decyzją, nie przeoczeniem.
3. **Jeśli naprawiamy — co, gdy stan zdążył się zmienić?** Wyrównanie zna stan,
   który zastaje. Kontrola wstępna ma zatrzymać migrację, gdy zastanie inny,
   zamiast „radzić sobie" arytmetyką, która komuś coś zabierze.

Kontrola sprawdzająca **treść funkcji** nie jest kontrolą **danych**. Potrzebne są obie.


### Lista kolumn w `.select()` musi być JEDNYM literałem

Sklejona z kawałków przez `+` przestaje być typem literalnym, klient Supabase
gubi kształt wiersza i **każde** odwołanie do pola staje się błędem typów
(`Property 'nip' does not exist on type 'GenericStringError'`).

```ts
// ŹLE — osiemnaście błędów typów z jednego plusa
.select(
  "id, name, nip, " +
  // komentarz w środku listy
  "address_city, bank_account",
)

// DOBRZE — jeden literał, komentarz NAD wywołaniem
// Adres i konto są tu, bo składamy z nich nagłówek PDF-u.
.select("id, name, nip, address_city, bank_account")
```

Objaw jest mylący: błędy pokazują się **nie w miejscu sklejenia**, tylko przy
każdym `wiersz.kolumna` w dalszej części funkcji, więc łatwo szukać przyczyny
nie tam, gdzie leży.

To jest pułapka na kogoś, kto zechce „poprawić czytelność": długa lista kolumn
kusi, żeby ją złamać na kilka linii. Jeśli musisz ją opisać, zrób to
komentarzem **nad** wywołaniem — nigdy w środku łańcucha.


### Pusta tabela to nie to samo co nieużywana

Liczba wierszy nie mówi nic o tym, czy kod na tabeli stoi. Zero wierszy znaczy
tylko tyle, że nikt jeszcze nie zapisał — nie że nikt nie czyta.

Uznałem `invoices`, `entities` i sąsiadów za „martwy świat" na podstawie zapytania
`count(*)` i o mało nie zaproponowałem skasowania tabel, na których stoi
**12 plików frontu i 3 funkcje brzegowe** (`invoices`), **15 i 4** (`entities`),
przy `purchase_invoices` z 597 wierszami wiszącymi na `entities` więzem obcym.

Zanim uznasz cokolwiek w bazie za nieużywane, sprawdź **trzy** sygnały:

| sygnał | czym sprawdzić |
|---|---|
| dane | `count(*)` |
| kod | `.from('<tabela>')` w `src/` **i** `supabase/functions/` |
| więzy | `pg_constraint` w obie strony — kto wskazuje i na co wskazuje |

Sam ostatni wystarcza, żeby zatrzymać `DROP`. Sam pierwszy nie wystarcza do niczego.

To ta sama klasa co „brak wiersza znaczy X" wyżej: **wniosek o stanie wyciągnięty
z niewłaściwego sygnału.**


### `REVOKE ... FROM public` NIE odbiera uprawnień `anon` ani `authenticated`

`PUBLIC` w PostgreSQL to osobne uprawnienie domyślne. Supabase nadaje `EXECUTE`
rolom `anon` i `authenticated` **jawnie**, dla każdej funkcji w schemacie `public` —
a odebranie `PUBLIC` tych nadań nie rusza.

Pisaliśmy to kilka razy, za każdym razem uznając sprawę za zamkniętą:

```sql
REVOKE ALL ON FUNCTION public.grant_sms_credits(...) FROM public;   -- NIC NIE ZAMYKA
GRANT EXECUTE ON FUNCTION public.grant_sms_credits(...) TO service_role;
```

Skutek: siedemnaście funkcji `SECURITY DEFINER` zmieniających salda było wywoływalnych
przez zalogowanego klienta, dwanaście nawet bez zalogowania — w tym nadawanie SMS-ów,
dopisywanie kwot do portfela i prowizja z programu poleceń zamkniętego na poziomie tabeli.

**Poprawnie — role wymienione z nazwy:**

```sql
REVOKE ALL ON FUNCTION public.nazwa(...) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.nazwa(...) TO service_role;
```

**Wzorzec w repozytorium poprawiony wstecz.** Trzydzieści siedem wystąpień `FROM public;`
w wykonanych już migracjach zostało przepisanych na poprawną formę — świadomy wyjątek od
zasady „nie edytuj starych migracji". Powód: reguła w dokumentacji nie dociera do kogoś,
kto kopiuje istniejący kod, a wzorzec kopiuje się sam. Zmiana nie rusza semantyki: te
migracje są zastosowane, a poprawiona linijka robi to, co zawsze deklarowała.

Pilnuje tego `scripts/sql-harness/sprawdz_uprawnienia_funkcji.py` (bramka w CI, zadanie
„Czy nowa funkcja odcina anon i authenticated"). Funkcje tylko odczytujące są na liście
wyjątków z uzasadnieniem — dopisanie tam czegoś jest decyzją, nie formalnością.

Kontrola jest statyczna. Stan faktyczny sprawdza się zapytaniem:

```sql
SELECT p.proname, has_function_privilege('anon', p.oid, 'EXECUTE')
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.prosecdef;
```

### Migracja zmieniająca FUNKCJĘ i zakładająca WIĘZ to dwie migracje

10.09.2026: `20260909162228` zmieniała wyzwalacz i zakładała indeks unikalny —
w jednej transakcji. Indeks padł na danych zastanych (dwie aktywne faktury
o tym samym numerze u klienta), więc **wycofała się także poprawka wyzwalacza**.
Uruchomienie zwróciło „Success, no rows returned", a przez dobę wyglądało to
na stan wdrożony.

Kroki w migracji dzielą się na dwa rodzaje:

| rodzaj | przykład | czy może paść |
|---|---|---|
| **zmiana kodu** | `CREATE OR REPLACE FUNCTION`, `CREATE TRIGGER` | praktycznie nie |
| **więz na danych** | `CREATE UNIQUE INDEX`, `ADD CONSTRAINT`, `SET NOT NULL` | **tak — zależnie od tego, co jest w tabelach** |

Trzymane razem, drugi rodzaj cofa pierwszy. **Rozdzielaj: najpierw funkcje,
potem porządkowanie danych, na końcu więzy.** Więz zakładaj migracją, która
NAJPIERW sprawdza, czy dane na to pozwalają, i odmawia z wypisaną listą —
zamiast padać na komunikacie o kluczu.

**„Success" nie jest dowodem, że zmiana weszła.** Dowodem jest sprawdzenie
SKUTKU — najlepiej z osobnego uruchomienia. Dla funkcji w bazie służy do tego
`scripts/sql-harness/sprawdz_dryf_funkcji.py`: funkcja brzegowa ma SHA i da się
ją porównać z `main`, funkcja w bazie nie ma nic.

### Bramka, która krzyczy na dobry kod, uczy ignorowania siebie

Kontrola ma dwa sposoby na bycie bezużyteczną. Pierwszy jest znany: nie zapala
się nigdy. Drugi jest gorszy, bo wygląda na działanie: **zapala się zawsze**.

Dwa przypadki z tego repozytorium:

- Codzienna kontrola „Zgodność produkcji z main" zgłasza **wszystkie 190 funkcji**
  jako rozjechane. Sprawdzone: `billing-checkout` pobrany z produkcji jest bajt
  w bajt zgodny z `main`. Zgłoszenie #67 jest pełne tego szumu i **nikt go nie
  czyta** — a prawdziwego rozjazdu nie da się w nim odróżnić.
- Bramka numeracji faktur (10.09.2026) zapaliła się na POPRAWNYM kodzie:
  sprawdzenie `external_payment_ref` ma pełne prawo filtrować po `deleted_at`
  (skasowana faktura zwalnia odnośnik płatności, choć nie zwalnia numeru),
  a warunek szukał `deleted_at` w sąsiedztwie słowa `invoice_number`.

**Reakcją na fałszywy alarm jest ZAWĘŻENIE warunku, nigdy jego rozluźnienie
ani wyłączenie kontroli.** A po zawężeniu trzeba pokazać, że czułość została:

1. **kontrola pozytywna** — wzorzec, o którym wiadomo, że jest zły, nadal jest
   łapany (najlepiej w kilku kształtach),
2. **kontrola odwrotna** — kod, o którym wiadomo, że jest dobry, NIE zapala
   bramki.

Bez punktu 2 zawężenie potrafi zjeść całą czułość i nikt tego nie zauważy —
bo bramka nadal świeci na zielono.

### Test RLS musi zawierać przypadek, który ma PRZEJŚĆ

Sam zestaw odmów niczego nie dowodzi. Jeśli podkład testowy jest zepsuty, baza odmawia
wszystkiego — a test pytający „czy odmówiono" wypada zielono.

Zdarzyło się to dwa razy w jednej sesji:
- audyt RLS z `SET LOCAL ROLE` poza transakcją działał jako superużytkownik i pokazał
  czternaście nieistniejących wycieków,
- `scripts/sql-harness/stub.sql` definiował `auth.uid()` jako `NULL::uuid`, więc polityka
  właściciela nigdy nie pasowała; trzy przypadki testu bramki przeszły z niewłaściwego
  powodu i wyszło to dopiero na przypadku kontrolnym.

Za każdym razem zielony wynik brał się z **niedziałającego narzędzia**, nie z działającego
kodu. Dlatego: każdy test polityk zawiera co najmniej jedną operację, która MA się udać,
i sprawdza, że się udała. Przy `UPDATE`/`DELETE` liczy dotknięte wiersze — polityka
`RESTRICTIVE` filtruje wiersze, nie rzuca wyjątkiem, więc brak błędu nie znaczy sukcesu.

### KSeF sprawdza XML, nie prawo podatkowe

Schemat FA(3) przyjmie fakturę merytorycznie wadliwą, nada jej numer i wystawi
UPO. Zielone KSeF **nie jest** dowodem poprawności dokumentu.

Przykład, na którym to wyszło (13.09.2026): `P_9A` (cena jednostkowa netto) ma
w FA(3) typ `TKwotowy2` z ośmioma miejscami po przecinku. Tymczasem Dyrektor KIS
(interpretacje 12.2025 i 08.2026) rozstrzygnął, że **cena jednostkowa netto
w złotych z dokładnością większą niż dwa miejsca jest niedopuszczalna** — złoty
nie ma nominału mniejszego niż grosz. Faktura z ceną 0,3450 zł przeszłaby przez
KSeF i byłaby wadliwa.

Przy zmianach w generatorze faktur trzeba więc sprawdzić DWIE rzeczy osobno:

| pytanie | czym sprawdzić |
|---|---|
| czy KSeF to przyjmie | walidacja XSD / wysyłka na `integration` |
| czy dokument jest zgodny z prawem | ustawa o VAT art. 106e + interpretacje |

Drugie nie wynika z pierwszego. Wskazane przez KIS wyjście przy cenach poniżej
grosza to **zmiana jednostki miary** — sprzedaż w paczkach, nie zwiększanie
liczby miejsc po przecinku.

### Hak po wczesnym `return` przewraca widok DOPIERO U KLIENTA

13.09.2026 klienci, kierowcy i pracownicy warsztatów nie mogli wejść do systemu.
Jeden objaw („Ten widok się nie wczytał"), dwie niezależne przyczyny tej samej
klasy — hak wywołany ZA wczesnym `return`.

**Numer w komunikacie mówi, w którą stronę:**

| kod | znaczenie | kiedy widać |
|---|---|---|
| **#300** | „Rendered fewer hooks than expected" | wyjście POJAWIŁO się między renderami |
| **#310** | „Rendered more hooks than during the previous render" | wyjście PRZESTAŁO obowiązywać |

**#310 jest podstępniejszy, bo u nas nie wystąpi.** Pierwszy render kończy się
na `if (loading) return <spinner/>` i haków niżej nie ma. Drugi, po wczytaniu
danych, idzie dalej i odpala je wszystkie — React dostaje ich nagle więcej
i przewraca widok. Deweloper z gotowymi danymi w pamięci podręcznej może tego
nie zobaczyć ani razu.

Trzy różne zgłoszenia okazały się przy tym JEDNYM miejscem plus jednym drugim:
`Auth.tsx` po zalogowaniu kieruje na `/klient` **każdego, kto nie ma pasującej
roli** — więc klient i pracownik warsztatu lądowali w tym samym padającym
komponencie. „Trzy widoki, jeden błąd" znaczyło „jeden cel, nie jeden komponent".

**Bramka:** `npm run test:haki` (`scripts/sprawdz-haki.mjs`, zadanie w CI).
Reguła `react-hooks/rules-of-hooks` jest na zerze, więc bramka jest twarda —
w odróżnieniu od pełnego `npm run lint`, który ma ponad cztery tysiące błędów
i jako bramka uczyłby tylko ignorowania siebie.

Bramka ma WŁASNĄ kontrolę pozytywną i przy pierwszym uruchomieniu ta kontrola
PADŁA: kod kontrolny leżał w `/tmp`, a płaska konfiguracja ESLint dopasowuje
reguły po ścieżce, więc plik spoza projektu nie łapał się na
`files: ["**/*.{ts,tsx}"]`. Bramka milczała nad kodem, o którym wiadomo, że jest
zły. Stąd `lintText` ze ścieżką wewnątrz `src/`.

### Błąd renderowania ma zostawić ślad W BAZIE, nie w konsoli klienta

`console.error` zostaje w przeglądarce tego, komu się wywróciło. Ustalenie
przyczyny #310 zajęło dwie rundy pytań o zrzut ekranu, przy ludziach, którzy
w tym czasie nie mogli pracować.

`AppErrorBoundary` zapisuje teraz do `bledy_widoku`: ścieżkę, role, nazwę
komponentu i treść błędu. Role są tam nie dla ozdoby — „nie działa klientom"
i „nie działa kierowcom" to dwa różne zgłoszenia i bez ról nie da się ich
rozróżnić.

Zapis wymaga zalogowania i obejmuje tylko własny wiersz. Tabela zapisywalna
przez `anon` to zaproszenie do zapchania bazy, a ta klasa usterek z definicji
dotyczy zalogowanych.

### Odczyt treści funkcji łapie KOMENTARZE — rozstrzyga uruchomienie

`pg_proc.prosrc` to ciało funkcji **razem z komentarzami**. Zapytanie o wzorzec
trafia więc także w zdanie, które mówi, że tego wzorca NIE MA:

```sql
-- ta kontrola zwraca TRUE dla POPRAWNEJ wersji funkcji
SELECT prosrc LIKE '%deleted_at IS NULL%' FROM pg_proc
WHERE proname = 'prevent_duplicate_invoice_number';
```

…bo poprawna wersja zawiera linię:

```
-- BEZ `AND deleted_at IS NULL` — numer skasowanej faktury pozostaje ZAJĘTY.
```

13.09.2026 na tej podstawie uznaliśmy, że migracja nie weszła. Weszła.

**To trzeci raz w tym projekcie, gdy odczyt mylił, a uruchomienie rozstrzygało**
(wcześniej: `deduct_sms_credit` uznana za cofniętą przez złą heurystykę grep,
`prevent_duplicate_invoice_number` uznana za nadpisaną przez kogoś). Za każdym
razem prawdziwa odpowiedź wyszła z WYKONANIA, nie z czytania.

Kolejność, w jakiej się pyta o stan funkcji:

1. **zachowanie** — zapisz coś i sprawdź, czy baza się zachowała jak trzeba
   (przy `INSERT`/`UPDATE` licz wiersze albo łap wyjątek, nie ufaj brakowi błędu),
2. **porównanie treści z migracją** — `scripts/sql-harness/sprawdz_dryf_funkcji.py`,
   które normalizuje komentarze i białe znaki,
3. **`LIKE` po `prosrc`** — ostatnia deska ratunku, i wtedy z odsianiem
   komentarzy: `regexp_replace(prosrc, '--[^\n]*', '', 'g')`.

### Supabase NIE zapisuje nieudanych logowań ani adresów IP

`auth.audit_log_entries` zawiera wyłącznie: `login`, `logout`, `token_refreshed`,
`token_revoked`, `user_signedup`, `user_recovery_requested`, `user_modified`.
Kolumna `ip_address` jest **pusta**.

Czego się stamtąd NIE dowiesz:
- ile było prób z błędnym hasłem i czyich,
- czy ktoś wpadł na limit prób z jednego adresu,
- z jakiego adresu ktokolwiek się łączył.

Co z tego wynika przy zgłoszeniu „nie mogę się zalogować": obecność wpisów
`login` i `token_refreshed` dla danego konta **dowodzi, że uwierzytelnianie
działa**, i przenosi poszukiwania na to, co dzieje się PO zalogowaniu. Brak
wpisów nie dowodzi niczego — nieudanej próby i tak by tam nie było.

### Sprawdzanie w przeglądarce: karta sterowana narzędziem jest UKRYTA

Zakładka, którą prowadzi rozszerzenie, ma `document.visibilityState === "hidden"`.
Chrome nie odtwarza w niej animacji CSS, więc `animationend` **nigdy nie pada**.

Wszystko, co Radix (i każda inna biblioteka) odmontowuje dopiero po zakończeniu
animacji wyjścia, **zostaje w DOM na zawsze** — widoczne, klikalne, z
`data-state="closed"`. Wygląda dokładnie jak usterka: „karta nie znika po
zamknięciu".

To kosztowało pół sesji przy podpowiedziach dotykowych. Zanim uznasz taki objaw
za usterkę:

```js
document.visibilityState          // "hidden" → animacje nie chodzą
```

I zawsze porównuj z wersją SPRZED zmiany w tym samym przebiegu. Jeśli stara
zachowuje się tak samo, to nie jest regresja, tylko pomiar.

To ta sama klasa co „zielony wynik z niedziałającego narzędzia" wyżej, tyle że
odwrotna: **czerwony wynik z niedziałającego narzędzia.**

### Ukończona praca wraca do `main` tego samego dnia

Lovable pracuje na `main`. Wszystko, co siedzi tylko na gałęzi roboczej, jest dla niego
niewidoczne i przy pierwszej jego edycji może zostać nadpisane. Przez pięć dni sierpnia
2026 nasza praca żyła wyłącznie na `wdrozenie` — i tylko szczęściu zawdzięcza, że przetrwała.

- gałąź robocza służy do pracy **w toku**, nie do przechowywania gotowych zmian,
- po zamknięciu zadania: scalenie do `main` **tego samego dnia**, nie „kiedyś",
- nie zbieraj dwudziestu commitów, żeby scalić je za tydzień,
- jeśli coś nie może iść do `main` od razu — powiedz **dlaczego** i **kiedy** pójdzie.

To samo dotyczy produkcji. Kod wdrożony ręcznie, którego nie ma w `main`, jest zaproszeniem
do nadpisania: **po każdym ręcznym wdrożeniu funkcji brzegowej sprawdź, czy ta sama treść
jest w `main`** — nie w gałęzi roboczej. Porównuj SHA-256 pobranego kodu, nie numer wersji.

### Rejestr migracji nie odpowiada rzeczywistości

`supabase_migrations.schema_migrations` ma najnowszy wpis z 3 sierpnia 2026, a w repozytorium
są 63 nowsze migracje — wszystkie wklejane ręcznie w SQL Editorze, z pominięciem rejestru.
Dopóki to trwa, `db push` i `db reset` uznają je za niewykonane i spróbują nałożyć ponownie.
Przy migracjach zmieniających salda drugie uruchomienie kasuje jednostki klientom.

## Conventions worth following

- New components: TS + functional, use shadcn primitives from `@/components/ui/*`, style with Tailwind tokens (`bg-primary`, `text-foreground`, `border-border`, etc.) — not raw colors.
- Data access: call `supabase` from a hook in `src/hooks/`, wrapped in TanStack Query when it's read-heavy.
- Edge Functions: Deno runtime, `Deno.serve(...)`, always handle `OPTIONS`, return JSON with the shared `corsHeaders`.
- Don't add a new top-level provider in `App.tsx` unless it really needs to wrap the whole tree — many features live behind portal-specific layouts instead.
