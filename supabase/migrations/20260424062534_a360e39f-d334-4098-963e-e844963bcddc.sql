-- Naprawa istniejącej transakcji wyzerowania długu dla Anny Zur
-- Przesuwamy datę z 2026-04-19 na 2026-04-12 (dzień przed tygodniem 13-19.04),
-- aby recalculate-week wliczył ją do długu wchodzącego (debt_before) tygodnia 15.
UPDATE driver_debt_transactions
SET period_from = '2026-04-12', period_to = '2026-04-12'
WHERE id = '82378d38-f4f7-4194-bf54-d80729d09eef';

-- Globalnie: napraw wszystkie inne wyzerowania długu, które trafiły w środek tygodnia
-- (ten sam błąd mógł wystąpić u innych kierowców)
UPDATE driver_debt_transactions ddt
SET 
  period_from = (
    SELECT (s.period_from::date - INTERVAL '1 day')::date
    FROM settlements s
    WHERE s.driver_id = ddt.driver_id
      AND ddt.period_from BETWEEN s.period_from AND s.period_to
    ORDER BY s.period_from DESC
    LIMIT 1
  ),
  period_to = (
    SELECT (s.period_from::date - INTERVAL '1 day')::date
    FROM settlements s
    WHERE s.driver_id = ddt.driver_id
      AND ddt.period_from BETWEEN s.period_from AND s.period_to
    ORDER BY s.period_from DESC
    LIMIT 1
  )
WHERE ddt.type = 'payment'
  AND ddt.description ILIKE '%Wyzerowanie długu przez administratora%'
  AND EXISTS (
    SELECT 1 FROM settlements s
    WHERE s.driver_id = ddt.driver_id
      AND ddt.period_from BETWEEN s.period_from AND s.period_to
  );

-- Wyzeruj snapshoty debt_before/after/payment dla tygodnia 13-19.04 dla Anny,
-- żeby tabela natychmiast pokazała 0 (recalculate-week zostanie wywołany przez UI).
UPDATE settlements
SET debt_before = 0, debt_payment = 0, debt_after = 0, actual_payout = 0
WHERE driver_id = '14467376-4b37-4373-bfa1-f8788410b229'
  AND period_from = '2026-04-13' AND period_to = '2026-04-19';