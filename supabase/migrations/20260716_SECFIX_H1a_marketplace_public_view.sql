-- 20260716_SECFIX_H1a_marketplace_public_view.sql
-- =====================================================================
-- SECFIX H1 — CZĘŚĆ A (ADDYTYWNA, bezpieczna do wykonania OD RAZU)
-- ---------------------------------------------------------------------
-- Widok publiczny profili sprzedawców BEZ kolumn PII (telefon prywatny,
-- email prywatny, NIP, adres, REGON, kod pocztowy, osoba/telefon kontaktowy).
-- Wystawia tylko dane, które i tak mają być widoczne na giełdzie (nazwa/firma,
-- opublikowany kontakt biznesowy public_phone/public_email, oceny, miasto).
-- Widok (własność postgres) omija RLS tabeli, więc po SECFIX_H1b (drop szerokiej
-- polityki) katalog sprzedawców dalej działa, a bulk-odczyt PII jest zamknięty.
--
-- NIE rusza polityk tabeli — stary front działa dalej. Idempotentne.
-- =====================================================================

CREATE OR REPLACE VIEW public.marketplace_public_profiles AS
SELECT
  id, user_id, first_name, last_name, account_mode,
  company_name, company_city, company_website,
  public_phone, public_email,
  avg_rating, reviews_count, listings_count,
  city_id, default_category, preferred_listing_type, created_at
FROM public.marketplace_user_profiles;

GRANT SELECT ON public.marketplace_public_profiles TO anon, authenticated;

-- =====================================================================
-- WERYFIKACJA: widok zwraca dane publiczne, NIE zawiera PII:
--   SELECT * FROM public.marketplace_public_profiles LIMIT 1;   -- brak phone/email/nip/address
-- =====================================================================
-- ROLLBACK: DROP VIEW IF EXISTS public.marketplace_public_profiles;
-- =====================================================================
