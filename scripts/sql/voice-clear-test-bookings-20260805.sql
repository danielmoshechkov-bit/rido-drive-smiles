-- =============================================================================
-- Sprzątanie rezerwacji testowych agenta głosowego
--
-- POWÓD: testy zostawiają aktywne rezerwacje w grafiku. Kolejny test na ten sam
-- slot trafia w istniejący wiersz, więc NIE powstaje nowy wpis i NIE wychodzi SMS
-- (tożsamość liczona po telefonie + dacie + godzinie, nie po rozmowie).
-- Rozmowa 05.08 20:23 utworzyła rezerwację i zlecenie, ale w grafiku został wpis
-- z 04.08 z opisem "Sprawdzić hamulce z tyłu" — dla Lexusa na przegląd zawieszenia.
--
-- Anulujemy, nie kasujemy: public_token poszedł już do klienta SMS-em,
-- a skasowany wiersz dałby 404 na linku /r/:token.
--
-- ZAKRES: wyłącznie wiersze oznaczone "[Z ROZMOWY AI]" i "[TEST AI]".
-- Rezerwacje utworzone przez ludzi w panelu NIE są ruszane.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- KROK 1 — PODGLĄD. Nic nie zmienia.
-- ---------------------------------------------------------------------------
SELECT 'grafik' AS zrodlo, id, created_at::date AS utworzono,
       appointment_date, appointment_time, left(service_description, 50) AS opis
  FROM workshop_client_bookings
 WHERE status <> 'cancelled'
   AND (service_description LIKE '%[Z ROZMOWY AI]%' OR service_description LIKE '%[TEST AI]%')
UNION ALL
SELECT 'rezerwacja', id, created_at::date,
       scheduled_date, scheduled_time::text, left(customer_notes, 50)
  FROM service_bookings
 WHERE status NOT IN ('cancelled', 'rejected')
   AND (customer_notes LIKE '%[Z ROZMOWY AI]%' OR customer_notes LIKE '%[TEST AI]%')
 ORDER BY 4, 5;

-- ---------------------------------------------------------------------------
-- KROK 2 — ANULOWANIE. Uruchomić po przejrzeniu kroku 1.
-- ---------------------------------------------------------------------------
UPDATE workshop_client_bookings
   SET status = 'cancelled',
       cancelled_at = now(),
       cancellation_reason = 'Rezerwacja testowa agenta AI (sprzatanie 2026-08-05)'
 WHERE status <> 'cancelled'
   AND (service_description LIKE '%[Z ROZMOWY AI]%' OR service_description LIKE '%[TEST AI]%');

UPDATE service_bookings
   SET status = 'cancelled'
 WHERE status NOT IN ('cancelled', 'rejected')
   AND (customer_notes LIKE '%[Z ROZMOWY AI]%' OR customer_notes LIKE '%[TEST AI]%');

-- ---------------------------------------------------------------------------
-- KONTROLA — oba mają zwrócić zero.
-- ---------------------------------------------------------------------------
-- SELECT count(*) FROM workshop_client_bookings
--  WHERE status <> 'cancelled' AND service_description LIKE '%AI]%';
-- SELECT count(*) FROM service_bookings
--  WHERE status NOT IN ('cancelled','rejected') AND customer_notes LIKE '%AI]%';

-- ---------------------------------------------------------------------------
-- UWAGA NA PRZYSZŁOŚĆ
-- Ten skrypt trzeba będzie uruchamiać przed każdą serią testów, dopóki
-- tożsamość rezerwacji liczy się po slocie. FAZA 2 (voice-call-commit
-- z kluczem conversation_id) usuwa przyczynę i ten skrypt przestaje być
-- potrzebny.
-- ---------------------------------------------------------------------------
