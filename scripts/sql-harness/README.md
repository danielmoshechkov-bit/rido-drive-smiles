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
