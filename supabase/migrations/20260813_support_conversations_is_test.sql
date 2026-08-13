-- Rozmowa testowa nie może wysyłać prawdziwych SMS-ów.
--
-- Mój zestaw testów zakłada rozmowę, pisze w niej i sprawdza, czy asystent
-- eskaluje sprawę do człowieka. Eskalacja woła support-notify, a ta wysyła SMS
-- na numer admina — czyli KAŻDY przebieg testów wysyłał dwie prawdziwe
-- wiadomości na prywatny telefon. Po sześciu przebiegach dzisiaj to była już
-- ściana powiadomień o klientach, którzy nie istnieją.
--
-- Ograniczenie częstotliwości nie chroniło, bo liczy się per rozmowa, a każdy
-- przebieg zakładał NOWĄ rozmowę.
--
-- Znacznik jest w bazie, a nie w nazwie, bo nazwę widać w treści SMS-a
-- i łatwo ją przypadkiem zmienić. Nazwy z prefiksem [TEST]/[AI-TEST] i tak
-- traktujemy jako testowe — jako druga linia obrony dla danych sprzed zmiany.

ALTER TABLE public.support_conversations
  ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;

UPDATE public.support_conversations
   SET is_test = true
 WHERE is_test = false
   AND (contact_name LIKE '[TEST]%' OR contact_name LIKE '[AI-TEST]%');

COMMENT ON COLUMN public.support_conversations.is_test IS
  'Rozmowa z testów. support-notify nie wysyła dla niej SMS-a ani e-maila.';
