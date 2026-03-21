-- Fix outdated Gemini model (gemini-2.0-flash deprecated, 404)
UPDATE public.ai_providers 
SET default_model = 'gemini-2.5-flash' 
WHERE provider_key IN ('gemini', 'google_gemini', 'gemini_flash', 'gemini_pro')
  AND (default_model = 'gemini-2.0-flash' OR default_model IS NULL OR default_model = '');

-- Sync Claude API key from haiku to sonnet/opus
UPDATE public.ai_providers 
SET api_key_encrypted = (SELECT api_key_encrypted FROM public.ai_providers WHERE provider_key = 'claude_haiku' LIMIT 1)
WHERE provider_key IN ('claude_sonnet', 'claude_opus') 
  AND (api_key_encrypted IS NULL OR api_key_encrypted = '');

-- Sync Gemini API key to familia
UPDATE public.ai_providers 
SET api_key_encrypted = (SELECT api_key_encrypted FROM public.ai_providers WHERE provider_key = 'gemini' LIMIT 1)
WHERE provider_key IN ('gemini_flash', 'imagen3') 
  AND (api_key_encrypted IS NULL OR api_key_encrypted = '');