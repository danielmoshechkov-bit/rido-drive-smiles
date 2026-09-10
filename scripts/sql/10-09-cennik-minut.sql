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

-- ── Kontrola po zmianie ─────────────────────────────────────────────────────
SELECT 'doladowanie minut' AS co, code, is_active::text, step::text, min_units::text,
       unit_price_net::text
  FROM public.billing_addon_products WHERE code = 'voice_minutes'
UNION ALL
SELECT 'plan agenta', code, is_active::text, NULL, NULL, price_net::text
  FROM public.billing_plans WHERE product_line = 'agent' ORDER BY 1, 2;

COMMIT;
