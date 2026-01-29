-- Table for managing portal categories (tiles on category pages)
CREATE TABLE public.portal_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portal_context TEXT NOT NULL CHECK (portal_context IN ('motoryzacja', 'nieruchomosci', 'uslugi')),
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  image_url TEXT,
  link_url TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_visible BOOLEAN NOT NULL DEFAULT true,
  service_category_id UUID REFERENCES public.service_categories(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(portal_context, slug)
);

-- Enable RLS
ALTER TABLE public.portal_categories ENABLE ROW LEVEL SECURITY;

-- Everyone can read visible categories
CREATE POLICY "Anyone can read visible portal categories"
  ON public.portal_categories FOR SELECT
  USING (is_visible = true);

-- Only admins can manage categories
CREATE POLICY "Admins can manage portal categories"
  ON public.portal_categories FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Trigger for updated_at
CREATE TRIGGER update_portal_categories_updated_at
  BEFORE UPDATE ON public.portal_categories
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default categories for Motoryzacja
INSERT INTO public.portal_categories (portal_context, name, slug, description, link_url, sort_order) VALUES
  ('motoryzacja', 'Ogłoszenia', 'ogloszenia', 'Przeglądaj ogłoszenia motoryzacyjne', '/gielda', 1),
  ('motoryzacja', 'Warsztaty', 'warsztaty', 'Znajdź najlepsze warsztaty', '/uslugi?category=warsztat', 2),
  ('motoryzacja', 'Auto detailing', 'detailing', 'Profesjonalne usługi detailingowe', '/uslugi?category=detailing', 3),
  ('motoryzacja', 'Studio PPF', 'ppf', 'Folie ochronne i PPF', '/uslugi?category=ppf', 4),
  ('motoryzacja', 'Portal flotowy', 'portal-flotowy', 'Rozliczaj kierowców i zarządzaj flotą', '/fleet-info', 5),
  ('motoryzacja', 'Portal kierowcy', 'portal-kierowcy', 'Panel dla kierowców', '/driver-info', 6);

-- Insert default categories for Nieruchomości
INSERT INTO public.portal_categories (portal_context, name, slug, description, link_url, sort_order) VALUES
  ('nieruchomosci', 'Ogłoszenia', 'ogloszenia', 'Przeglądaj oferty nieruchomości', '/nieruchomosci', 1),
  ('nieruchomosci', 'Remonty', 'remonty', 'Usługi remontowe i wykończeniowe', '/uslugi?category=remonty', 2),
  ('nieruchomosci', 'Projektanci wnętrz', 'projektanci', 'Profesjonalni projektanci', '/uslugi?category=projektanci', 3),
  ('nieruchomosci', 'Sprzątanie', 'sprzatanie', 'Usługi sprzątające', '/uslugi?category=sprzatanie', 4),
  ('nieruchomosci', 'Przeprowadzki', 'przeprowadzki', 'Usługi przeprowadzkowe', '/uslugi?category=przeprowadzki', 5),
  ('nieruchomosci', 'Hydraulik', 'hydraulik', 'Usługi hydrauliczne', '/uslugi?category=hydraulik', 6);

-- Insert default categories for Usługi (main services portal)
INSERT INTO public.portal_categories (portal_context, name, slug, description, link_url, sort_order) VALUES
  ('uslugi', 'Wszystkie usługi', 'wszystkie', 'Przeglądaj wszystkie kategorie', '/uslugi', 1);