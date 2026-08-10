-- ============================================================================
-- voice-knowledge-sanitize-20260810.sql
--
-- CO TO NAPRAWIA — trzy różne problemy w JEDNYM źródle: voice_agent_knowledge.
-- Tabela jest wstrzykiwana do promptu (RPC get_voice_context: is_active = true,
-- ORDER BY evidence_count DESC, LIMIT 10), a panel jej nie pokazuje.
--
-- SPROSTOWANIE DO WCZEŚNIEJSZEJ DIAGNOZY: reguły o języku NIE są przyczyną
-- angielskiej zapowiedzi w rozmowie qrgbn9cy. Są nieaktywne, więc nigdy nie
-- trafiły do promptu — i powstały 06.08, czyli zostały wydestylowane Z TYCH
-- ROZMÓW. To skutek błędu zapisany jako zalecenie, nie jego przyczyna.
--
-- CZĘŚĆ A — jedyna zmiana o natychmiastowym skutku na rozmowy.
--   Pięć AKTYWNYCH wpisów zawiera przykłady z konkretnymi godzinami, nieaktualną
--   datą i danymi osobowymi prawdziwych klientów. Model recytuje przykład jako
--   fakt. Dowód (rozmowa bj6t2qmm, 06.08):
--     wpis 7bdc7302: "Zaproponuj 2-3 opcje: 'Mamy dostępne 9:00, 11:00 lub 14:00'"
--     agent na 52 s: "Mamy wolne jutro o dziewiątej, jedenastej lub czternastej"
--   Klientka prosiła o ŚRODĘ PRZYSZŁEGO TYGODNIA, a check_availability padł
--   dopiero na 90 s — godziny zostały ZMYŚLONE 38 sekund wcześniej.
--
--   Przy okazji znika z promptu tablica rejestracyjna, numer telefonu i imię
--   prawdziwych klientów, wstrzykiwane dotąd do KAŻDEJ rozmowy.
--
-- CZĘŚĆ B — rozbrojenie miny. Wpisy nieaktywne, więc dziś nic nie robią, ale
--   obiecują rzeczy, których nie robimy: przełączenie do człowieka i tłumacza
--   (temat zamknięty), oddzwonienie, ceny i „bezpłatnie". Wystarczy, że ktoś
--   je włączy w panelu. Kasujemy zamiast dezaktywować, bo destylator i tak
--   wygeneruje je ponownie, jeśli agent znów tak się zachowa — a wtedy chcemy
--   to zobaczyć jako NOWY wpis, nie jako stary włączony.
--
-- Rollback: voice-knowledge-sanitize-20260810-rollback.sql (pełna treść przed).
-- ============================================================================

BEGIN;

-- --- CZĘŚĆ A: przykłady bez konkretów i bez danych osobowych ----------------

-- 7bdc7302 — TEN wpis kazał agentowi zmyślić dostępność.
UPDATE voice_agent_knowledge SET recommended_response =
 'Zaproponuj 2-3 opcje godzin zamiast jednej. Godziny bierz WYŁĄCZNIE z wyniku '
 'check_availability dla dnia, o który prosi klient — nigdy z pamięci ani z przykładu.'
 WHERE id = '7bdc7302-d47a-48c6-bcdb-f796dc7c3f93';

-- 99be4f56 — imię prawdziwego klienta, nieaktualna data, konkretna godzina.
UPDATE voice_agent_knowledge SET recommended_response =
 'Podsumowuj naturalnym tonem, w jednym zdaniu: forma grzecznościowa, marka i model, '
 'ustalony dzień i godzina, zgłoszony problem. Nie czytaj liczb słownie cyfra po cyfrze.'
 WHERE id = '99be4f56-332f-469e-8a2f-ecf93d45bc8d';

-- fc943f39 — tablica rejestracyjna prawdziwego klienta w prompcie.
UPDATE voice_agent_knowledge SET recommended_response =
 'Podsumuj: usługa, pojazd, termin, imię klienta. Każdą pozycję raz. '
 'Nie powtarzaj tego samego zdania wielokrotnie.'
 WHERE id = 'fc943f39-7512-454f-a8d9-840eff09ed0d';

-- 446d5266 — nieaktualna data przykładowa; do tego ta reguła kazała powtarzać
-- pełną datę, co dało cztery powtórzenia w jednej rozmowie.
UPDATE voice_agent_knowledge SET recommended_response =
 'Przy terminie w przyszłym tygodniu podaj dzień tygodnia RAZEM z datą dzienną, '
 'jeden raz, przy potwierdzaniu. Nie powtarzaj daty w kolejnych turach.'
 WHERE id = '446d5266-8fd4-45f8-8e17-680c8acd76aa';

-- 4ce81e63 — fragment prawdziwego numeru telefonu.
UPDATE voice_agent_knowledge SET recommended_response =
 'Czytaj dane naturalnie, grupami, bez rozbijania na pojedyncze cyfry — '
 'chyba że klient wyraźnie o to prosi.'
 WHERE id = '4ce81e63-b532-4490-903a-0601525cbdf3';

-- --- CZĘŚĆ B: kasowanie min --------------------------------------------------
-- Siedem wpisow, wszystkie dzis NIEAKTYWNE. Lista jawna, z powodem przy kazdym —
-- nie wynik wyrazenia regularnego. Wpis 'Komunikacja z klientem mowiacym innym
-- jezykiem' (zachowac profesjonalizm) ZOSTAJE: nic nie obiecuje.
DELETE FROM voice_agent_knowledge WHERE id IN (
  -- Przed zakończeniem rozmowy o umówionej wizycie
  --   powod: obiecuje 30-45 minut i BEZPLATNIE — nie mamy czasow trwania ani cennika w systemie
  'f92f69b1-90b3-48dd-8fd3-5128fefa5396',
  -- Przed potwierdzeniem wizyty
  --   powod: obiecuje 'okolo 30 minut' + imie prawdziwego klienta
  'd53d9912-656b-4c2e-b7d4-d8ed1d39193f',
  -- Gdy klient prosi o zmianę języka
  --   powod: kaze ZAPOWIADAC zmiane jezyka — dokladnie to, czego nie chcemy
  '16f5daf8-4a09-4cdd-a759-8dde1e1f6dba',
  -- Klient prosi o obsługę w innym języku niż polski
  --   powod: obiecuje przelaczenie do kolegi mowiacego po ukrainsku — transfer do czlowieka jest niedostepny
  '2966efc4-7979-4440-9efb-6373d3d4f40b',
  -- Gdy klient mówi w innym języku niż polski
  --   powod: kaze 'wyjasnic poziom bieglosci' i proponowac tlumacza — nie mamy ani jednego, ani drugiego
  '7441fd35-c662-475e-ab87-8ad4ad278270',
  -- Po powitaniu w dowolnym języku
  --   powod: kaze zadac 3 pytania — sprzeczne ze skrocona sekwencja piecioturowa
  'a2422085-abd2-44a9-bfc7-a568905c4b0f',
  -- Przy komunikowaniu problemów technicznych
  --   powod: obiecuje 'czy moge oddzwonic za minute' — agent nie oddzwania
  '34436f55-4e16-4aac-9814-447acec8c401'
);

COMMIT;

-- --- KONTROLA PO WYKONANIU ---------------------------------------------------
-- Ma zwrócić zero wierszy:
--   SELECT id, situation FROM voice_agent_knowledge
--    WHERE is_active = true
--      AND (recommended_response ~ '[0-9]{1,2}:00'
--           OR recommended_response ~* 'czerwca|Danielu|WW[0-9]|pięćset');
