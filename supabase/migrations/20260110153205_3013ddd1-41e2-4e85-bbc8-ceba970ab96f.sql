-- Add real_estate_admin to the app_role enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'real_estate_admin';