-- Liczniki nieprzeczytanych muszą rozróżniać, kto odpisał.
--
-- 1) Odpowiedź asystenta też jest odpowiedzią dla klienta → podbija jego licznik.
-- 2) Gdy asystent obsłużył pytanie, admin nie ma po co dostawać alertu — inaczej
--    pierwsza linia AI nie zdejmuje z niego ani jednego powiadomienia.
CREATE OR REPLACE FUNCTION public.support_touch_conversation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.support_conversations
     SET last_message_at = NEW.created_at,
         unread_for_admin = CASE WHEN NEW.sender_role = 'user' THEN unread_for_admin + 1 ELSE unread_for_admin END,
         unread_for_user  = CASE WHEN NEW.sender_role IN ('admin', 'ai') THEN unread_for_user + 1 ELSE unread_for_user END,
         status = 'open'
   WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$;
