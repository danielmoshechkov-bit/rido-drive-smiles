ALTER TABLE public.workspace_channels
ADD COLUMN IF NOT EXISTS order_index integer;

WITH ranked_channels AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY project_id
           ORDER BY created_at ASC, name ASC, id ASC
         ) - 1 AS new_order_index
  FROM public.workspace_channels
)
UPDATE public.workspace_channels wc
SET order_index = ranked_channels.new_order_index
FROM ranked_channels
WHERE wc.id = ranked_channels.id
  AND wc.order_index IS NULL;

ALTER TABLE public.workspace_channels
ALTER COLUMN order_index SET DEFAULT 0;

UPDATE public.workspace_channels
SET order_index = 0
WHERE order_index IS NULL;

CREATE INDEX IF NOT EXISTS idx_workspace_channels_project_order
ON public.workspace_channels (project_id, order_index, created_at);