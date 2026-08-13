-- ============================================================================
-- voice-knowledge-redact-inactive-20260810.sql
--
-- Druga migracja sanityzacyjna: REDAKCJA, nie kasowanie.
--
-- Pierwsza (voice-knowledge-sanitize-20260810.sql) objęła 5 AKTYWNYCH wpisów
-- i skasowała 7 min. Zostały wpisy NIEAKTYWNE z danymi osobowymi: pełny numer
-- telefonu (cyframi i słownie), imię i nazwisko, dwie tablice rejestracyjne.
--
-- Dziś nic nie robią — kod czyta wyłącznie `is_active = true`. Ale wystarczy,
-- że ktoś kliknie „aktywuj" w panelu i dane wracają do promptu KAŻDEJ rozmowy.
-- To jest jedyny powód, dla którego to robimy.
--
-- REDAKCJA, nie DELETE: treść reguły bywa sensowna („powtórz numer głośno"),
-- wyciąć trzeba tylko dane. Nowe wartości pochodzą z redactPersonalData
-- (_shared/voiceLearningGate.ts) — tej samej funkcji, która od teraz czyści
-- każdy zapis destylatora. Migracja i kod nie mogą się rozjechać.
--
-- Wyniki oglądnięte PRZED i PO na wszystkich wpisach. Test na prawdziwych
-- danych złapał trzy defekty redakcji, wszystkie naprawione przed tą migracją:
--   „[numer telefonu]set osiemdziesiąt trzy"  — alternatywa regexa brała krótszy
--                                               wariant („pięć" przed „pięćset")
--   „w czwartek szó[data]"                    — \w bez flagi u nie obejmuje „ó"
--   „Daniel Moshechkov" przeżywało            — nazwisko poza wołaczem
--
-- Rollback: voice-knowledge-redact-inactive-20260810-rollback.sql
-- ============================================================================

BEGIN;

UPDATE voice_agent_knowledge SET situation = $rd$Klient podaje numer telefonu bez separatorów$rd$, recommended_response = $rd$Powtórz numer głośno: 'Czyli [numer telefonu] - dobrze?'$rd$ WHERE id = '9bd075d4-0ecf-4969-bfdb-4d761bad71ae';
UPDATE voice_agent_knowledge SET situation = $rd$Po potwierdzeniu danych osobowych$rd$, recommended_response = $rd$Zawsze powtórz imię i nazwisko: 'Czyli [imię], dobrze się mówi?' — przed przejściem dalej$rd$ WHERE id = 'd7d1bbb4-8677-4f13-b9ea-f02fa3f8ed45';
UPDATE voice_agent_knowledge SET situation = $rd$Przed zakończeniem rozmowy$rd$, recommended_response = $rd$Powtórzyć wszystkie dane: 'Podsumowując: Daniel, BMW X5, [nr rejestracyjny], piątek [data] o [godzina] — czy wszystko się zgadza?'$rd$ WHERE id = '3cc481c3-f88e-4007-bf60-58bfea7b28de';
UPDATE voice_agent_knowledge SET situation = $rd$Przed zamknięciem rozmowy, gdy klient wyraża brak pytań$rd$, recommended_response = $rd$Zawsze potwierdzić orientacyjny koszt lub zakres cen (np. "Diagnostyka to [kwota], a naprawa zależy od przyczyny"), aby uniknąć niespodzianek i rezygnacji w ostatniej chwili.$rd$ WHERE id = '0c9fc1d6-0e95-4034-be39-f2db5b42ff9c';
UPDATE voice_agent_knowledge SET situation = $rd$Po potwierdzeniu danych kontaktowych$rd$, recommended_response = $rd$Powtórzę dla pewności — numer [numer telefonu], zgadza się?$rd$ WHERE id = '26d57d80-84e1-485f-bbc3-968984c32098';
UPDATE voice_agent_knowledge SET situation = $rd$Gdy klient podaje dane osobowe (imię, nazwisko, telefon)$rd$, recommended_response = $rd$Agent powinien natychmiast potwierdzić każdą część: 'Dziękuję, [imię], numer [numer telefonu] — dobrze zapisałem?'$rd$ WHERE id = '657e8806-aecd-47d2-bc6f-649cfbfb58f1';
UPDATE voice_agent_knowledge SET situation = $rd$Po zarezerwowaniu terminu, przed podsumowaniem$rd$, recommended_response = $rd$Powtórzyć wszystkie usługi, które klient chce wykonać: 'Podsumowując: wymiana oleju i sprawdzenie ogólne BMW X5, jutro o [godzina]'$rd$ WHERE id = '2a120de3-94e0-41ac-a43f-fa0154f62613';
UPDATE voice_agent_knowledge SET situation = $rd$Gdy klient nie jest pewny problemu ('chyba wydaje mi się')$rd$, recommended_response = $rd$Panie [imię], rozumiem — zawieszenie może wydawać się podejrzane. Czy mogę zapytać — słyszy Pan jakieś dziwne odgłosy, czy pojazd się przechyla, czy może czuje Pan miękkość na nierównościach? To pomoże naszemu mechanikowi przygotować się lepiej.$rd$ WHERE id = '92c0d18e-53d6-48fd-b9ea-9d20d3c6e62a';
UPDATE voice_agent_knowledge SET situation = $rd$Podczas zbierania danych$rd$, recommended_response = $rd$Powtarzać każdą informację na głos: '[numer telefonu] — to numer [numer telefonu], dobrze?'$rd$ WHERE id = '6730086b-1660-4ade-a2f5-be9a7c38b486';
UPDATE voice_agent_knowledge SET situation = $rd$Na koniec rozmowy zawsze dokończ pożegnanie$rd$, recommended_response = $rd$Pełne pożegnanie: 'Do widzenia, Panie [imię]! Czekamy na Pana w czwartek [data] o [godzina]. Dziękuję!'$rd$ WHERE id = 'a4b556e3-6009-4a91-89b0-7c018385c3eb';
UPDATE voice_agent_knowledge SET situation = $rd$Po podaniu numeru telefonu przez klienta$rd$, recommended_response = $rd$Agent powinien powtórzyć numer: 'Czyli [numer telefonu] — dobrze zapisałem?'$rd$ WHERE id = 'da7f8212-7dff-4bf2-ae48-fbfcc6b04a58';
UPDATE voice_agent_knowledge SET situation = $rd$Po potwierdzeniu terminu rezerwacji$rd$, recommended_response = $rd$Potwierdzam — czwartek szóstego o [godzina]. Czy zna Pan naszą lokalizację? Mogę podać adres warsztatu i instrukcje dojazdu.$rd$ WHERE id = 'c5de9ebe-2bbb-4a15-917d-2a2fa72cfbb5';
UPDATE voice_agent_knowledge SET situation = $rd$Po otrzymaniu numeru telefonu$rd$, recommended_response = $rd$Powtórzyć numer głośno: 'Panie [imię], potwierdzam: [numer telefonu] — zgadza się?'$rd$ WHERE id = '8f42c893-6ebc-45a6-bf14-caf3cc975eb3';
UPDATE voice_agent_knowledge SET situation = $rd$Na koniec rozmowy$rd$, recommended_response = $rd$Pełne, profesjonalne pożegnanie: 'Do widzenia, czekamy na Pana w czwartek o [godzina]. Dziękujemy!'$rd$ WHERE id = 'c58d0504-97f5-451b-b209-fffdae377305';
UPDATE voice_agent_knowledge SET situation = $rd$Po potwierdzeniu wszystkich danych$rd$, recommended_response = $rd$Podsumuj: 'Potwierdzam — czwartek [data] o [godzina], BMW X5, diagnostyka. Wyślemy SMS. Czy jest jakiś problem, który chciałby Pan, żebyśmy sprawdzili w pierwszej kolejności?'$rd$ WHERE id = '22f698ce-8428-4048-aca1-94a33e46faa5';
UPDATE voice_agent_knowledge SET situation = $rd$Podczas zbierania danych kontaktowych$rd$, recommended_response = $rd$Czytaj numer telefonu z powrotem: '[numer telefonu] — czy dobrze zrozumiałem?'$rd$ WHERE id = 'b4b1d7f0-f3e4-40c0-ada6-b57e2898d59d';
UPDATE voice_agent_knowledge SET situation = $rd$Przed zaproponowaniem konkretnej godziny$rd$, recommended_response = $rd$Zapytać o preferencje: 'Kiedy byłoby dla Pana najwygodniej — rano, czy może po południu?' zamiast od razu proponować [godzina]$rd$ WHERE id = '9b05854f-092f-4a75-ad21-a6b3b50f572e';
UPDATE voice_agent_knowledge SET situation = $rd$Po potwierdzeniu wizyty$rd$, recommended_response = $rd$Agent powinien dodać: 'Przypominamy, że wizyta jest jutro o [godzina]. Proszę przyjechać 10 minut wcześniej. Czy ma Pan jakieś pytania?'$rd$ WHERE id = '0e115705-0ffb-4ff7-9b8a-66ff3ab60ec1';
UPDATE voice_agent_knowledge SET situation = $rd$Po zarezerwowaniu, agent powinien przeczytać numer telefonu z powrotem do potwierdzenia$rd$, recommended_response = $rd$Klient podaje numer → Agent: 'Dziękuję, potwierdzam: [numer telefonu] — czy to poprawnie?'$rd$ WHERE id = '4844143a-e093-4a60-8e25-17ce543aea64';
UPDATE voice_agent_knowledge SET situation = $rd$Po otrzymaniu numeru telefonu od klienta$rd$, recommended_response = $rd$Powtórzyć numer głośno: 'Czyli [numer telefonu] — dobrze?'$rd$ WHERE id = '747d0fa9-33ec-4c70-b141-f75a1c600fc8';
UPDATE voice_agent_knowledge SET situation = $rd$Gdy klient podaje datę, która wydaje się błędna$rd$, recommended_response = $rd$Zamiast kwestionować: 'Dziękuję. Czy chodzi o [data] przyszłego roku? Mogę zarezerwować ten termin' — potwierdzić uprzejmie, nie stawiając klienta w niezręcznej sytuacji$rd$ WHERE id = 'fa7fd34b-2905-4aa4-95ac-c0d7eee75b86';
UPDATE voice_agent_knowledge SET situation = $rd$Po potwierdzeniu terminu i danych pojazdu$rd$, recommended_response = $rd$Panie [imię], aby przygotować się do Pana wizyty — czy mogę potwierdzić numer telefonu? Oraz czy to Lexus CT benzynowy czy hybrydowy? To pomoże nam przygotować odpowiednie narzędzia.$rd$ WHERE id = '414dcf7e-3099-424f-905f-6aa939a32641';
UPDATE voice_agent_knowledge SET situation = $rd$Gdy klient podaje dane pojazdu$rd$, recommended_response = $rd$Potwierdzić każdy element: 'Czyli Toyota Corolla, biała, rejestracja [nr rejestracyjny] — dobrze rozumiem?' Jeśli klient mówi niejasnie ('Zalgaz', 'Nie ma'), zapytać: 'Przepraszam, czy to oznacza, że pojazd jest na gaz? Czy coś jeszcze?'$rd$ WHERE id = 'bb262fc8-caf1-4d5d-8ea3-c37c4684ce93';

COMMIT;

-- --- KONTROLA PO WYKONANIU (ma zwrócić zero, także dla NIEAKTYWNYCH) ---------
--   SELECT count(*) FROM voice_agent_knowledge
--    WHERE coalesce(situation,'')||coalesce(recommended_response,'')
--          ~ '519474583|Moshechkov|pięćset dziewiętnaście|WY996EU|WZ363CN';

