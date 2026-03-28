ALTER TABLE ai_function_mapping 
  ADD COLUMN IF NOT EXISTS backup_provider_key text,
  ADD COLUMN IF NOT EXISTS allow_fallback boolean DEFAULT true;