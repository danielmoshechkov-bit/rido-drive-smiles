INSERT INTO public.ai_routing_rules (task_type, primary_provider_key, allow_fallback)
SELECT 'translation', 'kimi', true
WHERE NOT EXISTS (SELECT 1 FROM public.ai_routing_rules WHERE task_type = 'translation');