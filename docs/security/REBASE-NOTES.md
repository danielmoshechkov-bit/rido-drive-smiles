# Przeniesienie prac A–F na aktualne main — co trzeba wiedzieć

Data: 2026-08-04. Gałąź: `sec/phase-a-f`. Autor przeniesienia: Claude Code (asystent).
**Nic z tej gałęzi nie zostało zmergowane ani wdrożone. Żadna migracja nie została uruchomiona.**

## Skąd ta gałąź

Prace bezpieczeństwa faz A–F powstały w worktree `rido-codex-test` i leżały tam **bez
ani jednego commita** — 336 zmienionych/nowych plików wyłącznie na dysku. Powstały na
bazie `37fb2449`, czyli **203 commity przed** ówczesnym `origin/main` (`d8a1d765`).

Zabezpieczenie przebiegło dwuetapowo:

1. `sec/raw-codex-snapshot` — dosłowny zapis stanu roboczego na jego oryginalnej bazie.
   Nie nadaje się do merge'a; służy wyłącznie temu, żeby nic nie zginęło.
2. `sec/phase-a-f` (ta gałąź) — te same zmiany przeniesione na `origin/main`, plik po pliku,
   3-way merge (baza `37fb2449`, „ours" = `origin/main`, „theirs" = snapshot), w siedmiu
   commitach: po jednym na fazę A–F plus raport zbiorczy.

Z 336 plików 29 było ruszonych po obu stronach. 18 połączyło się automatycznie,
11 wymagało decyzji.

## Gdzie wersja bezpieczeństwa nadpisała nowszą robotę z main

Wymaga ręcznego pogodzenia przed jakimkolwiek merge'em:

| Plik | Co ma main, a czego nie ma wersja bezpieczeństwa |
|---|---|
| `supabase/functions/ksef-integration/index.ts` | rozdzielone tokeny `ksef_token_test` / `ksef_token_production` i wybór środowiska przed wyborem tokenu; wersja bezpieczeństwa zna tylko wspólne `ksef_token` |
| `supabase/functions/voice-agent-chat/index.ts` | 8 hunków nowszej roboty nad agentem głosowym |
| `supabase/functions/voice-agent-llm/index.ts` | 3 hunki |
| `supabase/functions/voice-agent-tools/index.ts` | 3 hunki |

## Gdzie wygrała wersja z main (bo już była bezpieczna)

- `InvoicePreviewModal.tsx` — `handlePrint` w main używa `iframe srcdoc`, nie `document.write`.
  Zmiana bezpieczeństwa (sanitizowany podgląd + `sandbox=""`) została zachowana.
- `WorkshopOrdersList.tsx` — main drukuje potwierdzenie przez `InvoicePreviewModal`
  zamiast wyrzucać surowy HTML do nowej karty. Plik jest identyczny z `origin/main`.
- `ServiceProviderDashboard.tsx` — blok dialogu usług, który sanitizowała faza D, main usunął.
  Sanitizacja pozostałego sinka (`sp.activation.descHint`) została zachowana.

## `supabase/config.toml`

Scalono jako sumę: 174 sekcje z klasyfikacji fazy A **plus** 10 funkcji dodanych w main
już po tych pracach. Te 10 dostało domyślne `verify_jwt = true` (fail-closed), ale
**nie przeszło indywidualnego review**.

## Znane luki — kod z main nieobjęty pracami A–F

### 1. Dziesięć Edge Functions bez klasyfikacji fazy A

`ai-extract-services`, `ai-service-search`, `contact-form`, `fiscal-day-report`,
`fiscal-printer-test`, `fiscal-receipt-session`, `fiscalize-receipt`, `sitemap`,
`submit-category-request`, `workshop-tire-reminders`.

Powstały w main po fazie A, więc nie mają guardu `phaseABlockedResponse` ani wpisu
w `phase-a-edge-function-classification.md`. Celowo **nie** dodano im guardu — to decyzja
klasyfikacyjna dla autora prac, nie mechaniczne przeniesienie (część z nich, jak `sitemap`
czy `contact-form`, jest publiczna z założenia).

Skutek: `npm run test:security:phase-a` zgłasza jeden błąd — test poprawnie wykrywa
te 10 funkcji. Asercja `guarded.length === 131` też wymaga świadomej aktualizacji.

### 2. Dwa nowe wywołania `document.write` w main

- `src/components/workshop/WorkshopTireStorage.tsx:172`
- `src/lib/fiscalCopy.ts:43`

Oba pliki są nietknięte, dokładnie takie jak w `origin/main` (commit `fce99eb0`,
„Przechowalnia opon: przypomnienia o odbiorze faktycznie wychodza"). Omijają centralną
granicę `printHtmlDocument` z fazy D. **To jest realna luka na obecnym `main`, nie artefakt
przeniesienia.** Nie naprawiono jej tutaj, żeby nie mieszać naprawy produkcyjnego kodu
z przenoszeniem prac.

## Stan testów po przeniesieniu

| Zestaw | Wynik |
|---|---|
| `npm run typecheck` | PASS |
| `npm run build` | PASS |
| `test:security:phase-b` / `-c` / `-e` / `-f` | PASS |
| `test:security:phase-a` | 1 błąd — 10 niesklasyfikowanych funkcji (punkt 1 wyżej) |
| `test:security:phase-d` | 3 błędy: 1 realny (`document.write`, punkt 2), 2 nieaktualne asercje odnoszące się do kodu, który main w międzyczasie zmienił lub usunął |

## Czego ta gałąź NIE robi

- Nie została zmergowana do `main` ani nigdzie indziej.
- Nie została wdrożona. Faza A **celowo zwraca 503 ze 131 Edge Functions** — wdrożenie
  jej w obecnej postaci wyłączyłoby większość backendu.
- Żadnej z 10 migracji `20260801*` nie uruchomiono na żadnej bazie.
- Nie wykonano rotacji poświadczeń opisanej w `phase-a-implementation-report.md`,
  sekcja „Rotacja poświadczeń". Ta lista pozostaje otwarta.
- `.env` pozostaje **śledzony w repozytorium** — zmiana `.gitignore` w fazie A tego nie
  cofa, wymaga osobnej, zatwierdzonej operacji (`git rm --cached`) i przeglądu historii.
