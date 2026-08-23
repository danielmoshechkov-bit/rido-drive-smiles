-- Firma wystawiająca faktury platformy wskazana JAWNIE.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- DLACZEGO NIE „DOMYŚLNA"
-- ═══════════════════════════════════════════════════════════════════════════
-- Funkcja wystawiająca brała firmę oznaczoną jako domyślna na koncie
-- platformowym. To jest zgadywanie: konto administratora ma kilka firm — jedną
-- prywatną i jedną spółki — a „domyślna" mówi, którą podpowiedzieć w kreatorze
-- faktury, a nie która jest sprzedawcą GetRido.
--
-- Skutek przy pierwszym teście: odmowa `PLATFORM_COMPANY_INCOMPLETE`, bo
-- domyślna była firma prywatna, bez NIP-u. Odmowa jest słuszna — faktura bez
-- NIP-u sprzedawcy jest nieważna — ale przyczyna była przypadkowa.
--
-- Ta sama zasada, co przy koncie: wskazujemy jawnie, zamiast zgadywać.
-- Przestawienie „domyślnej" w kreatorze nie może zmieniać tego, kto sprzedaje.

BEGIN;

ALTER TABLE public.billing_settings
  ADD COLUMN IF NOT EXISTS platform_invoice_company_id uuid
    REFERENCES public.user_invoice_companies(id) ON DELETE RESTRICT;

COMMENT ON COLUMN public.billing_settings.platform_invoice_company_id IS
  'Firma, w imieniu ktorej GetRido wystawia faktury sprzedazowe. Wskazana jawnie, '
  'zeby nie zalezala od tego, ktora firma jest akurat domyslna w kreatorze.';

-- ON DELETE RESTRICT z tego samego powodu co przy koncie: skasowanie firmy
-- zabraloby dane sprzedawcy wszystkim wystawionym fakturom.

UPDATE public.billing_settings
   SET platform_invoice_company_id = (
     SELECT c.id FROM public.user_invoice_companies c
     WHERE c.nip = '5223377431'
       AND c.user_id = public.billing_settings.platform_invoice_user_id
     LIMIT 1
   )
 WHERE platform_invoice_company_id IS NULL;

DO $$
DECLARE v_nip text;
BEGIN
  SELECT c.nip INTO v_nip
  FROM billing_settings b
  JOIN user_invoice_companies c ON c.id = b.platform_invoice_company_id
  LIMIT 1;

  IF v_nip IS NULL THEN
    RAISE EXCEPTION 'Firma wystawiajaca platformy nie zostala wskazana albo nie ma NIP-u';
  END IF;

  RAISE NOTICE 'Wystawca faktur platformy: NIP %', v_nip;
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';
