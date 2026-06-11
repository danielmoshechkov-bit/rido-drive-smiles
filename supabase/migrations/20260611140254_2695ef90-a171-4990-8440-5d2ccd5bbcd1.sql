DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='workshop_order_assignments') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.workshop_order_assignments;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='workshop_order_events') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.workshop_order_events;
  END IF;
END $$;
ALTER TABLE public.workshop_order_assignments REPLICA IDENTITY FULL;
ALTER TABLE public.workshop_order_events REPLICA IDENTITY FULL;