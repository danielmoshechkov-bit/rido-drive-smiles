-- Najpierw zaktualizuj istniejące dane
UPDATE public.sales_leads 
SET ai_call_status = 'scheduled' 
WHERE ai_call_status = 'pending';

-- Teraz dodaj constraint
ALTER TABLE public.sales_leads 
ADD CONSTRAINT sales_leads_ai_call_status_check 
CHECK (ai_call_status IN ('never_called', 'scheduled', 'in_progress', 'completed', 'failed', 'not_interested', 'callback_requested', 'booking_made'));