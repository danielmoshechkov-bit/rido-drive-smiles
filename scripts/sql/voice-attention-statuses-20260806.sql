-- =============================================================================
-- Dwa statusy reakcji dla zleceń z rozmowy AI
--
-- POWÓD (decyzja właściciela): zamiast osobnej zakładki „kolejka weryfikacji",
-- zlecenie POWSTAJE i trafia do normalnej listy ze statusem wymagającym reakcji.
-- Warsztat patrzy w Zlecenia codziennie; osobnej zakładki mógłby nie otworzyć
-- przez tydzień i przez tydzień nie wiedzieć, że stracił klienta.
--
-- NIE JEST TO SPRZECZNE z odrzuceniem „twórz zlecenie od razu przy odebraniu":
-- tam zlecenie powstawało dla KAŻDEGO połączenia, także pomyłek i ciszy, i zjadało
-- numery z sekwencji. Tutaj powstaje tylko wtedy, gdy rozmowa była sensowna —
-- pomyłki odpadają wcześniej, przy sprzątaniu rozmów.
--
-- Kolory dobrane pod istniejącą paletę providera (#ef4444 … #1f2937).
-- Wstawiamy dla WSZYSTKICH providerów, którzy mają już jakiekolwiek statusy,
-- żeby nie tworzyć ich pustym kontom.
-- =============================================================================

-- KROK 1 — PODGLĄD: kto dostanie nowe statusy i czy już ich nie ma.
SELECT s.provider_id,
       count(*) FILTER (WHERE s.name = 'Wymaga uwagi') AS ma_wymaga_uwagi,
       count(*) FILTER (WHERE s.name = 'Oddzwonić')    AS ma_oddzwonic,
       count(*)                                        AS statusow_lacznie
  FROM workshop_order_statuses s
 GROUP BY s.provider_id;

-- KROK 2 — WSTAWIENIE. Idempotentne: NOT EXISTS zamiast ON CONFLICT,
-- bo tabela nie ma unikalnego indeksu na (provider_id, name).
INSERT INTO workshop_order_statuses (provider_id, name, color, sort_order)
SELECT DISTINCT s.provider_id, 'Wymaga uwagi', '#f97316', 2
  FROM workshop_order_statuses s
 WHERE NOT EXISTS (
   SELECT 1 FROM workshop_order_statuses x
    WHERE x.provider_id = s.provider_id AND x.name = 'Wymaga uwagi');

INSERT INTO workshop_order_statuses (provider_id, name, color, sort_order)
SELECT DISTINCT s.provider_id, 'Oddzwonić', '#a855f7', 3
  FROM workshop_order_statuses s
 WHERE NOT EXISTS (
   SELECT 1 FROM workshop_order_statuses x
    WHERE x.provider_id = s.provider_id AND x.name = 'Oddzwonić');

-- KONTROLA — każdy provider ma dokładnie po jednym z każdego.
-- SELECT provider_id,
--        count(*) FILTER (WHERE name='Wymaga uwagi') AS uwagi,
--        count(*) FILTER (WHERE name='Oddzwonić')    AS oddzwonic
--   FROM workshop_order_statuses GROUP BY provider_id
--  HAVING count(*) FILTER (WHERE name='Wymaga uwagi') <> 1
--      OR count(*) FILTER (WHERE name='Oddzwonić') <> 1;
