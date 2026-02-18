-- Clear corrupted debt data from settlements so it can be recalculated correctly once
UPDATE settlements 
SET debt_before = NULL, 
    debt_after = NULL, 
    debt_payment = NULL
WHERE debt_after IS NOT NULL;