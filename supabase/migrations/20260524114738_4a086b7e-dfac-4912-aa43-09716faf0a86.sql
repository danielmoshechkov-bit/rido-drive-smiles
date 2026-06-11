CREATE OR REPLACE FUNCTION public.generate_telegram_token()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id uuid;
  v_token text;
  v_expires timestamptz;
  v_bot_username text;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_token := replace(gen_random_uuid()::text, '-', '');
  v_expires := now() + interval '5 minutes';

  INSERT INTO public.telegram_connections (user_id, connection_token, token_expires_at)
  VALUES (v_user_id, v_token, v_expires)
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
    'expires_at', v_expires
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