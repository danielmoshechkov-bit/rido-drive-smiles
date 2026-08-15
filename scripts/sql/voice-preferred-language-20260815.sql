-- ============================================================================
-- JĘZYK KLIENTA — zapamiętany, nigdy zgadywany.
--
-- Po co: ElevenLabs blokuje przełączanie języka w trakcie rozmowy
-- (language_detection zwraca „Invalid language. Keep speaking Polish"
-- mimo rosyjskiego w supported_voices — trzy odmowy w rozmowie conv_…hjg0hyhv).
-- Obejście: nadpisujemy język PRZY STARCIE rozmowy, przez webhook inicjujący,
-- na podstawie tego, co zapamiętaliśmy z poprzedniej rozmowy tego numeru.
--
-- NULL znaczy „nie wiemy" i jest wartością domyślną. Przy NULL agent mówi
-- po polsku — tak jak dziś. NIGDY nie zgadujemy języka z numeru kierunkowego
-- ani z imienia.
--
-- Ograniczenie do czterech wartości jest celowe: to dokładnie te języki,
-- dla których mamy moduły odmiany dat i cen. Piąty język bez modułu znaczyłby
-- rosyjskie powitanie i polskie daty w jednym zdaniu.
-- ============================================================================

ALTER TABLE public.workshop_clients
  ADD COLUMN IF NOT EXISTS preferred_language text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'workshop_clients_preferred_language_check'
  ) THEN
    ALTER TABLE public.workshop_clients
      ADD CONSTRAINT workshop_clients_preferred_language_check
      CHECK (preferred_language IS NULL OR preferred_language IN ('pl', 'en', 'ru', 'uk'));
  END IF;
END $$;

COMMENT ON COLUMN public.workshop_clients.preferred_language IS
  'Język rozmowy zapamiętany z poprzedniego połączenia (pl/en/ru/uk). '
  'NULL = nie wiemy, agent mówi po polsku. Nigdy nie zgadywany — ustawiany '
  'wyłącznie przez voice-call-postprocess przy jednoznacznym rozpoznaniu.';

-- Odczyt idzie po numerze dzwoniącego w voice-agent-init, w ścieżce z budżetem
-- 800 ms. Indeks jest po to, żeby ten odczyt nie skanował tabeli klientów.
CREATE INDEX IF NOT EXISTS idx_workshop_clients_provider_phone
  ON public.workshop_clients (provider_id, phone)
  WHERE phone IS NOT NULL;
