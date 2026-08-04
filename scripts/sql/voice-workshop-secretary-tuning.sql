-- Strojenie persony workshop_secretary — skrócenie wypowiedzi i usunięcie wywiadu
-- diagnostycznego oraz powtórzeń.
--
-- ZAKRES: wyłącznie persona workshop_secretary i agent voice_workshop_secretary.
-- Żadna inna persona ani agent nie są dotykane. Zero DDL — zmieniane są tylko
-- wartości w dwóch tabelach, wszystko w transakcji.
--
-- NIE jest to migracja. Leży poza supabase/migrations celowo, żeby Lovable nie
-- zastosował go automatycznie przy deployu. Uruchamiać świadomie:
--   supabase db query --linked -f scripts/sql/voice-workshop-secretary-tuning.sql
--
-- Odwrócenie: scripts/sql/voice-workshop-secretary-tuning-rollback.sql
-- Skrypt jest idempotentny — ponowne uruchomienie niczego nie zepsuje.
--
-- UWAGA co do statusu "pending": tabela voice_agent_knowledge NIE MA kolumny
-- status. Jedyny przełącznik to boolean is_active. Prawdziwy status pending
-- wymagałby migracji (ALTER TABLE ... ADD COLUMN status), a tego świadomie tu
-- nie robimy. Wyłączenie przez is_active = false jest w pełni odwracalne.

BEGIN;

-- ============================================================================
-- SEKCJA 1 — reguły wskazane wprost: wywiad diagnostyczny, obowiązkowe
-- powtarzanie imienia i nazwiska, zbędne pytanie o rok pojazdu.
-- Wszystkie trzy zostały odtworzone w transkrypcie z 03.08 niemal dosłownie.
-- Identyfikatory wypisane wprost, żeby wyłączyć DOKŁADNIE te wiersze; warunek
-- na persona_key jest drugim zabezpieczeniem.
-- ============================================================================
UPDATE public.voice_agent_knowledge
SET is_active = false
WHERE persona_key = 'workshop_secretary'
  AND is_active = true
  AND id IN (
    -- "Zadaj 2-3 dodatkowe pytania diagnostyczne: Jak długo trwa ten problem?,
    --  Czy ostatnio serwisowali Państwo zawieszenie?, Czy problem się pogarsza?"
    -- evidence_count = 3, czyli zawsze pierwsza na liście wstrzykiwanej do promptu.
    'a1a28f41-484d-46a4-9a82-87da2c1622c4',
    -- "Zawsze powtórz imię i nazwisko: Czyli Daniel Moshechkov, dobrze się mówi?"
    'd7d1bbb4-8677-4f13-b9ea-f02fa3f8ed45',
    -- "Pytaj w logicznej kolejności: marka -> model -> rok -> rejestracja"
    -- Źródło zbędnego pytania o rok produkcji; rok nie jest potrzebny do rezerwacji.
    'c66eb806-51d3-4841-a63f-08dfa28b2eb5'
  );

-- ============================================================================
-- SEKCJA 2 — reguły odtworzone DOSŁOWNIE w rozmowie z 04.08 i wskazane przez
-- właściciela jako do usunięcia. Każda z nich pojawiła się w transkrypcie:
--   "Prosimy przyjechać dziesięć minut wcześniej, aby uzupełnić dokumenty."
--   "Wyślę Ci SMS z potwierdzeniem"  (dodatkowo forma "Ci" — nieoficjalna)
--   "Czy masz jakieś pytania?"       (dodatkowo forma "masz")
-- ============================================================================
UPDATE public.voice_agent_knowledge
SET is_active = false
WHERE persona_key = 'workshop_secretary'
  AND is_active = true
  AND id IN (
    '39c21e98-ed6c-47cd-b5c5-48ebed42aae3',  -- "potrzebuję kilka informacji: nazwisko, telefon, marka, model"
    '192927ae-654e-478c-a36c-5c9b10f20b0e',  -- "Zanim przejdziemy do szczegółów - imię i numer telefonu?"
    'd636e2aa-c525-4e89-8ce1-ce11ab73030f',  -- "Czy masz pytania dotyczące kosztów lub czasu naprawy?"
    '3cc481c3-f88e-4007-bf60-58bfea7b28de',  -- "Prosimy przyjechać 10 minut wcześniej... Czy ma Pan pytania?"
    '0c9fc1d6-0e95-4034-be39-f2db5b42ff9c',  -- "Zawsze potwierdzić orientacyjny koszt lub zakres cen"
    'c94ed983-f586-4cc3-aee9-e621902d341d'   -- "Wyślę Ci SMS z potwierdzeniem - sprawdzisz go?"
  );

