
-- AI Agents Config table
CREATE TABLE IF NOT EXISTS public.ai_agents_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id text UNIQUE NOT NULL,
  name text NOT NULL,
  icon text DEFAULT 'bot',
  description text,
  model text NOT NULL DEFAULT 'claude-haiku-4-5-20251001',
  system_prompt text,
  is_active boolean DEFAULT true,
  last_test_at timestamptz,
  last_test_result text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.ai_agents_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage ai_agents_config" ON public.ai_agents_config
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Add ai_category and entity_id to purchase_invoices if missing
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='purchase_invoices' AND column_name='ai_category') THEN
    ALTER TABLE public.purchase_invoices ADD COLUMN ai_category text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='purchase_invoices' AND column_name='entity_id') THEN
    ALTER TABLE public.purchase_invoices ADD COLUMN entity_id uuid REFERENCES public.entities(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='purchase_invoices' AND column_name='ai_notes') THEN
    ALTER TABLE public.purchase_invoices ADD COLUMN ai_notes text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='purchase_invoices' AND column_name='account_kpir') THEN
    ALTER TABLE public.purchase_invoices ADD COLUMN account_kpir text;
  END IF;
END $$;

-- Insert default agents
INSERT INTO public.ai_agents_config (agent_id, name, icon, description, model, system_prompt) VALUES
  ('ksef_monitor', 'KSeF Monitor', 'shield', 'Codziennie skanuje strony MF i wykrywa zmiany w API KSeF', 'claude-haiku-4-5-20251001', 'Jesteś agentem monitorującym KSeF. Analizuj treść stron MF i wykrywaj zmiany istotne dla systemu fakturowego.'),
  ('accounting_assistant', 'Asystent Księgowy AI', 'calculator', 'Kategoryzuje faktury zakupowe, przypasowuje do kont księgowych i pozycji magazynowych', 'claude-sonnet-4-6', 'Jesteś asystentem księgowym. Analizujesz faktury zakupowe i kategoryzujesz je: paliwo→koszty paliwa, parts→magazyn, usługi→koszty operacyjne. Podaj kategorię, konto KPiR i czy trafia do magazynu.'),
  ('report_generator', 'Generator Raportów', 'file-text', 'Na koniec miesiąca generuje zestawienia faktur wystawionych i odebranych', 'claude-haiku-4-5-20251001', 'Jesteś generatorem raportów. Na podstawie danych faktur tworzysz czytelne podsumowanie miesięczne z podziałem VAT.')
ON CONFLICT (agent_id) DO NOTHING;
