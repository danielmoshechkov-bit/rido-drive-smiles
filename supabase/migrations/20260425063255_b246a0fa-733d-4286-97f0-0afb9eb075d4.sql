ALTER TABLE public.workshop_orders REPLICA IDENTITY FULL;
ALTER TABLE public.workshop_order_items REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.workshop_orders;
ALTER PUBLICATION supabase_realtime ADD TABLE public.workshop_order_items;