
-- Ujednolicenie statusów w vehicle_listings - zmiana z polskich na angielskie
UPDATE vehicle_listings SET status = 'active' WHERE status = 'aktywne';
UPDATE vehicle_listings SET status = 'inactive' WHERE status = 'nieaktywne';
UPDATE vehicle_listings SET status = 'sold' WHERE status = 'sprzedane';
UPDATE vehicle_listings SET status = 'reserved' WHERE status = 'zarezerwowane';
UPDATE vehicle_listings SET status = 'pending' WHERE status = 'oczekujące';
UPDATE vehicle_listings SET status = 'draft' WHERE status = 'szkic';
