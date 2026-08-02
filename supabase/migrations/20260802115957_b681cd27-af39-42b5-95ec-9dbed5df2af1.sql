-- 1) Nowe kategorie motoryzacyjne w katalogu portalu
INSERT INTO public.service_categories (slug, name, icon, description, sort_order, is_active) VALUES
  ('myjnia', 'Myjnia samochodowa', 'droplets', 'Mycie ręczne, bezdotykowe, pranie tapicerki', 13, true),
  ('wulkanizacja', 'Wulkanizacja i opony', 'wrench', 'Wymiana, wyważanie, naprawa i przechowywanie opon', 14, true),
  ('klimatyzacja', 'Klimatyzacja samochodowa', 'zap', 'Nabijanie, odgrzybianie, naprawa układu klimatyzacji', 15, true),
  ('mechanika', 'Mechanika pojazdowa', 'wrench', 'Naprawy mechaniczne, zawieszenie, hamulce, silnik', 16, true),
  ('elektryka-auto', 'Elektryka samochodowa', 'zap', 'Diagnostyka komputerowa, instalacje, akumulatory', 17, true),
  ('blacharstwo', 'Blacharstwo i lakiernictwo', 'hammer', 'Naprawy powypadkowe, lakierowanie, polerowanie', 18, true),
  ('auto-szyby', 'Auto szyby', 'shield', 'Wymiana i naprawa szyb, przyciemnianie', 19, true),
  ('serwis-lpg', 'Instalacje LPG', 'zap', 'Montaż i serwis instalacji gazowych', 20, true),
  ('przeglady', 'Stacja kontroli pojazdów', 'shield', 'Przeglądy techniczne i badania diagnostyczne', 21, true),
  ('holowanie', 'Pomoc drogowa i holowanie', 'truck', 'Holowanie, wyciąganie, transport pojazdów', 22, true)
ON CONFLICT (slug) DO NOTHING;

-- 2) Powiązanie kategorii usługodawcy z katalogiem portalu
ALTER TABLE public.provider_service_categories
  ADD COLUMN IF NOT EXISTS service_category_id uuid REFERENCES public.service_categories(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_psc_service_category ON public.provider_service_categories(service_category_id);

-- 3) Zgłoszenia nowych kategorii / usług od użytkowników
CREATE TABLE IF NOT EXISTS public.category_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider_id uuid REFERENCES public.service_providers(id) ON DELETE SET NULL,
  requested_category_name text NOT NULL,
  category_description text,
  example_services text,
  contact_email text,
  status text NOT NULL DEFAULT 'pending',
  admin_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.category_requests TO authenticated;
GRANT ALL ON public.category_requests TO service_role;

ALTER TABLE public.category_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users insert own category requests" ON public.category_requests;
CREATE POLICY "Users insert own category requests"
  ON public.category_requests FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users read own category requests" ON public.category_requests;
CREATE POLICY "Users read own category requests"
  ON public.category_requests FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins manage category requests" ON public.category_requests;
CREATE POLICY "Admins manage category requests"
  ON public.category_requests FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));