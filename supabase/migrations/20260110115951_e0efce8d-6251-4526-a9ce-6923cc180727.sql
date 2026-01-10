-- Enable account switching feature toggle
UPDATE feature_toggles 
SET is_enabled = true, updated_at = now()
WHERE feature_key = 'account_switching_enabled';