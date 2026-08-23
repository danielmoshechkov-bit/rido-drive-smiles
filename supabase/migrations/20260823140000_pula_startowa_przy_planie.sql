-- Jednorazowa pula Rido AI przyznawana AUTOMATYCZNIE przy wejściu w plan.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- DLACZEGO WYZWALACZ, A NIE WYWOŁANIE W FUNKCJACH BRZEGOWYCH
-- ═══════════════════════════════════════════════════════════════════════════
-- Plan zmienia się co najmniej pięcioma drogami: aktywacja okresu próbnego,
-- zakup przez bramkę, webhook operatora płatności, zmiana przez administratora
-- i uzupełnienie wsteczne migracją. Dopisanie wywołania do każdej z nich znaczy
-- pięć miejsc do zapamiętania i szóstą drogę, o której ktoś zapomni.
--
-- Wyzwalacz na `billing_subscriptions` łapie wszystkie naraz, bo każda z tych
-- dróg kończy się wierszem w tej tabeli. Sama pula jest idempotentna — klucz
-- (warsztat, plan) w `rido_ai_start` pilnuje, żeby drugie wejście w ten sam plan
-- nie dało jej ponownie.
--
-- Świadomie NIE przyznajemy puli wstecz istniejącym subskrypcjom: to decyzja
-- o pieniądzach, nie o kodzie. Wyzwalacz działa od teraz.

BEGIN;

CREATE OR REPLACE FUNCTION public.pula_rido_ai_przy_planie()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_kod text;
BEGIN
  -- Tylko warsztaty. Pozostali abonenci (flota, agencja) nie mają Rido AI.
  IF NEW.subscriber_type <> 'service_provider' THEN
    RETURN NEW;
  END IF;

  -- Plan musi być ŻYWY. Wpis anulowany albo zaległy nie jest wejściem w plan.
  IF NEW.status NOT IN ('trialing', 'active') THEN
    RETURN NEW;
  END IF;

  -- Przy zmianie: reagujemy tylko wtedy, gdy naprawdę zmienił się plan albo
  -- subskrypcja ożyła. Zwykły dotyk wiersza (np. przesunięcie okresu) nie jest
  -- wejściem w plan i nie ma prawa niczego przyznać.
  IF TG_OP = 'UPDATE'
     AND NEW.plan_id IS NOT DISTINCT FROM OLD.plan_id
     AND OLD.status IN ('trialing', 'active') THEN
    RETURN NEW;
  END IF;

  SELECT code INTO v_kod FROM billing_plans WHERE id = NEW.plan_id;
  IF v_kod IS NULL THEN
    RETURN NEW;
  END IF;

  -- Błąd przyznania nie może wywrócić zapisu subskrypcji: brak puli to
  -- niedogodność, brak subskrypcji to zablokowany warsztat.
  BEGIN
    PERFORM public.przyznaj_start_rido_ai(NEW.subscriber_id, v_kod);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'pula_rido_ai_przy_planie: % dla % / %', SQLERRM, NEW.subscriber_id, v_kod;
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pula_rido_ai ON public.billing_subscriptions;
CREATE TRIGGER trg_pula_rido_ai
  AFTER INSERT OR UPDATE OF plan_id, status ON public.billing_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.pula_rido_ai_przy_planie();

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_pula_rido_ai') THEN
    RAISE EXCEPTION 'Wyzwalacz nie powstal';
  END IF;
  RAISE NOTICE 'Pula Rido AI przyznawana przy wejsciu w plan: free 3, standard 20, pro 50.';
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';
