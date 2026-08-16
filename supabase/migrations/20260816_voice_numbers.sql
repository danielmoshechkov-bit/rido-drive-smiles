-- ============================================================================
-- NUMER PER WARSZTAT — tabele.
--
-- Model: jedno konto SIP u operatora (trunk do ElevenLabs) obsługuje wiele
-- naszych numerów; warsztat rozpoznajemy po numerze, NA KTÓRY zadzwoniono.
-- Numery kupujemy Z WYPRZEDZENIEM do puli — 1,23 zł/mc za sztukę — żeby zakup
-- nie leżał na ścieżce aktywacji klienta.
--
-- Zasada przewijająca się przez cały plik: pieniądze tracimy wyłącznie wtedy,
-- gdy zapomnimy, że numer jest nasz. Dlatego wiersz powstaje PRZED zakupem
-- (status `kupowany`), a historia jest dopisywana i nigdy nadpisywana.
-- ============================================================================

-- ---------------------------------------------------------------- NUMERY ----
CREATE TABLE IF NOT EXISTS public.voice_numbers (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Same cyfry z kierunkowym kraju: 48221015896. Bez plusów i spacji, bo
  -- porównujemy to z `called_number` z webhooka, który przychodzi w różnych
  -- postaciach i normalizujemy go po naszej stronie.
  phone_number        text NOT NULL UNIQUE CHECK (phone_number ~ '^[0-9]{9,15}$'),
  provider_id         uuid REFERENCES public.service_providers(id) ON DELETE SET NULL,
  status              text NOT NULL DEFAULT 'kupowany'
    CHECK (status IN ('kupowany','wolny','przypisywany','aktywny','wymaga_uwagi','zwalniany','zwolniony')),
  supervoip_number_id text,        -- /api/numbers/{id}      — pozycja z puli operatora
  supervoip_voip_id   text,        -- /api/voip_numbers/{id} — nasza instancja numeru
  supervoip_sip_id    text,        -- /api/sips/{id}         — konto z trunkiem
  elevenlabs_phone_id text,
  elevenlabs_agent_id text,
  region              text,
  koszt_miesieczny    numeric(8,2),
  kupiony_at          timestamptz,
  przypisany_at       timestamptz,
  zwolniony_at        timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- JEDEN AKTYWNY NUMER NA WARSZTAT — pilnuje BAZA, nie kod.
-- Warunek w kodzie da się ominąć nową ścieżką zapisu; indeks nie.
CREATE UNIQUE INDEX IF NOT EXISTS voice_numbers_jeden_aktywny_na_warsztat
  ON public.voice_numbers (provider_id) WHERE status = 'aktywny' AND provider_id IS NOT NULL;

-- Odczyt na ścieżce rozmowy: numer → warsztat. Musi być szybki, bo siedzi
-- w budżecie 300 ms webhooka inicjującego.
CREATE INDEX IF NOT EXISTS voice_numbers_lookup
  ON public.voice_numbers (phone_number) WHERE status IN ('aktywny','przypisywany');

CREATE INDEX IF NOT EXISTS voice_numbers_wolne
  ON public.voice_numbers (status) WHERE status = 'wolny';

-- -------------------------------------------------------------- HISTORIA ----
-- `phone_number` i `provider_id` są POWTÓRZONE celowo: historia ma przeżyć
-- usunięcie numeru z tabeli wyżej. Wpis „kto i kiedy dostał jaki numer"
-- bez numeru jest bezużyteczny.
CREATE TABLE IF NOT EXISTS public.voice_number_events (
  id            bigserial PRIMARY KEY,
  number_id     uuid REFERENCES public.voice_numbers(id) ON DELETE SET NULL,
  phone_number  text NOT NULL,
  provider_id   uuid,
  zdarzenie     text NOT NULL
    CHECK (zdarzenie IN ('kupiony','adoptowany','przypisany','zwolniony','awaria','rekoncyliacja')),
  status_przed  text,
  status_po     text,
  aktor         text,
  szczegoly     jsonb NOT NULL DEFAULT '{}'::jsonb,
  at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS voice_number_events_numer ON public.voice_number_events (phone_number, at DESC);
CREATE INDEX IF NOT EXISTS voice_number_events_warsztat ON public.voice_number_events (provider_id, at DESC);

-- --------------------------------------------------------------- KOLEJKA ----
-- Aktywacja jest asynchroniczna (zapisy u operatora 1 na 10 s), więc musi
-- mieć stan. `krok` to ostatni UKOŃCZONY krok — wznawiamy od następnego,
-- nigdy od początku, żeby nie powtórzyć zakupu.
CREATE TABLE IF NOT EXISTS public.voice_number_jobs (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  typ            text NOT NULL CHECK (typ IN ('aktywacja','uzupelnienie_puli','zwolnienie','rekoncyliacja')),
  provider_id    uuid REFERENCES public.service_providers(id) ON DELETE CASCADE,
  number_id      uuid REFERENCES public.voice_numbers(id) ON DELETE SET NULL,
  status         text NOT NULL DEFAULT 'oczekuje'
    CHECK (status IN ('oczekuje','w_toku','zrobione','wymaga_uwagi')),
  krok           text,
  proby          integer NOT NULL DEFAULT 0,
  nastepna_proba timestamptz NOT NULL DEFAULT now(),
  ostatni_blad   text,
  dane           jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS voice_number_jobs_do_wziecia
  ON public.voice_number_jobs (nastepna_proba) WHERE status IN ('oczekuje','w_toku');

-- Jedna aktywacja na warsztat naraz. Drugie kliknięcie ma trafić w istniejące
-- zadanie, a nie uruchomić drugi zakup.
CREATE UNIQUE INDEX IF NOT EXISTS voice_number_jobs_jedna_aktywacja
  ON public.voice_number_jobs (provider_id, typ)
  WHERE status IN ('oczekuje','w_toku') AND typ = 'aktywacja';

-- --------------------------------------------------- ROZMOWY W TOKU ---------
-- Limit rozmów równoczesnych musi być po naszej stronie: u operatora
-- `VoipNumber.incomingCallLimit` jest TYLKO DO ODCZYTU, a w ElevenLabs limit
-- jest per agent, a agenta mamy jednego dla wszystkich warsztatów.
CREATE TABLE IF NOT EXISTS public.voice_active_calls (
  conversation_id text PRIMARY KEY,
  provider_id     uuid NOT NULL REFERENCES public.service_providers(id) ON DELETE CASCADE,
  phone_number    text,
  started_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS voice_active_calls_prov
  ON public.voice_active_calls (provider_id, started_at DESC);

-- ------------------------------------------------------------------- RLS ----
ALTER TABLE public.voice_numbers       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voice_number_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voice_number_jobs   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voice_active_calls  ENABLE ROW LEVEL SECURITY;

-- Zapisuje wyłącznie service_role (funkcje brzegowe) — RLS go nie dotyczy.
-- Dla użytkowników wyłącznie ODCZYT i wyłącznie tego, co ich dotyczy.
DROP POLICY IF EXISTS "voice_numbers admin"    ON public.voice_numbers;
DROP POLICY IF EXISTS "voice_numbers warsztat" ON public.voice_numbers;
CREATE POLICY "voice_numbers admin" ON public.voice_numbers
  FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "voice_numbers warsztat" ON public.voice_numbers
  FOR SELECT TO authenticated
  USING (provider_id IN (SELECT get_user_provider_ids(auth.uid())));

DROP POLICY IF EXISTS "voice_number_events admin"    ON public.voice_number_events;
DROP POLICY IF EXISTS "voice_number_events warsztat" ON public.voice_number_events;
CREATE POLICY "voice_number_events admin" ON public.voice_number_events
  FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "voice_number_events warsztat" ON public.voice_number_events
  FOR SELECT TO authenticated
  USING (provider_id IN (SELECT get_user_provider_ids(auth.uid())));

-- Kolejka zadań to nasza kuchnia: treść błędów operatora i identyfikatory
-- konta. Warsztat widzi TYLKO status swojego zadania, nie `dane` ani `ostatni_blad`
-- — dlatego wpuszczamy go przez widok niżej, a nie do tabeli.
DROP POLICY IF EXISTS "voice_number_jobs admin" ON public.voice_number_jobs;
CREATE POLICY "voice_number_jobs admin" ON public.voice_number_jobs
  FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

CREATE OR REPLACE VIEW public.voice_number_jobs_status
WITH (security_invoker = true) AS
SELECT id, provider_id, typ, status, krok, created_at, updated_at
FROM public.voice_number_jobs;

DROP POLICY IF EXISTS "voice_active_calls admin" ON public.voice_active_calls;
CREATE POLICY "voice_active_calls admin" ON public.voice_active_calls
  FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

COMMENT ON TABLE public.voice_numbers IS
  'Numery telefoniczne należące do nas u operatora. status=wolny to pula kupiona z wyprzedzeniem.';
COMMENT ON COLUMN public.voice_numbers.status IS
  'kupowany = wiersz powstał PRZED zakupem u operatora, żeby awaria nie zgubiła numeru.';
