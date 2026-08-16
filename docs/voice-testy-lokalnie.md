# Testy lokalnie — TYM SAMYM poleceniem co CI

```bash
npm run test:voice
```

czyli `deno test --allow-read supabase/functions/_shared/`.

## Dlaczego to jest wpisane osobno

15.08 uruchamiałem testy przez `node --test` i zaraportowałem, że
`weekMapping_test.ts` „pada od wcześniej". **Nieprawda.** Ten test importuje
`https://deno.land/std/assert`, czego Node nie ładuje — ale CI używa **Deno**,
gdzie działa bez zarzutu.

```
node --test supabase/functions/_shared/*_test.ts     165 pass, 1 fail   <- moj runner
deno test --allow-read supabase/functions/_shared/   171 pass, 0 fail   <- CI
```

**Czerwony test, który wszyscy ignorują, jest gorszy niż jego brak** — a ja
sam wyprodukowałem taki fałszywy czerwony i jeszcze go usprawiedliwiłem.

Druga rzecz, poważniejsza: **przez cały dzień pisałem testy, których nie
sprawdziłem w środowisku, które faktycznie bramkuje merge.** Przypadkiem
przechodzą wszystkie — ale to był przypadek, nie kontrola.

## Zasada

**Uruchamiaj testy tym samym poleceniem, co CI.** Inny runner to inny wynik,
a różnica ujawnia się dopiero przy błędzie — czyli w najgorszym momencie.
