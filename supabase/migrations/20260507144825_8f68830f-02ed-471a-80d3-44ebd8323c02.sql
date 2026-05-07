-- Clear test invoices for Anastasiia and reset numbering
DELETE FROM public.user_invoice_items
  WHERE invoice_id IN (SELECT id FROM public.user_invoices WHERE user_id = '44baae8f-2fe8-42c3-88f2-814c43a8d076');

DELETE FROM public.user_invoices
  WHERE user_id = '44baae8f-2fe8-42c3-88f2-814c43a8d076';

DELETE FROM public.invoice_sequences
  WHERE user_id = '44baae8f-2fe8-42c3-88f2-814c43a8d076';
