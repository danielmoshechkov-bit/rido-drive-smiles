-- TURA finanse — PARTIA 4: agregaty platformy (admin) + cennik (SELECT publiczny, WRITE admin)
-- ---------------------------------------------------------------------------
-- rido_settlements (okresy rozliczeń platformy) → admin.
-- daily_sales_reports (analizy AI sprzedaży całej platformy) → SELECT admin LUB
--   marketing_manager (rola istnieje w app_role); WRITE admin (raporty generuje
--   edge/service-role, omija RLS). Marketing dostaje wgląd przez nadanie roli marketing_manager.
-- settlement_plans (cennik planów pokazywany flotom/kierowcom) → NIE PII; SELECT
--   zostaje szeroki (authenticated read), WRITE domknięty do admina.
-- Wszystkie miały ALL USING(true).

-- ── rido_settlements → admin-only ──
DROP POLICY IF EXISTS "Admins can manage rido settlements" ON public.rido_settlements;
CREATE POLICY "rido_settlements_admin" ON public.rido_settlements
  FOR ALL TO authenticated
  USING ( has_role(auth.uid(), 'admin'::app_role) )
  WITH CHECK ( has_role(auth.uid(), 'admin'::app_role) );

-- ── daily_sales_reports → SELECT admin/marketing_manager; WRITE admin ──
DROP POLICY IF EXISTS "Authenticated read daily reports" ON public.daily_sales_reports;
CREATE POLICY "daily_sales_reports_select" ON public.daily_sales_reports
  FOR SELECT TO authenticated
  USING ( has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'marketing_manager'::app_role) );
CREATE POLICY "daily_sales_reports_insert" ON public.daily_sales_reports
  FOR INSERT TO authenticated WITH CHECK ( has_role(auth.uid(), 'admin'::app_role) );
CREATE POLICY "daily_sales_reports_update" ON public.daily_sales_reports
  FOR UPDATE TO authenticated
  USING ( has_role(auth.uid(), 'admin'::app_role) ) WITH CHECK ( has_role(auth.uid(), 'admin'::app_role) );
CREATE POLICY "daily_sales_reports_delete" ON public.daily_sales_reports
  FOR DELETE TO authenticated USING ( has_role(auth.uid(), 'admin'::app_role) );

-- ── settlement_plans → SELECT zostaje publiczny cennik; WRITE → admin ──
DROP POLICY IF EXISTS "Admins can manage settlement plans" ON public.settlement_plans;
CREATE POLICY "settlement_plans_select" ON public.settlement_plans
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "settlement_plans_insert" ON public.settlement_plans
  FOR INSERT TO authenticated WITH CHECK ( has_role(auth.uid(), 'admin'::app_role) );
CREATE POLICY "settlement_plans_update" ON public.settlement_plans
  FOR UPDATE TO authenticated
  USING ( has_role(auth.uid(), 'admin'::app_role) ) WITH CHECK ( has_role(auth.uid(), 'admin'::app_role) );
CREATE POLICY "settlement_plans_delete" ON public.settlement_plans
  FOR DELETE TO authenticated USING ( has_role(auth.uid(), 'admin'::app_role) );

-- =========================================================================
-- ROLLBACK (przywraca stan sprzed PARTII 4):
-- =========================================================================
-- DROP POLICY IF EXISTS "rido_settlements_admin" ON public.rido_settlements;
-- DROP POLICY IF EXISTS "daily_sales_reports_select" ON public.daily_sales_reports;
-- DROP POLICY IF EXISTS "daily_sales_reports_insert" ON public.daily_sales_reports;
-- DROP POLICY IF EXISTS "daily_sales_reports_update" ON public.daily_sales_reports;
-- DROP POLICY IF EXISTS "daily_sales_reports_delete" ON public.daily_sales_reports;
-- DROP POLICY IF EXISTS "settlement_plans_select" ON public.settlement_plans;
-- DROP POLICY IF EXISTS "settlement_plans_insert" ON public.settlement_plans;
-- DROP POLICY IF EXISTS "settlement_plans_update" ON public.settlement_plans;
-- DROP POLICY IF EXISTS "settlement_plans_delete" ON public.settlement_plans;
-- CREATE POLICY "Admins can manage rido settlements" ON public.rido_settlements   FOR ALL TO public USING (true);
-- CREATE POLICY "Authenticated read daily reports"   ON public.daily_sales_reports FOR ALL TO public USING (true);
-- CREATE POLICY "Admins can manage settlement plans"  ON public.settlement_plans   FOR ALL TO public USING (true);
