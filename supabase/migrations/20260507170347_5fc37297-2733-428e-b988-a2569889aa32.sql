-- Fix invoice sequence for Anastasiia: sync to actual last invoice number
UPDATE invoice_sequences 
SET last_number = COALESCE((
  SELECT MAX(CAST(SPLIT_PART(invoice_number, '/', 4) AS INTEGER))
  FROM user_invoices
  WHERE user_id = '44baae8f-2fe8-42c3-88f2-814c43a8d076'
    AND invoice_number LIKE 'FV/2026/05/%'
), 0)
WHERE user_id = '44baae8f-2fe8-42c3-88f2-814c43a8d076' AND year = 2026 AND month = 5;