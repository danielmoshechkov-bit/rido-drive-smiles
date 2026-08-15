-- ============================================================================
-- BILLING 4.17-mini — faktura sprzedażowa GetRido.
--
-- Dwie rzeczy, bez których nie da się wystawiać faktur z webhooka:
--
--  1. IDEMPOTENCJA. `invoice.paid` przychodzi wielokrotnie (ponowienia
--     operatora). Bez unikalnego odnośnika do płatności druga dostawa wystawi
--     DRUGĄ fakturę — a faktury nie da się po prostu skasować, bo idzie do KSeF
--     i wchodzi do ewidencji. `billing_events` chroni webhook jako całość, ale
--     faktura powstaje w osobnej funkcji, wołanej także ręcznie przy naprawach.
--
--  2. KTO WYSTAWIA. Silnik faktur jest kluczowany po `user_id`: dane sprzedawcy,
--     numeracja i tokeny KSeF wiszą przy koncie. Konto platformowe GetRido jest
--     jednym z wielu kont w systemie i nic go nie wyróżnia — musimy je wskazać
--     jawnie, zamiast zgadywać po nazwie firmy albo NIP-ie.
-- ============================================================================

BEGIN;

-- ------------------------------------------------------------ 1. IDEMPOTENCJA
ALTER TABLE public.user_invoices
  ADD COLUMN IF NOT EXISTS external_payment_ref text;

COMMENT ON COLUMN public.user_invoices.external_payment_ref IS
  'Identyfikator płatności u operatora (np. Stripe in_...), dla faktur wystawianych automatycznie. Unikalny — jedna płatność, jedna faktura.';

-- Częściowy, bo dotyczy wyłącznie faktur automatycznych; faktury wystawiane
-- ręcznie przez warsztaty tej kolumny nie mają i nie konkurują o unikalność.
CREATE UNIQUE INDEX IF NOT EXISTS user_invoices_external_payment_ref
  ON public.user_invoices (external_payment_ref)
  WHERE external_payment_ref IS NOT NULL;

-- ------------------------------------------------------- 2. KONTO PLATFORMOWE
ALTER TABLE public.billing_settings
  ADD COLUMN IF NOT EXISTS platform_invoice_user_id uuid REFERENCES auth.users(id) ON DELETE RESTRICT;

COMMENT ON COLUMN public.billing_settings.platform_invoice_user_id IS
  'Konto, z którego GetRido wystawia faktury sprzedażowe. Wskazuje na user_invoice_companies i company_settings (dane sprzedawcy, seria numeracji, tokeny KSeF).';

-- ON DELETE RESTRICT, nie SET NULL: usunięcie tego konta zabrałoby dane
-- sprzedawcy wszystkim wystawionym fakturom. Ma się nie dać, dopóki wskazanie
-- nie zostanie świadomie przestawione.

COMMIT;
