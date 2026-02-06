-- Add service_provider role to app_role enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'service_provider';