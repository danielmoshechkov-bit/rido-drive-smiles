-- ============================================================================
-- LICZNIK MINUT — KONFIGURACJA I ŚLAD NALICZENIA
--
-- Cecha `voice_minutes` ISTNIEJE już w `billing_features` (założona przy pracy
-- nad rozliczeniami). Ta migracja dokłada trzy brakujące rzeczy konfiguracji
-- i jedno miejsce na ślad naliczenia. Nowego mechanizmu sald NIE zakładamy —
-- `billing_consume` liczy dokładnie tak, jak ustalono: najpierw pula z planu,
-- potem paczki FIFO (bezterminowe na końcu), potem debet.
-- ============================================================================

-- 1. CENA NADWYŻKI. Bez niej `billing_consume` ODMAWIA naliczenia przy
--    przekroczeniu limitu ("nie ma jak tego wycenić") — czyli minuty ponad
--    pakiet zniknęłyby po cichu zamiast trafić na rachunek.
UPDATE public.billing_features
   SET overage_price_net = 1.15, updated_at = now()
 WHERE key = 'voice_minutes' AND overage_price_net IS NULL;

-- 2. LIMITY W PLANACH: Agent 200, Agent Pro 440. `soft_limit` ustawiony tak,
--    żeby ostrzeżenie padało przy 15 POZOSTAŁYCH minutach, a nie przy procencie
--    — 185 z 200 i 425 z 440.
INSERT INTO public.billing_plan_features (plan_id, feature_id, is_enabled, limit_value, soft_limit_value)
SELECT p.id, f.id, true, w.limit_value, w.soft_limit_value
  FROM (VALUES ('agent', 200::numeric, 185::numeric),
               ('agent_pro', 440::numeric, 425::numeric)) AS w(code, limit_value, soft_limit_value)
  JOIN public.billing_plans   p ON p.code = w.code
  JOIN public.billing_features f ON f.key = 'voice_minutes'
ON CONFLICT (plan_id, feature_id) DO UPDATE
   SET is_enabled = true,
       limit_value = EXCLUDED.limit_value,
       soft_limit_value = EXCLUDED.soft_limit_value;

-- 3. PRODUKT DO DOKUPIENIA. `DoladowanieModal` czyta tę tabelę po `code`
--    i woła `billing-payu-order` — nowy przepływ płatności nie jest potrzebny.
--    `is_active = false`, bo ścieżka zakupu czeka na naprawę płatności;
--    włączenie to jedna zmiana wartości, nie wdrożenie.
INSERT INTO public.billing_addon_products (code, name, unit_price_net, step, min_units, feature_id, is_active)
SELECT 'voice_minutes', 'Minuty rozmów agenta', 1.15, 50, 50, f.id, false
  FROM public.billing_features f WHERE f.key = 'voice_minutes'
ON CONFLICT (code) DO NOTHING;

-- 4. ŚLAD NALICZENIA NA ROZMOWIE.
--
-- Idempotencja siedzi w `minutes_charged_at`: naliczamy tylko wtedy, gdy jest
-- puste. `minutes_charge_detail` trzyma rozbicie zwrócone przez billing_consume
-- (ile z puli, ile z paczek, ile w nadwyżkę) — bez tego nie odpowiemy
-- warsztatowi, dlaczego przy 137 minutach zużycia zapłacił za 12.
ALTER TABLE public.voice_calls
  ADD COLUMN IF NOT EXISTS minutes_charged       integer,
  ADD COLUMN IF NOT EXISTS minutes_charged_at    timestamptz,
  ADD COLUMN IF NOT EXISTS minutes_charge_detail jsonb;

-- Naliczanie zapasowe w `voice-call-reconcile` szuka rozmów bez znacznika.
-- Bez indeksu przeglądałoby całą tabelę przy każdym przebiegu (co 15 minut).
CREATE INDEX IF NOT EXISTS voice_calls_do_naliczenia
  ON public.voice_calls (created_at)
  WHERE minutes_charged_at IS NULL;

COMMENT ON COLUMN public.voice_calls.minutes_charged_at IS
  'Znacznik idempotencji naliczenia minut. NULL = jeszcze nie naliczono. '
  'Ustawiany takze dla rozmow o zerowej dlugosci, zeby kontrola nie krzyczala na proby techniczne.';
