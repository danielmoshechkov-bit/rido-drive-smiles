-- Rollback: usuwa statusy TYLKO gdy żadne zlecenie ich nie używa.
-- Inaczej zostawiłoby zlecenia ze statusem wskazującym na nieistniejącą pozycję.

DELETE FROM workshop_order_statuses s
 WHERE s.name IN ('Wymaga uwagi', 'Oddzwonić')
   AND NOT EXISTS (
     SELECT 1 FROM workshop_orders o
      WHERE o.provider_id = s.provider_id AND o.status_name = s.name);
