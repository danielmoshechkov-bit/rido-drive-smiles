-- 1. Usuń stare rozliczenia (zostaw tylko od 1 grudnia 2025)
DELETE FROM settlements 
WHERE week_start < '2025-12-01';

-- 2. Usuń stare okresy rozliczeń
DELETE FROM settlement_periods 
WHERE week_start < '2025-12-01';

-- 3. Usuń CAŁĄ historię przypisań pojazdów
DELETE FROM driver_vehicle_assignments;

-- 4. Usuń zaproszenia flotowe
DELETE FROM fleet_invitations;