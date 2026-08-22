-- ============================================================================
-- BRAMKA MINUT — flaga, ktora domyslnie NIC NIE ROBI
--
-- Wdrozenie samej bramki nie moze nikogo odciac. Flaga stoi na `false`, wiec
-- kod trafia na produkcje martwy i czeka, az ktos swiadomie go wlaczy.
--
-- DRUGI WARUNEK JEST TWARDY I NIEZALEZNY OD FLAGI: warsztat bez aktywnej,
-- oplaconej subskrypcji NIGDY nie jest blokowany. Nie mial jak wykupic minut,
-- wiec odciecie go za ich brak byloby kara za nasz nieuruchomiony cennik.
-- Dzis zaden warsztat nie ma subskrypcji — czyli po wlaczeniu flagi nadal nikt
-- nie zostanie odciety, dopoki ktos nie zaplaci.
-- ============================================================================

ALTER TABLE public.billing_settings
  ADD COLUMN IF NOT EXISTS voice_minuty_blokuja boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.billing_settings.voice_minuty_blokuja IS
  'Czy wyczerpany pakiet minut ma powodowac odmowe obslugi polaczenia. '
  'Domyslnie false. Dziala WYLACZNIE dla warsztatow z aktywna, oplacona subskrypcja.';

-- ============================================================================
-- CZY ODMOWIC OBSLUGI — jedna funkcja, zeby regula byla w jednym miejscu.
--
-- Zwraca true TYLKO gdy spelnione sa wszystkie trzy warunki naraz:
--   1. flaga wlaczona,
--   2. warsztat ma aktywna, oplacona subskrypcje na agenta,
--   3. dostepne minuty (po odjeciu rozmow w toku) sa mniejsze niz jedna.
--
-- BLAD ODCZYTU MA ZNACZYC "NIE BLOKUJ". To odwrotnie niz zwykle (zasada 41
-- kaze przy braku danych odmawiac), i jest to swiadomy wyjatek: tutaj odmowa
-- oznacza NIEODEBRANY TELEFON klienta warsztatu, ktory zaplacil. Awaria naszego
-- odczytu nie moze kosztowac go zlecenia.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.voice_odmowic_brak_minut(p_provider_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_flaga     boolean;
  v_ma_sub    boolean;
  v_saldo     jsonb;
  v_dostepne  numeric;
BEGIN
  SELECT voice_minuty_blokuja INTO v_flaga FROM billing_settings WHERE id = true;
  IF NOT COALESCE(v_flaga, false) THEN RETURN false; END IF;

  SELECT EXISTS (
    SELECT 1 FROM billing_subscriptions
     WHERE subscriber_type = 'service_provider'
       AND subscriber_id = p_provider_id
       AND product_line = 'agent'
       AND status IN ('active', 'trialing')
       AND (current_period_end IS NULL OR current_period_end > now())
  ) INTO v_ma_sub;
  IF NOT v_ma_sub THEN RETURN false; END IF;

  v_saldo := public.voice_saldo_minut(p_provider_id);
  v_dostepne := NULLIF(v_saldo ->> 'dostepne', '')::numeric;

  -- `dostepne = NULL` znaczy "bez ograniczen", nie "zero".
  IF v_dostepne IS NULL THEN RETURN false; END IF;

  RETURN v_dostepne < 1;
EXCEPTION WHEN OTHERS THEN
  -- Patrz komentarz wyzej: awaria odczytu nie odbiera telefonu.
  RAISE WARNING 'voice_odmowic_brak_minut: % — przepuszczam polaczenie', SQLERRM;
  RETURN false;
END;
$$;

GRANT EXECUTE ON FUNCTION public.voice_odmowic_brak_minut(uuid) TO service_role;

-- ============================================================================
-- MAIL O NIEODEBRANYM POLACZENIU — NAJWYZEJ JEDEN NA DOBE.
--
-- Warsztat bez minut dostaje dziesiec telefonow dziennie. Dziesiec identycznych
-- maili nauczy go je kasowac, a jedenasty — ten naprawde wazny — zginie razem
-- z nimi. Ta sama zasada, przez ktora 22 alerty o pierwszym zakupie numeru
-- zamienily sie w szum.
--
-- Zwraca true, gdy mail NALEZY wyslac (i od razu odnotowuje wyslanie).
-- ============================================================================
CREATE OR REPLACE FUNCTION public.voice_zglos_nieodebrane(p_provider_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_byl boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM system_alerts
     WHERE category = 'system'
       AND title = 'Warsztat bez minut — polaczenie nieodebrane'
       AND metadata ->> 'provider_id' = p_provider_id::text
       AND created_at > now() - interval '24 hours'
  ) INTO v_byl;

  IF v_byl THEN RETURN false; END IF;

  INSERT INTO system_alerts (type, category, status, title, description, metadata)
  VALUES ('warning', 'system', 'pending',
          'Warsztat bez minut — polaczenie nieodebrane',
          'Agent nie obsluzyl polaczenia, bo warsztat wyczerpal pakiet minut. '
          'Mail do warsztatu wysylany raz na dobe.',
          jsonb_build_object('zrodlo', 'voice-agent-init', 'provider_id', p_provider_id));
  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.voice_zglos_nieodebrane(uuid) TO service_role;
