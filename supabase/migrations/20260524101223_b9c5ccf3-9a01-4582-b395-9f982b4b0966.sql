-- 1. app_settings (key/value config)
CREATE TABLE IF NOT EXISTS public.app_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "app_settings_read_all" ON public.app_settings;
CREATE POLICY "app_settings_read_all" ON public.app_settings
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "app_settings_admin_write" ON public.app_settings;
CREATE POLICY "app_settings_admin_write" ON public.app_settings
  FOR ALL USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- 2. telegram_connections
CREATE TABLE IF NOT EXISTS public.telegram_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  telegram_chat_id bigint UNIQUE,
  telegram_username text,
  telegram_first_name text,
  telegram_last_name text,
  connection_token text UNIQUE,
  token_expires_at timestamptz,
  connected_at timestamptz,
  last_message_sent_at timestamptz,
  is_active boolean NOT NULL DEFAULT false,
  messages_sent_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tg_conn_token ON public.telegram_connections(connection_token);
CREATE INDEX IF NOT EXISTS idx_tg_conn_chat ON public.telegram_connections(telegram_chat_id);

ALTER TABLE public.telegram_connections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tg_conn_own_select" ON public.telegram_connections;
CREATE POLICY "tg_conn_own_select" ON public.telegram_connections
  FOR SELECT USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "tg_conn_own_update" ON public.telegram_connections;
CREATE POLICY "tg_conn_own_update" ON public.telegram_connections
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "tg_conn_own_insert" ON public.telegram_connections;
CREATE POLICY "tg_conn_own_insert" ON public.telegram_connections
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "tg_conn_own_delete" ON public.telegram_connections;
CREATE POLICY "tg_conn_own_delete" ON public.telegram_connections
  FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER trg_tg_conn_updated_at
  BEFORE UPDATE ON public.telegram_connections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. notification_preferences
CREATE TABLE IF NOT EXISTS public.notification_preferences (
  user_id uuid PRIMARY KEY,
  prefs jsonb NOT NULL DEFAULT '{}'::jsonb,
  quiet_hours_enabled boolean NOT NULL DEFAULT true,
  quiet_hours_start time NOT NULL DEFAULT '20:00',
  quiet_hours_end time NOT NULL DEFAULT '08:00',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notif_prefs_own_all" ON public.notification_preferences;
CREATE POLICY "notif_prefs_own_all" ON public.notification_preferences
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER trg_notif_prefs_updated_at
  BEFORE UPDATE ON public.notification_preferences
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. notification_log
CREATE TABLE IF NOT EXISTS public.notification_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  notification_type text NOT NULL,
  channel text NOT NULL,
  status text NOT NULL,
  payload jsonb,
  error_message text,
  sent_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notif_log_user ON public.notification_log(user_id);
CREATE INDEX IF NOT EXISTS idx_notif_log_sent_at ON public.notification_log(sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_notif_log_type ON public.notification_log(notification_type);
CREATE INDEX IF NOT EXISTS idx_notif_log_status ON public.notification_log(status);

ALTER TABLE public.notification_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notif_log_admin_select" ON public.notification_log;
CREATE POLICY "notif_log_admin_select" ON public.notification_log
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'::app_role));

-- 5. RPCs
CREATE OR REPLACE FUNCTION public.generate_telegram_token()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_token text;
  v_bot_username text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_token := encode(gen_random_bytes(16), 'hex');

  INSERT INTO public.telegram_connections (user_id, connection_token, token_expires_at)
  VALUES (v_uid, v_token, now() + interval '15 minutes')
  ON CONFLICT (user_id) DO UPDATE
    SET connection_token = EXCLUDED.connection_token,
        token_expires_at = EXCLUDED.token_expires_at,
        updated_at = now();

  SELECT value->>'username' INTO v_bot_username
  FROM public.app_settings WHERE key = 'telegram_bot_username';

  RETURN jsonb_build_object(
    'token', v_token,
    'bot_username', COALESCE(v_bot_username, ''),
    'link', CASE
      WHEN v_bot_username IS NOT NULL AND v_bot_username <> ''
        THEN 'https://t.me/' || v_bot_username || '?start=' || v_token
      ELSE NULL
    END,
    'expires_at', (now() + interval '15 minutes')
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.disconnect_telegram()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  UPDATE public.telegram_connections
  SET is_active = false,
      telegram_chat_id = NULL,
      connection_token = NULL,
      token_expires_at = NULL,
      updated_at = now()
  WHERE user_id = auth.uid();
END;
$$;

-- Realtime
ALTER TABLE public.telegram_connections REPLICA IDENTITY FULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'telegram_connections'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.telegram_connections';
  END IF;
END $$;