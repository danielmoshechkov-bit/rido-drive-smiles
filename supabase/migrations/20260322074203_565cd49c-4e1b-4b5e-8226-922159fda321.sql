INSERT INTO public.ai_routing_rules (task_type, primary_provider_key, secondary_provider_key, allow_fallback)
VALUES ('translation', 'kimi', 'google_gemini', true)
ON CONFLICT (task_type) DO NOTHING;