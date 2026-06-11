CREATE OR REPLACE FUNCTION public.workshop_apply_document_and_assignment_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_TABLE_NAME = 'workshop_order_signatures' AND TG_OP = 'INSERT' THEN
    IF NEW.document_type = 'reception_protocol' THEN
      UPDATE public.workshop_orders
      SET client_acceptance_confirmed = true,
          status_name = CASE
            WHEN COALESCE(status_name, '') IN ('Nowe zlecenie', 'Do wyceny', 'Oczekuje na akceptację', '') THEN 'Przyjęcie do serwisu'
            ELSE status_name
          END,
          updated_at = now()
      WHERE id = NEW.order_id;
    ELSIF NEW.document_type = 'cost_estimate' THEN
      UPDATE public.workshop_orders
      SET quote_accepted = true,
          status_name = CASE
            WHEN COALESCE(status_name, '') NOT IN ('W trakcie naprawy', 'Dodatek do naprawy', 'Naprawione', 'Zadania wykonane', 'Gotowy do odbioru', 'Zakończone', 'Anulowane') THEN 'Zaakceptowano'
            ELSE status_name
          END,
          updated_at = now()
      WHERE id = NEW.order_id;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'workshop_orders' AND TG_OP = 'UPDATE' THEN
    IF NEW.client_acceptance_confirmed IS TRUE
       AND OLD.client_acceptance_confirmed IS DISTINCT FROM NEW.client_acceptance_confirmed
       AND COALESCE(NEW.status_name, '') IN ('Nowe zlecenie', 'Do wyceny', 'Oczekuje na akceptację', '') THEN
      NEW.status_name := 'Przyjęcie do serwisu';
    END IF;

    IF NEW.quote_accepted IS TRUE
       AND OLD.quote_accepted IS DISTINCT FROM NEW.quote_accepted
       AND COALESCE(NEW.status_name, '') NOT IN ('W trakcie naprawy', 'Dodatek do naprawy', 'Naprawione', 'Zadania wykonane', 'Gotowy do odbioru', 'Zakończone', 'Anulowane') THEN
      NEW.status_name := 'Zaakceptowano';
    END IF;

    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'workshop_order_assignments' AND TG_OP = 'INSERT' THEN
    UPDATE public.workshop_orders
    SET status_name = CASE
          WHEN COALESCE(status_name, '') IN ('Nowe zlecenie', 'Przyjęcie do serwisu', 'Do wyceny', '') THEN 'Przydzielone'
          ELSE status_name
        END,
        updated_at = now()
    WHERE id = NEW.order_id;
    RETURN NEW;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_workshop_signature_updates_status ON public.workshop_order_signatures;
CREATE TRIGGER trg_workshop_signature_updates_status
  AFTER INSERT ON public.workshop_order_signatures
  FOR EACH ROW EXECUTE FUNCTION public.workshop_apply_document_and_assignment_status();

DROP TRIGGER IF EXISTS trg_workshop_order_flags_update_status ON public.workshop_orders;
CREATE TRIGGER trg_workshop_order_flags_update_status
  BEFORE UPDATE OF client_acceptance_confirmed, quote_accepted ON public.workshop_orders
  FOR EACH ROW EXECUTE FUNCTION public.workshop_apply_document_and_assignment_status();

DROP TRIGGER IF EXISTS trg_workshop_assignment_updates_status ON public.workshop_order_assignments;
CREATE TRIGGER trg_workshop_assignment_updates_status
  AFTER INSERT ON public.workshop_order_assignments
  FOR EACH ROW EXECUTE FUNCTION public.workshop_apply_document_and_assignment_status();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'workshop_order_assignments'
      AND policyname = 'Admins manage workshop order assignments'
  ) THEN
    CREATE POLICY "Admins manage workshop order assignments"
    ON public.workshop_order_assignments
    FOR ALL
    TO authenticated
    USING (public.has_role(auth.uid(), 'admin'))
    WITH CHECK (public.has_role(auth.uid(), 'admin'));
  END IF;
END $$;