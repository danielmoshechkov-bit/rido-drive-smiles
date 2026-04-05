INSERT INTO ai_agents_config (agent_id, name, description, icon, model, system_prompt, is_active)
VALUES (
  'listing_translation',
  'Tłumaczenie ogłoszeń',
  'Automatyczne tłumaczenie tytułów i opisów ogłoszeń marketplace',
  'globe',
  'moonshot-v1-8k',
  'You are a professional marketplace listing translator. Translate accurately and naturally. Keep brand names, model numbers, prices unchanged.',
  true
)
ON CONFLICT (agent_id) DO NOTHING;