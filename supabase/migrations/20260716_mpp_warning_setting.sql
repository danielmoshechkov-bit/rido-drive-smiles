-- Ustawienie: pokazywać okno ostrzeżenia MPP dla faktur > 15 000 zł.
-- Domyślnie WŁĄCZONE (bezpieczeństwo prawne — sankcja 30% VAT za brak MPP);
-- użytkownik może wyłączyć w „Ustawienia faktur".
ALTER TABLE public.user_invoice_companies
  ADD COLUMN IF NOT EXISTS mpp_warning_enabled boolean NOT NULL DEFAULT true;
COMMENT ON COLUMN public.user_invoice_companies.mpp_warning_enabled IS
  'Czy pokazywać okno ostrzeżenia MPP przy wystawianiu faktury > 15 000 zł (domyślnie true).';
