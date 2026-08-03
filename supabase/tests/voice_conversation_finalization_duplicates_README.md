# Test migracji duplikatów rozmów

Ten test jest przeznaczony wyłącznie dla jednorazowej, pustej lokalnej bazy albo izolowanego stagingu, na którym migracja `20260801090000_voice_conversation_finalization.sql` nie została jeszcze zastosowana. Nie uruchamiać na produkcji ani na kopii zawierającej dane klientów.

1. Zastosuj wcześniejsze migracje, kończąc na migracji bezpośrednio poprzedzającej testowaną.
2. Ustaw osobny `VOICE_TEST_DATABASE_URL` i sprawdź ręcznie host/nazwę bazy.
3. Uruchom każdy plik w pojedynczej transakcji (`-1`) i z zatrzymaniem na
   pierwszym błędzie. Jest to wymagane zwłaszcza dla migracji, ponieważ jej
   blokada tabel i tymczasowe mapy duplikatów muszą obejmować cały plik:

   ```text
   psql "$VOICE_TEST_DATABASE_URL" -1 -v ON_ERROR_STOP=1 -f supabase/tests/voice_conversation_finalization_duplicates_fixture.sql
   psql "$VOICE_TEST_DATABASE_URL" -1 -v ON_ERROR_STOP=1 -f supabase/migrations/20260801090000_voice_conversation_finalization.sql
   psql "$VOICE_TEST_DATABASE_URL" -1 -v ON_ERROR_STOP=1 -f supabase/tests/voice_conversation_finalization_duplicates_verify.sql
   ```

Fixture tworzy wyłącznie dwóch syntetycznych providerów o UUID zaczynających się od `90000000` oraz duplikaty rozmowy, transkrypcji i analizy. Starsze wiersze mają celowo niespójne denormalizowane `provider_id`; walidator sprawdza, czy właściciel archiwum jest wyprowadzony z powiązanego `voice_call`, przy zachowaniu pierwotnej wartości w `row_data`. Sprawdza też deterministyczny wybór rekordów, pełną treść, zachowanie relacji drugiego `voice_call` oraz indeksy unikalne. Po sukcesie jawnie usuwa wpisy archiwalne i obu syntetycznych providerów.

Jeśli migracja lub walidacja przerwie się błędem, zachowaj bazę wyłącznie do lokalnej diagnostyki i usuń ją po analizie. Nie próbuj kontynuować rolloutu z częściowo sprawdzonego środowiska.
