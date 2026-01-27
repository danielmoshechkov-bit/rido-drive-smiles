-- Add inventory_product_id column to user_invoice_items for margin tracking
ALTER TABLE public.user_invoice_items 
ADD COLUMN IF NOT EXISTS inventory_product_id UUID REFERENCES inventory_products(id);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_invoice_items_inventory_product 
ON public.user_invoice_items(inventory_product_id) 
WHERE inventory_product_id IS NOT NULL;