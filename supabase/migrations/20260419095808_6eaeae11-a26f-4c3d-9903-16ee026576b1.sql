-- Ujednolicenie modeli AI dla funkcji opisów: Kimi główny + Claude zapasowy
UPDATE public.ai_function_mapping
SET 
  provider_key = 'kimi',
  backup_provider_key = 'claude_haiku',
  allow_fallback = true,
  is_enabled = true
WHERE function_key IN ('listing_description', 'vehicle_description_gen', 'listing_seo');

-- Upewnij się, że agent systemowy provider_description używa Kimi
UPDATE public.ai_agents_config
SET model = 'moonshot-v1-8k', is_active = true
WHERE agent_id = 'provider_description';