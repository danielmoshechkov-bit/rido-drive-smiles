
-- Token cache for Inter Cars OAuth2 (keyed by integration ID)
CREATE TABLE IF NOT EXISTS public.intercars_token_cache (
  integration_id UUID PRIMARY KEY,
  access_token TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.intercars_token_cache ENABLE ROW LEVEL SECURITY;

-- No public access - only service role via edge functions
CREATE INDEX IF NOT EXISTS idx_intercars_token_expires ON public.intercars_token_cache(expires_at);
