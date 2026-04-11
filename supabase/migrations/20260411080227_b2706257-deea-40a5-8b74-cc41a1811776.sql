CREATE TABLE IF NOT EXISTS public.intercars_token_cache (
  integration_id UUID PRIMARY KEY,
  access_token TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.intercars_token_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on intercars_token_cache"
  ON public.intercars_token_cache
  FOR ALL
  USING (true)
  WITH CHECK (true);