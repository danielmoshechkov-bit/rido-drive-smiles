-- Aktywuj moduł stron WWW
UPDATE feature_toggles 
SET is_enabled = true 
WHERE feature_key = 'website_builder_enabled';

-- Aktywuj globalne uczenie AI agentów
UPDATE feature_toggles 
SET is_enabled = true 
WHERE feature_key = 'ai_agents_global_learning';