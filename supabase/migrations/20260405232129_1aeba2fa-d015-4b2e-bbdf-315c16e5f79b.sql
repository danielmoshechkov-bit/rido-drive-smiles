
-- Function to auto-queue new listings for translation
CREATE OR REPLACE FUNCTION public.auto_queue_translation()
RETURNS TRIGGER AS $$
DECLARE
  src_lang TEXT := 'pl';
  target TEXT[] := ARRAY['en','ru','de','ua'];
BEGIN
  -- Detect source language from title
  IF NEW.title ~ '[а-яА-ЯёЁіІїЇєЄґҐ]' THEN
    src_lang := 'ru';
    target := ARRAY['pl','en','de','ua'];
  ELSIF NEW.title ~ '^[a-zA-Z0-9\s\-\.\,\!\?\:]+$' AND length(NEW.title) > 3 THEN
    src_lang := 'en';
    target := ARRAY['pl','ru','de','ua'];
  END IF;

  INSERT INTO public.translation_queue (
    listing_id, listing_type, title, description,
    source_lang, target_langs, priority, source, status
  ) VALUES (
    NEW.id,
    TG_ARGV[0],
    NEW.title,
    COALESCE(NEW.description, ''),
    src_lang,
    target,
    9,
    'trigger',
    'pending'
  )
  ON CONFLICT DO NOTHING;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Function to re-queue on title/description update
CREATE OR REPLACE FUNCTION public.auto_requeue_on_update()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.title IS DISTINCT FROM OLD.title OR NEW.description IS DISTINCT FROM OLD.description THEN
    -- Delete old translations
    DELETE FROM public.listing_translations WHERE listing_id = NEW.id AND listing_type = TG_ARGV[0];
    
    -- Reset existing queue entry or insert new one
    DELETE FROM public.translation_queue WHERE listing_id = NEW.id AND listing_type = TG_ARGV[0];
    
    -- Re-detect language and queue
    DECLARE
      src_lang TEXT := 'pl';
      target TEXT[] := ARRAY['en','ru','de','ua'];
    BEGIN
      IF NEW.title ~ '[а-яА-ЯёЁіІїЇєЄґҐ]' THEN
        src_lang := 'ru';
        target := ARRAY['pl','en','de','ua'];
      ELSIF NEW.title ~ '^[a-zA-Z0-9\s\-\.\,\!\?\:]+$' AND length(NEW.title) > 3 THEN
        src_lang := 'en';
        target := ARRAY['pl','ru','de','ua'];
      END IF;

      INSERT INTO public.translation_queue (
        listing_id, listing_type, title, description,
        source_lang, target_langs, priority, source, status
      ) VALUES (
        NEW.id, TG_ARGV[0], NEW.title, COALESCE(NEW.description, ''),
        src_lang, target, 8, 'trigger_update', 'pending'
      );
    END;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Triggers on general_listings
DROP TRIGGER IF EXISTS tr_queue_general ON public.general_listings;
CREATE TRIGGER tr_queue_general
  AFTER INSERT ON public.general_listings
  FOR EACH ROW EXECUTE FUNCTION public.auto_queue_translation('general');

DROP TRIGGER IF EXISTS tr_requeue_general ON public.general_listings;
CREATE TRIGGER tr_requeue_general
  AFTER UPDATE ON public.general_listings
  FOR EACH ROW EXECUTE FUNCTION public.auto_requeue_on_update('general');

-- Triggers on vehicle_listings
DROP TRIGGER IF EXISTS tr_queue_vehicle ON public.vehicle_listings;
CREATE TRIGGER tr_queue_vehicle
  AFTER INSERT ON public.vehicle_listings
  FOR EACH ROW EXECUTE FUNCTION public.auto_queue_translation('vehicle');

DROP TRIGGER IF EXISTS tr_requeue_vehicle ON public.vehicle_listings;
CREATE TRIGGER tr_requeue_vehicle
  AFTER UPDATE ON public.vehicle_listings
  FOR EACH ROW EXECUTE FUNCTION public.auto_requeue_on_update('vehicle');

-- Triggers on real_estate_listings
DROP TRIGGER IF EXISTS tr_queue_realestate ON public.real_estate_listings;
CREATE TRIGGER tr_queue_realestate
  AFTER INSERT ON public.real_estate_listings
  FOR EACH ROW EXECUTE FUNCTION public.auto_queue_translation('real_estate');

DROP TRIGGER IF EXISTS tr_requeue_realestate ON public.real_estate_listings;
CREATE TRIGGER tr_requeue_realestate
  AFTER UPDATE ON public.real_estate_listings
  FOR EACH ROW EXECUTE FUNCTION public.auto_requeue_on_update('real_estate');
