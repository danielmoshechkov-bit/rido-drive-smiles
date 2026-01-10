-- Dodać wartość real_estate_agent do enum app_role
ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'real_estate_agent';