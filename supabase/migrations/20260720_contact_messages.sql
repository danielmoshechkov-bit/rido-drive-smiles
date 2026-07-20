-- Zgłoszenia z publicznego formularza kontaktowego (/kontakt).
-- INSERT wykonuje wyłącznie edge function contact-form (service role, omija RLS)
-- — brak polityki INSERT dla anon/authenticated jest celowy.
CREATE TABLE IF NOT EXISTS public.contact_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  name text NOT NULL,
  email text NOT NULL,
  phone text,
  city text,
  message text NOT NULL,
  ip text,
  user_agent text,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'read', 'replied', 'spam'))
);

-- Rate limiting po IP w edge function (zapytanie o liczbę zgłoszeń z ostatniej godziny)
CREATE INDEX IF NOT EXISTS contact_messages_ip_created_idx
  ON public.contact_messages (ip, created_at);

ALTER TABLE public.contact_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read contact_messages" ON public.contact_messages
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins update contact_messages" ON public.contact_messages
  FOR UPDATE USING (public.has_role(auth.uid(), 'admin'));
