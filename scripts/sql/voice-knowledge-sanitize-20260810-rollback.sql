-- ROLLBACK voice-knowledge-sanitize-20260810.sql
-- Przywraca treść sprzed zmiany i kasowane wpisy.
BEGIN;

UPDATE voice_agent_knowledge SET recommended_response = $rb$Zaproponuj 2-3 opcje godzin zamiast jednej: 'Mamy dostępne 9:00, 11:00 lub 14:00 — która godzina byłaby najwygodniejsza?'$rb$ WHERE id = '7bdc7302-d47a-48c6-bcdb-f796dc7c3f93';
UPDATE voice_agent_knowledge SET recommended_response = $rb$Używaj naturalnego tonu: 'Panie Danielu, podsumowuję: BMW X5, środa 17 czerwca o 10:00, problem ze stukami w zawieszeniu' zamiast czytania liczb słownie$rb$ WHERE id = '99be4f56-332f-469e-8a2f-ecf93d45bc8d';
UPDATE voice_agent_knowledge SET recommended_response = $rb$Podsumuj USŁUGĘ (wymiana oleju i filtrów), POJAZD (Lexus CT WW621SH), TERMIN (jutro 12:00), IMIĘ klienta. Nie powtarzaj tego samego zdania wielokrotnie.$rb$ WHERE id = 'fc943f39-7512-454f-a8d9-840eff09ed0d';
UPDATE voice_agent_knowledge SET recommended_response = $rb$Zawsze podaj pełną datę: 'To będzie środa, siedemnastego czerwca - zgadza się?' zamiast tylko dnia tygodnia$rb$ WHERE id = '446d5266-8fd4-45f8-8e17-680c8acd76aa';
UPDATE voice_agent_knowledge SET recommended_response = $rb$Czytać dane naturalnie, bez rozbijania na poszczególne cyfry, chyba że klient wyraźnie tego wymaga. Np. 'pięćset dziewiętnaście, cztery siedem cztery, osiemdziesiąt trzy' zamiast 'pięćset dziewiętnaście, cztery siedem cztery, pięćset osiemdziesiąt trzy'.$rb$ WHERE id = '4ce81e63-b532-4490-903a-0601525cbdf3';

-- Skasowane wpisy — odtworzenie:
INSERT INTO voice_agent_knowledge (id, persona_key, provider_id, scope, category, situation, recommended_response, source, is_active)
  VALUES ('16f5daf8-4a09-4cdd-a759-8dde1e1f6dba', 'voice_workshop_secretary', NULL, 'tenant', 'opening', $rb$Gdy klient prosi o zmianę języka$rb$, $rb$Potwierdzić zmianę języka, ale natychmiast przejść do kwalifikacji: 'Tak, oczywiście! Jaki pojazd Pan/Pani posiada i jaka usługa jest Panu/Pani potrzebna?'$rb$, 'distilled', false) ON CONFLICT (id) DO NOTHING;
INSERT INTO voice_agent_knowledge (id, persona_key, provider_id, scope, category, situation, recommended_response, source, is_active)
  VALUES ('198c847c-19c7-426c-a6a4-1ea8b050a687', 'voice_workshop_secretary', NULL, 'tenant', 'style', $rb$Komunikacja z klientem mówiącym innym językiem$rb$, $rb$Zachować profesjonalizm i pewność siebie; nie przesadnie upraszczać, ale być jasnym i konkretnym$rb$, 'distilled', false) ON CONFLICT (id) DO NOTHING;
INSERT INTO voice_agent_knowledge (id, persona_key, provider_id, scope, category, situation, recommended_response, source, is_active)
  VALUES ('2966efc4-7979-4440-9efb-6373d3d4f40b', 'voice_workshop_secretary', NULL, 'tenant', 'opening', $rb$Klient prosi o obsługę w innym języku niż polski$rb$, $rb$Przepraszam, nie mówię po ukraińsku. Czy mogę Pana/Panią obsłużyć po polsku? Jeśli nie, mogę połączyć Pana/Panią z kolegą, który mówi po ukraińsku, lub mogę wysłać informacje mailowo.$rb$, 'distilled', false) ON CONFLICT (id) DO NOTHING;
INSERT INTO voice_agent_knowledge (id, persona_key, provider_id, scope, category, situation, recommended_response, source, is_active)
  VALUES ('34436f55-4e16-4aac-9814-447acec8c401', 'voice_workshop_secretary', NULL, 'tenant', 'style', $rb$Przy komunikowaniu problemów technicznych$rb$, $rb$Wyjaśnić problem wcześniej: 'Mogę mieć chwilowy problem z systemem — czy mogę oddzwonić za minutę, aby potwierdzić rezerwację?' zamiast informować o tym na koniec$rb$, 'distilled', false) ON CONFLICT (id) DO NOTHING;
INSERT INTO voice_agent_knowledge (id, persona_key, provider_id, scope, category, situation, recommended_response, source, is_active)
  VALUES ('7441fd35-c662-475e-ab87-8ad4ad278270', 'voice_workshop_secretary', NULL, 'tenant', 'opening', $rb$Gdy klient mówi w innym języku niż polski$rb$, $rb$Potwierdzić możliwość komunikacji w tym języku, ale wyjaśnić poziom biegłości. Jeśli agent nie mówi płynnie - zaproponować tłumacza lub przełączenie na polski z potwierdzeniem zrozumienia$rb$, 'distilled', false) ON CONFLICT (id) DO NOTHING;
INSERT INTO voice_agent_knowledge (id, persona_key, provider_id, scope, category, situation, recommended_response, source, is_active)
  VALUES ('a2422085-abd2-44a9-bfc7-a568905c4b0f', 'voice_workshop_secretary', NULL, 'tenant', 'qualifying', $rb$Po powitaniu w dowolnym języku$rb$, $rb$Zawsze zadaj 3 pytania: (1) Jaki pojazd? (2) Jaka usługa/problem? (3) Kiedy potrzebna?$rb$, 'distilled', false) ON CONFLICT (id) DO NOTHING;
INSERT INTO voice_agent_knowledge (id, persona_key, provider_id, scope, category, situation, recommended_response, source, is_active)
  VALUES ('d53d9912-656b-4c2e-b7d4-d8ed1d39193f', 'voice_workshop_secretary', NULL, 'tenant', 'closing', $rb$Przed potwierdzeniem wizyty$rb$, $rb$Panie Danielu, diagnostyka zawieszenia zajmie około 30 minut. Czy będzie Pan czekać w warsztacie, czy woli Pan, żebyśmy zadzwonili, gdy będzie gotowe? Diagnostyka kosztuje 150 zł, które odliczymy, jeśli zdecyduje się Pan na naprawę.$rb$, 'distilled', false) ON CONFLICT (id) DO NOTHING;
INSERT INTO voice_agent_knowledge (id, persona_key, provider_id, scope, category, situation, recommended_response, source, is_active)
  VALUES ('f92f69b1-90b3-48dd-8fd3-5128fefa5396', 'voice_workshop_secretary', NULL, 'tenant', 'closing', $rb$Przed zakończeniem rozmowy o umówionej wizycie$rb$, $rb$Przegląd ogólny trwa około 30-45 minut i jest bezpłatny. Czy mogę jeszcze coś wyjaśnić?$rb$, 'distilled', false) ON CONFLICT (id) DO NOTHING;
COMMIT;
