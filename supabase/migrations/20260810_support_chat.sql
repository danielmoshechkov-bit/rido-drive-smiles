-- Czat wsparcia: rozmowa klient <-> admin GetRido.
--
-- Osobno od `support_tickets` (tamto to jednokierunkowe zgłoszenia błędów
-- z generowaniem promptu naprawczego). Tu chodzi o żywą rozmowę: klient pisze
-- z dymka w portalu, admin odpowiada ze skrzynki w /admin/portal.
--
-- ZASADA BEZPIECZEŃSTWA: żadnej polityki „każdy może czytać". Zalogowany widzi
-- wyłącznie swoje rozmowy, admin wszystkie. Rozmowy gości (bez konta) obsłuży
-- w etapie 2 funkcja serwerowa z tokenem — nie anonimowy dostęp do tabeli.

CREATE TABLE IF NOT EXISTS public.support_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  -- kontakt: dla zalogowanego kopiowany z konta, dla gościa podany w dymku
  contact_email text,
  contact_name text,
  contact_phone text,
  -- token rozmowy gościa (etap 2) — losowy, trzymany w przeglądarce klienta
  guest_token text UNIQUE,
  subject text,
  -- skąd pisał: adres strony, z której otworzył czat (kontekst dla admina)
  origin_path text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  last_message_at timestamptz NOT NULL DEFAULT now(),
  -- liczniki nieprzeczytanych, utrzymywane triggerem przy wstawianiu wiadomości
  unread_for_admin integer NOT NULL DEFAULT 0,
  unread_for_user integer NOT NULL DEFAULT 0,
  -- kiedy ostatnio poszło powiadomienie SMS (limit częstotliwości, etap 2)
  admin_notified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT support_conversations_identified CHECK (user_id IS NOT NULL OR guest_token IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS public.support_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.support_conversations(id) ON DELETE CASCADE,
  sender_role text NOT NULL CHECK (sender_role IN ('user', 'admin')),
  sender_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  sender_name text,
  body text NOT NULL CHECK (length(btrim(body)) > 0),
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_support_messages_conversation
  ON public.support_messages (conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_support_conversations_user
  ON public.support_conversations (user_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_conversations_inbox
  ON public.support_conversations (last_message_at DESC);

-- ── Licznik nieprzeczytanych + czas ostatniej wiadomości ───────────────────
CREATE OR REPLACE FUNCTION public.support_touch_conversation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.support_conversations
     SET last_message_at = NEW.created_at,
         unread_for_admin = CASE WHEN NEW.sender_role = 'user'  THEN unread_for_admin + 1 ELSE unread_for_admin END,
         unread_for_user  = CASE WHEN NEW.sender_role = 'admin' THEN unread_for_user  + 1 ELSE unread_for_user  END,
         status = 'open'
   WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_support_touch_conversation ON public.support_messages;
CREATE TRIGGER trg_support_touch_conversation
  AFTER INSERT ON public.support_messages
  FOR EACH ROW EXECUTE FUNCTION public.support_touch_conversation();

-- ── Uprawnienia ───────────────────────────────────────────────────────────
ALTER TABLE public.support_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;

-- czy bieżący użytkownik jest adminem (ta sama tabela ról, co reszta portalu)
CREATE OR REPLACE FUNCTION public.is_support_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role::text = 'admin'
  );
$$;

DROP POLICY IF EXISTS "support_conv_select" ON public.support_conversations;
CREATE POLICY "support_conv_select" ON public.support_conversations
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_support_admin());

DROP POLICY IF EXISTS "support_conv_insert" ON public.support_conversations;
CREATE POLICY "support_conv_insert" ON public.support_conversations
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "support_conv_update" ON public.support_conversations;
CREATE POLICY "support_conv_update" ON public.support_conversations
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.is_support_admin())
  WITH CHECK (user_id = auth.uid() OR public.is_support_admin());

DROP POLICY IF EXISTS "support_msg_select" ON public.support_messages;
CREATE POLICY "support_msg_select" ON public.support_messages
  FOR SELECT TO authenticated
  USING (
    public.is_support_admin()
    OR EXISTS (
      SELECT 1 FROM public.support_conversations c
      WHERE c.id = conversation_id AND c.user_id = auth.uid()
    )
  );

-- Klient pisze tylko jako 'user' i tylko w swojej rozmowie; admin jako 'admin'.
DROP POLICY IF EXISTS "support_msg_insert" ON public.support_messages;
CREATE POLICY "support_msg_insert" ON public.support_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    (
      sender_role = 'admin'
      AND public.is_support_admin()
      AND sender_user_id = auth.uid()
    )
    OR (
      sender_role = 'user'
      AND sender_user_id = auth.uid()
      AND EXISTS (
        SELECT 1 FROM public.support_conversations c
        WHERE c.id = conversation_id AND c.user_id = auth.uid()
      )
    )
  );

-- Wiadomości nie da się edytować ani kasować z aplikacji (brak polityk UPDATE/DELETE).

-- Podgląd na żywo w dymku i w skrzynce admina.
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.support_messages;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.support_conversations;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

COMMENT ON TABLE public.support_conversations IS 'Czat wsparcia GetRido — wątek rozmowy klient <-> admin.';
COMMENT ON TABLE public.support_messages IS 'Pojedyncze wiadomości czatu wsparcia. Bez edycji i kasowania z aplikacji.';
