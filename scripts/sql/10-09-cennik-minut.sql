-- ============================================================================
-- DO WYKONANIA PRZEZ CZŁOWIEKA. Dwie zmiany danych, obie odwracalne.
--
-- Kontekst: warsztat, któremu skończą się minuty, NIE MA DZIŚ JAK ICH KUPIĆ.
-- Okno doładowania czyta warunki sprzedaży z `billing_addon_products`, a wiersz
-- `voice_minutes` stoi wyłączony. Druga zmiana odsłania pakiet Agent Pro,
-- który leży w bazie kompletny (399 zł netto, 440 minut, 3 połączenia
-- równoczesne) i jest niewidoczny wyłącznie przez `is_active = false`.
--
-- Uruchomienie:  supabase db query --linked -f scripts/sql/10-09-cennik-minut.sql
-- ============================================================================

BEGIN;

-- ── 1. Doładowanie minut: włączone, paczki co 30 ────────────────────────────
--
-- 30 × 1,15 = 34,50 · 60 × 1,15 = 69,00 · 90 × 1,15 = 103,50 zł netto.
-- Krok i minimum siedzą w danych, więc suwak w oknie zakupu i trzy paczki
-- w cenniku biorą się z JEDNEGO miejsca — nie da się ich rozjechać.
UPDATE public.billing_addon_products
   SET is_active  = true,
       step       = 30,
       min_units  = 30
 WHERE code = 'voice_minutes';

-- ── 2. Agent Pro widoczny w cenniku ─────────────────────────────────────────
--
-- Wiersz i jego funkcje są już w bazie i zgodne z ustaleniami. Brakuje
-- wyłącznie zapalenia. UWAGA: ten plan nie ma ceny docelowej
-- (`price_net_target`), więc karta pokaże jedną kwotę, bez „ceny startowej"
-- jak przy planie Agent. Jeśli ma być inaczej — trzeba dopisać cenę docelową.
UPDATE public.billing_plans
   SET is_active = true
 WHERE code = 'agent_pro';

-- ── 3. Agent Pro: JEDEN numer telefoniczny ──────────────────────────────────
--
-- W bazie plan ma wpisane 3 numery. Ustalenie z 10.09 mówi: 399 zł, 440 minut,
-- 3 połączenia równoczesne, ale JEDEN numer. Trzy połączenia naraz na jednym
-- numerze to co innego niż trzy numery — i to pierwsze było w ustaleniu.
UPDATE public.billing_plan_features pf
   SET limit_value = 1
  FROM public.billing_plans p, public.billing_features f
 WHERE pf.plan_id = p.id
   AND pf.feature_id = f.id
   AND p.code = 'agent_pro'
   AND f.key  = 'voice_numbers';

-- ── Kontrola po zmianie ─────────────────────────────────────────────────────
SELECT 'doladowanie minut' AS co, code, is_active::text, step::text, min_units::text,
       unit_price_net::text
  FROM public.billing_addon_products WHERE code = 'voice_minutes'
UNION ALL
SELECT 'plan agenta', code, is_active::text, NULL, NULL, price_net::text
  FROM public.billing_plans WHERE product_line = 'agent'
UNION ALL
SELECT 'agent_pro: ' || f.name, p.code, pf.is_enabled::text, NULL, NULL, pf.limit_value::text
  FROM public.billing_plan_features pf
  JOIN public.billing_plans p ON p.id = pf.plan_id
  JOIN public.billing_features f ON f.id = pf.feature_id
 WHERE p.code = 'agent_pro' AND f.key IN ('voice_minutes','voice_concurrent_calls','voice_numbers')
 ORDER BY 1, 2;

COMMIT;
