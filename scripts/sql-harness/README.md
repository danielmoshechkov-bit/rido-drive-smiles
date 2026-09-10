# Harness do migracji SQL

Powstał 16.08.2026, po tym jak migracja G4 przeszła **trzy przebiegi parsera
składni** i padła na produkcji na `operator does not exist:
billing_product_line = text`.

## Czego uczy ta wpadka

Parser składni (`pglast`/libpg_query) **nie zna schematu**, więc nie sprawdza
typów, istnienia kolumn ani sensu polityk. Zielony parser mówi tylko tyle, że
Postgres to sparsuje — nie że wykona. Nie wolno tego mylić z poprawnością.

## Trzy poziomy kontroli, od najsłabszego

| Poziom | Narzędzie | Co łapie | Czego NIE łapie |
|---|---|---|---|
| 1. składnia | `sprawdz_sql.py` | literówki, niedomknięte bloki, błędy w `plpgsql`, wyrażenia polityk sklejane w tekst | **typy, nazwy kolumn, zachowanie** |
| 2. typy enum | `sprawdz_enumy.py` | porównanie kolumny enumowej z parametrem tekstowym bez rzutowania — dokładnie ta wpadka | inne niezgodności typów |
| 3. wykonanie | lokalny Postgres + `stub.sql` | wszystko powyższe **plus** faktyczne wykonanie i zachowanie polityk | rozjazd namiastki z produkcją |

## Uruchomienie poziomu 3

```bash
brew install postgresql@16
export PATH="/opt/homebrew/opt/postgresql@16/bin:$PATH"
D=/tmp/pgdata; S=/tmp/pgsock; mkdir -p $S
initdb -D $D --locale=C -E UTF8
pg_ctl -D $D -o "-p 55432 -k $S -c listen_addresses=" -l $D/log start

createdb -h $S -p 55432 probny
psql -h $S -p 55432 -d probny -v ON_ERROR_STOP=1 -f scripts/sql-harness/stub.sql
psql -h $S -p 55432 -d probny -v ON_ERROR_STOP=1 -f supabase/migrations/<migracja>.sql
psql -h $S -p 55432 -d probny -f scripts/sql-harness/polityki_wlasciciela.sql
psql -h $S -p 55432 -d probny -f scripts/sql-harness/test_zachowania.sql
psql -h $S -p 55432 -d probny -f scripts/sql-harness/test_rls.sql
psql -h $S -p 55432 -d probny -f scripts/sql-harness/test_liczba.sql
```

## Pułapka, na którą sam wpadłem przy pisaniu testów

`stub.sql` włącza RLS, ale nie zakłada polityk ZEZWALAJĄCYCH — a bez nich
Postgres odmawia wszystkiego. Pierwsza wersja testu pokazywała więc „odmowa"
także dla warsztatu z aktywną subskrypcją i wyglądało to na sukces bramki.
Stąd `polityki_wlasciciela.sql`: odwzorowuje politykę właściciela z produkcji.
**Test, który przechodzi z niewłaściwego powodu, jest gorszy niż brak testu.**

Druga pułapka: przy `UPDATE` i `DELETE` polityka RESTRICTIVE **filtruje wiersze,
nie rzuca wyjątku**. Operacja kończy się bez błędu, tylko nie dotyka niczego.
Test łapiący wyjątki pokaże „przeszło". Dlatego `test_liczba.sql` liczy
`RETURNING`, a nie polega na braku błędu.

## Poziom 4: czy funkcja w bazie to nadal TA WERSJA

`sprawdz_dryf_funkcji.py` — dodany 10.09.2026.

Funkcja brzegowa ma SHA i da się ją porównać z `main`. **Funkcja w bazie nie ma
nic.** Wgrywa się ją raz i nikt potem nie wie, czy tam jest — `CREATE OR REPLACE`
nie zostawia śladu, a PostgreSQL nie zapisuje, kto i kiedy ją podmienił.

Tego dnia wyszło, dlaczego to boli: migracja `20260909162228` **nigdy nie weszła**.
Padała na indeksie unikalnym (dwie AKTYWNE faktury o tym samym numerze na koncie
klienta), więc cała transakcja się wycofywała — razem z poprawioną funkcją.
Przez dobę wyglądało to jak stan wdrożony. Tym samym porównaniem wyszła druga
rozbieżność: `warsztat_tabele_wprost` miała 26 tabel zamiast 29, czyli trzy
tabele przechowalni opon były poza bramką zapisu.

Uruchomienie:

```bash
supabase db query --linked -f - <<'SQL' > /tmp/ciala.json
select p.proname as nazwa, p.prosrc as cialo
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prokind = 'f';
SQL
python3 scripts/sql-harness/sprawdz_dryf_funkcji.py /tmp/ciala.json
```

Porównuje CIAŁO każdej funkcji z **ostatnią** jej definicją w `supabase/migrations/`
(po znaczniku czasu w nazwie pliku). Białe znaki i komentarze nie mają znaczenia,
treść ma. Oddaje kod wyjścia 1 przy rozbieżności.

Mówi też o dwóch rzeczach, o które nikt nie pyta, a warto wiedzieć:
funkcjach, które są w migracjach, a w bazie ich nie ma, i funkcjach, które są
w bazie, a nie ma ich w żadnej migracji (powstały w edytorze SQL albo przez Lovable).

**Czego nie robi:** nie chodzi w CI, bo codzienny przebieg zgodności nie ma
poświadczeń do bazy. Uruchamiaj po każdej sesji wgrywania migracji — to
dziesięć sekund, a jest to jedyna rzecz, która odpowiada na pytanie „czy to,
co wkleiłem, naprawdę tam jest".
