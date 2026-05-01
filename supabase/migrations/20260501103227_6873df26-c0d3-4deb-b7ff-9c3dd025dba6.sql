UPDATE driver_weekly_debts
SET remaining_debt = 779.11,
    visible_debt = 733.30,
    source_note = 'Dług otwarcia 733.30 + dodatkowy dług 45.81 z tygodnia (-779.11)',
    updated_at = now()
WHERE driver_id = '27443f5e-bd84-4677-85bf-c45720c629c0'
  AND period_from = '2026-04-20'
  AND period_to = '2026-04-26';