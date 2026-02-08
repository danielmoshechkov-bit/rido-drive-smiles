-- Fix: Allow NULL phone in marketplace_user_profiles for registration
ALTER TABLE public.marketplace_user_profiles 
ALTER COLUMN phone DROP NOT NULL;