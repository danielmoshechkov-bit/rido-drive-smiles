-- ============================================================================
-- DEMO AGENTA NA NUMERZE CART78GARAGE
--
-- Decyzja: dzwoniący ma przejść PEŁNĄ ścieżkę — prawdziwa rozmowa, prawdziwy
-- SMS, prawdziwa rezerwacja i zlecenie. To jest najlepszy dowód na produkt.
-- Cena tej decyzji: te wpisy wchodzą do terminarza i statystyk warsztatu,
-- który demo udostępnia. Dlatego znacznik — nie po to, żeby ich nie było,
-- tylko żeby dało się je odfiltrować.
--
-- ⚠️ DO WYKONANIA PRZEZ CZŁOWIEKA.
-- ============================================================================

BEGIN;

-- ── 1. Znacznik „to jest z dema" ────────────────────────────────────────────
--
-- Trzy tabele, bo trzy rzeczy powstają z jednej rozmowy: rozmowa, rezerwacja
-- i zlecenie. Jedna wartość domyślna `false`, więc wszystko, co już jest
-- w bazie, zostaje policzone jak dotąd.
ALTER TABLE public.voice_calls
  ADD COLUMN IF NOT EXISTS z_dema boolean NOT NULL DEFAULT false;
ALTER TABLE public.workshop_client_bookings
  ADD COLUMN IF NOT EXISTS z_dema boolean NOT NULL DEFAULT false;
ALTER TABLE public.workshop_orders
  ADD COLUMN IF NOT EXISTS z_dema boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.voice_calls.z_dema IS
  'Rozmowa z publicznego numeru demonstracyjnego. Nie liczy się do statystyk '
  'warsztatu; minuty naliczamy jak zwykle, bo u operatora i tak je płacimy.';

-- ── 2. Skrót numeru dzwoniącego — do limitu „dwie rozmowy na dobę" ──────────
--
-- SKRÓT, NIE NUMER. Do policzenia, ile razy ktoś dzwonił, wystarczy równość
-- dwóch wartości — pełny numer nie jest do niczego potrzebny, a jego brak
-- oznacza, że wyciek tej kolumny nikomu nie zaszkodzi.
--
-- `from_number` istnieje w tabeli od początku i jest PUSTE we wszystkich
-- 65 rozmowach — nikt go nigdy nie zapisał. Nie zmieniamy tego: numer w jawnej
-- postaci nadal nigdzie nie ląduje.
ALTER TABLE public.voice_calls
  ADD COLUMN IF NOT EXISTS dzwoniacy_skrot text;

COMMENT ON COLUMN public.voice_calls.dzwoniacy_skrot IS
  'SHA-256 z numeru dzwoniącego i soli. Wyłącznie do limitu rozmów demo — '
  'nie da się z niego odtworzyć numeru.';

CREATE INDEX IF NOT EXISTS voice_calls_demo_doba
  ON public.voice_calls (provider_id, created_at)
  WHERE z_dema;

CREATE INDEX IF NOT EXISTS voice_calls_dzwoniacy_doba
  ON public.voice_calls (dzwoniacy_skrot, created_at)
  WHERE dzwoniacy_skrot IS NOT NULL;

-- ── 3. Który numer jest demonstracyjny ──────────────────────────────────────
--
-- Flaga na numerze, nie nazwa warsztatu w kodzie. Przeniesienie dema na inny
-- numer to wtedy jeden UPDATE, a nie wdrożenie.
ALTER TABLE public.voice_numbers
  ADD COLUMN IF NOT EXISTS demonstracyjny boolean NOT NULL DEFAULT false;

UPDATE public.voice_numbers SET demonstracyjny = true WHERE phone_number = '48221015896';

-- ── 4. Limity dema — w danych, nie w kodzie ─────────────────────────────────
ALTER TABLE public.billing_settings
  ADD COLUMN IF NOT EXISTS demo_limit_dobowy integer NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS demo_limit_na_dzwoniacego integer NOT NULL DEFAULT 2;

-- ── Kontrola ────────────────────────────────────────────────────────────────
SELECT 'numer demonstracyjny' AS co, phone_number AS wartosc
  FROM public.voice_numbers WHERE demonstracyjny
UNION ALL
SELECT 'limit dobowy', demo_limit_dobowy::text FROM public.billing_settings WHERE id = true
UNION ALL
SELECT 'limit na dzwoniacego', demo_limit_na_dzwoniacego::text FROM public.billing_settings WHERE id = true;

COMMIT;
