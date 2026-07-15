-- FAZA 1 (fix/faktury-mega): FREEZE faktur wysłanych do KSeF.
-- Dokument z nadanym numerem KSeF (ksef_reference) jest niezmienialny — zmiana
-- treści po wysyłce = dwie wersje tej samej faktury (nierzetelna faktura).
-- Blokada twarda w bazie: UI może się mylić, trigger nie.
-- Dozwolone po wysyłce pozostają pola techniczne/operacyjne: ksef_* (statusy),
-- pdf_url (snapshot zamrożonego PDF), płatności (is_paid/paid_amount/paid_at),
-- review_status i updated_at.
-- PEŁNY FREEZE (decyzja 15.07): soft-delete (deleted_at) wysłanej faktury też
-- ZABLOKOWANY — dokument w KSeF jest nietykalny bez wyjątków. Dodatkowo nie można
-- soft-deletować faktury, której KTÓRAKOLWIEK korekta jest w KSeF.

CREATE OR REPLACE FUNCTION public.prevent_ksef_frozen_invoice_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Soft-delete: zablokowany dla wysłanych ORAZ dla pierwotnych z korektą w KSeF
  IF NEW.deleted_at IS DISTINCT FROM OLD.deleted_at AND NEW.deleted_at IS NOT NULL THEN
    IF OLD.ksef_reference IS NOT NULL THEN
      RAISE EXCEPTION 'Faktura % została wysłana do KSeF — nie można jej usunąć.', OLD.invoice_number
        USING ERRCODE = 'P0001';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.user_invoices k
      WHERE k.corrected_invoice_id = OLD.id
        AND k.deleted_at IS NULL
        AND k.ksef_reference IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'Faktura % ma korektę w KSeF — nie można jej usunąć.', OLD.invoice_number
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  IF OLD.ksef_reference IS NOT NULL THEN
    IF NEW.invoice_number IS DISTINCT FROM OLD.invoice_number
      OR NEW.invoice_type IS DISTINCT FROM OLD.invoice_type
      OR NEW.issue_date IS DISTINCT FROM OLD.issue_date
      OR NEW.sale_date IS DISTINCT FROM OLD.sale_date
      OR NEW.due_date IS DISTINCT FROM OLD.due_date
      OR NEW.issue_place IS DISTINCT FROM OLD.issue_place
      OR NEW.payment_method IS DISTINCT FROM OLD.payment_method
      OR NEW.currency IS DISTINCT FROM OLD.currency
      OR NEW.net_total IS DISTINCT FROM OLD.net_total
      OR NEW.vat_total IS DISTINCT FROM OLD.vat_total
      OR NEW.gross_total IS DISTINCT FROM OLD.gross_total
      OR NEW.buyer_name IS DISTINCT FROM OLD.buyer_name
      OR NEW.buyer_nip IS DISTINCT FROM OLD.buyer_nip
      OR NEW.buyer_address IS DISTINCT FROM OLD.buyer_address
      OR NEW.buyer_email IS DISTINCT FROM OLD.buyer_email
      OR NEW.notes IS DISTINCT FROM OLD.notes
      OR NEW.is_correction IS DISTINCT FROM OLD.is_correction
      OR NEW.corrected_invoice_id IS DISTINCT FROM OLD.corrected_invoice_id
      OR NEW.corrected_invoice_number IS DISTINCT FROM OLD.corrected_invoice_number
      OR NEW.corrected_invoice_date IS DISTINCT FROM OLD.corrected_invoice_date
      OR NEW.correction_reason IS DISTINCT FROM OLD.correction_reason
      OR NEW.company_id IS DISTINCT FROM OLD.company_id
      OR NEW.user_id IS DISTINCT FROM OLD.user_id
      OR NEW.ksef_reference IS DISTINCT FROM OLD.ksef_reference
      OR NEW.split_payment IS DISTINCT FROM OLD.split_payment
    THEN
      RAISE EXCEPTION 'Faktura % została wysłana do KSeF i jest niezmienialna. Wystaw korektę.', OLD.invoice_number
        USING ERRCODE = 'P0001';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_freeze_ksef_invoice_update ON public.user_invoices;
CREATE TRIGGER trg_freeze_ksef_invoice_update
  BEFORE UPDATE ON public.user_invoices
  FOR EACH ROW EXECUTE FUNCTION public.prevent_ksef_frozen_invoice_update();

-- Twardy DELETE faktury wysłanej do KSeF = dokument znika z systemu — zablokowany.
-- (Ukrycie z listy = soft-delete przez UPDATE deleted_at, który trigger wyżej dopuszcza.)
CREATE OR REPLACE FUNCTION public.prevent_ksef_frozen_invoice_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.ksef_reference IS NOT NULL THEN
    RAISE EXCEPTION 'Faktura % została wysłana do KSeF — nie można jej usunąć z bazy.', OLD.invoice_number
      USING ERRCODE = 'P0001';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_freeze_ksef_invoice_delete ON public.user_invoices;
CREATE TRIGGER trg_freeze_ksef_invoice_delete
  BEFORE DELETE ON public.user_invoices
  FOR EACH ROW EXECUTE FUNCTION public.prevent_ksef_frozen_invoice_delete();

-- Pozycje faktury wysłanej: żadnych INSERT/UPDATE/DELETE.
CREATE OR REPLACE FUNCTION public.prevent_ksef_frozen_items_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ref text;
  v_number text;
BEGIN
  SELECT ksef_reference, invoice_number INTO v_ref, v_number
  FROM public.user_invoices
  WHERE id = COALESCE(NEW.invoice_id, OLD.invoice_id);
  IF v_ref IS NOT NULL THEN
    RAISE EXCEPTION 'Pozycje faktury % wysłanej do KSeF są niezmienialne. Wystaw korektę.', v_number
      USING ERRCODE = 'P0001';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_freeze_ksef_items ON public.user_invoice_items;
CREATE TRIGGER trg_freeze_ksef_items
  BEFORE INSERT OR UPDATE OR DELETE ON public.user_invoice_items
  FOR EACH ROW EXECUTE FUNCTION public.prevent_ksef_frozen_items_mutation();

-- Prywatny bucket na zamrożone PDF-y wysłanych faktur (snapshot w momencie wysyłki).
-- Ścieżka pliku: <user_id>/<invoice_id>.pdf — polityki per właściciel folderu.
INSERT INTO storage.buckets (id, name, public)
VALUES ('invoice-pdfs', 'invoice-pdfs', false)
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  CREATE POLICY "invoice_pdfs_owner_select" ON storage.objects
    FOR SELECT USING (bucket_id = 'invoice-pdfs' AND auth.uid()::text = (storage.foldername(name))[1]);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE POLICY "invoice_pdfs_owner_insert" ON storage.objects
    FOR INSERT WITH CHECK (bucket_id = 'invoice-pdfs' AND auth.uid()::text = (storage.foldername(name))[1]);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE POLICY "invoice_pdfs_owner_update" ON storage.objects
    FOR UPDATE USING (bucket_id = 'invoice-pdfs' AND auth.uid()::text = (storage.foldername(name))[1]);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
