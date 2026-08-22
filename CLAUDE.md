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

Szukaj kodu sprawdzającego **samą obecność**, nie kodu czytającego treść wiersza.
To inne zapytanie i łatwiej je przeoczyć — czytający treść zwykle i tak ma gałąź
na `null`, sprawdzający obecność traktuje ją jako znaczącą.

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

Pilnuje tego `scripts/sql-harness/sprawdz_uprawnienia_funkcji.py` (bramka w CI, zadanie
„Czy nowa funkcja odcina anon i authenticated"). Funkcje tylko odczytujące są na liście
wyjątków z uzasadnieniem — dopisanie tam czegoś jest decyzją, nie formalnością.

Kontrola jest statyczna. Stan faktyczny sprawdza się zapytaniem:

```sql
SELECT p.proname, has_function_privilege('anon', p.oid, 'EXECUTE')
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.prosecdef;
```

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