-- ============================================================================
-- SEKCJA 2b — powtarzanie danych wstecz. W transkrypcie z 04.08 obie zadziałały
-- i obie kosztowały czas oraz frustrację:
--   "Czyli pięćset dziewiętnaście, cztery siedem, cztery, pięćset osiemdziesiąt trzy - dobrze?"
--   "Potwierdzam: WY dziewięć dziewięć sześć EU" -> pięć rund poprawek numeru.
-- Potwierdzanie numeru rejestracyjnego przenosimy do promptu, gdzie ma twardy
-- limit jednego powtórzenia; reguła z bazy nie zna takiego limitu.
-- ============================================================================
UPDATE public.voice_agent_knowledge
SET is_active = false
WHERE persona_key = 'workshop_secretary'
  AND is_active = true
  AND id IN (
    '9bd075d4-0ecf-4969-bfdb-4d761bad71ae',  -- "Powtórz numer głośno: Czyli pięćset dziewiętnaście..."
    '1b7921da-3f82-479c-90a9-c59a338b3532'   -- "Powtórz dokładnie: WY dziewięć dziewięć sześć EU - zgadza się?"
  );

-- ============================================================================
-- SEKCJA 3 — krótszy prompt bazowy persony.
-- ============================================================================
UPDATE public.ai_agents_config
SET system_prompt = 'Jesteś asystentką głosową warsztatu samochodowego. Mówisz krótko i naturalnie, jak recepcjonistka przez telefon: jedno-dwa zdania i JEDNO pytanie na turę.

NIE prowadzisz diagnostyki. Przy usterce wystarczy Ci jedno zdanie opisu od klienta. Nie pytaj o czas trwania, nasilenie, okoliczności, historię serwisową ani o to, z której strony dochodzi dźwięk — mechanik zdiagnozuje na miejscu.

NIE pytaj o to, co klient już powiedział. Podany objaw, termin, markę, imię czy telefon przyjmujesz i idziesz dalej. Nie potwierdzaj wymowy nazwiska i nie powtarzaj go w każdej turze.

Kolejność rozmowy:
1. Krótko przyjmij opis problemu i potwierdź, że się tym zajmiecie.
2. Od razu ustal termin — sprawdź go narzędziem check_availability i zaproponuj JEDNĄ konkretną godzinę.
3. Dopiero po akceptacji terminu poproś o imię i nazwisko oraz numer telefonu, potem markę, model i numer rejestracyjny. Roku produkcji nie potrzebujesz.
4. Umów wizytę przez create_booking. Potwierdź jednym zdaniem termin i dodaj, że wyślecie SMS z potwierdzeniem — nie pytaj o zgodę na SMS ani czy klient go sprawdzi. Potem zakończ rozmowę.

Po potwierdzeniu rezerwacji rozmowa jest skończona. Nie dodawaj porad, cen, informacji organizacyjnych ani dodatkowych pytań, o które klient nie prosił. Nie obiecuj cen ani czasu naprawy — to po diagnozie na miejscu. Nigdy nie zmyślaj dostępności.'
WHERE agent_id = 'voice_workshop_secretary';

COMMIT;

-- ============================================================================
-- WERYFIKACJA (tylko odczyt) — uruchom po zatwierdzeniu.
-- Oczekiwane po SEKCJI 1: 3 reguły nieaktywne, 17 aktywnych.
-- ============================================================================
SELECT
  count(*) FILTER (WHERE is_active)     AS aktywne,
  count(*) FILTER (WHERE NOT is_active) AS wylaczone
FROM public.voice_agent_knowledge
WHERE persona_key = 'workshop_secretary';

SELECT agent_id, length(system_prompt) AS dlugosc_promptu
FROM public.ai_agents_config
WHERE agent_id = 'voice_workshop_secretary';
