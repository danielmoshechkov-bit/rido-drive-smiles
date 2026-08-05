-- =============================================================================
-- Duplikaty w grafiku warsztatu — sprzątanie + twarda blokada na poziomie bazy
--
-- POWÓD: rozmowa 05.08 17:56 utworzyła TRZY wpisy w grafiku na ten sam slot
-- i wysłała sześć SMS-ów. Przyczyna była dwuwarstwowa:
--   1) ElevenLabs wysyła po kilka żądań na turę (3 z 4 to poprawki ASR, 1 retry)
--   2) sprawdzenie "czy istnieje, jeśli nie to wstaw" nie chroni przy równoległych
--      żądaniach — wszystkie sprawdzają, zanim którekolwiek zapisze
--
-- Warstwa 1 (kod, już wdrożona): atomowe przejęcie rozmowy w voice-agent-tools.
-- Warstwa 2 (ten skrypt): unikalny indeks — ostatnia linia obrony, działa nawet
-- gdy conversation_id nie dotrze i gdy zapisuje coś spoza agenta głosowego.
--
-- URUCHAMIAĆ ETAPAMI. Krok 1 tylko pokazuje, krok 2 zmienia dane.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- KROK 1 — PODGLĄD. Nic nie zmienia. Uruchom i przeczytaj wynik.
-- ---------------------------------------------------------------------------
SELECT provider_id, phone, appointment_date, appointment_time,
       count(*) AS ile,
       string_agg(to_char(created_at, 'MM-DD HH24:MI') || ' ' || left(id::text, 8), ' | '
                  ORDER BY created_at) AS wpisy
  FROM workshop_client_bookings
 WHERE status <> 'cancelled'
 GROUP BY provider_id, phone, appointment_date, appointment_time
HAVING count(*) > 1
 ORDER BY count(*) DESC, appointment_date;

-- ---------------------------------------------------------------------------
-- KROK 2 — SPRZĄTANIE. Zostawia NAJSTARSZY wpis z każdej grupy, resztę anuluje.
--
-- Anulujemy, nie kasujemy: wpisy mają public_token, który poszedł już do klienta
-- SMS-em. Skasowany wiersz dałby błąd 404 na linku /r/:token; anulowany pokaże
-- klientowi czytelny komunikat. Grafik i tak filtruje status <> 'cancelled'.
-- ---------------------------------------------------------------------------
WITH ranked AS (
  SELECT id,
         row_number() OVER (PARTITION BY provider_id, phone, appointment_date, appointment_time
                            ORDER BY created_at) AS rn
    FROM workshop_client_bookings
   WHERE status <> 'cancelled'
)
UPDATE workshop_client_bookings b
   SET status = 'cancelled',
       cancelled_at = now(),
       cancellation_reason = 'Duplikat z rozmowy AI (sprzatanie 2026-08-05)'
  FROM ranked r
 WHERE b.id = r.id AND r.rn > 1;

-- ---------------------------------------------------------------------------
-- KROK 3 — BLOKADA. Wykona się dopiero, gdy krok 2 usunie wszystkie duplikaty.
--
-- Indeks CZĘŚCIOWY (WHERE status <> 'cancelled'): klient, który odwołał wizytę
-- i umawia się ponownie na ten sam termin, musi móc to zrobić.
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS workshop_client_bookings_slot_uniq
    ON workshop_client_bookings (provider_id, phone, appointment_date, appointment_time)
 WHERE status <> 'cancelled';

-- ---------------------------------------------------------------------------
-- KROK 4 — to samo dla voice_calls. Bez tego find-or-create po conversation_id
-- jest podatny na wyścig (komentarz o tym jest w voice-agent-tools od początku).
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS voice_calls_conversation_uniq
    ON voice_calls (provider_id, elevenlabs_conversation_id)
 WHERE elevenlabs_conversation_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- KONTROLA po wszystkim — oba zapytania mają zwrócić zero wierszy.
-- ---------------------------------------------------------------------------
-- SELECT provider_id, phone, appointment_date, appointment_time, count(*)
--   FROM workshop_client_bookings WHERE status <> 'cancelled'
--  GROUP BY 1,2,3,4 HAVING count(*) > 1;
--
-- SELECT provider_id, elevenlabs_conversation_id, count(*)
--   FROM voice_calls WHERE elevenlabs_conversation_id IS NOT NULL
--  GROUP BY 1,2 HAVING count(*) > 1;
