-- WYN10: Powiązanie pozycji zlecenia z produktem magazynowym (Kasa↔Magazyn).
-- PO CO: część dodana do zlecenia schodzi ze stanu (FIFO), zwrot przy usunięciu;
-- pozycja bez powiązania (usługa/część spoza magazynu) nie rusza stanu.
ALTER TABLE public.workshop_order_items
  ADD COLUMN IF NOT EXISTS inventory_product_id uuid REFERENCES public.inventory_products(id);
CREATE INDEX IF NOT EXISTS idx_workshop_order_items_inv_product
  ON public.workshop_order_items(inventory_product_id);
