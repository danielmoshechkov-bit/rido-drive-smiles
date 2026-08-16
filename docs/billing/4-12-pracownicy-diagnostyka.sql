-- 4.12 — ilu użytkowników realnie dotyczy trzeci poziom (własne kredyty pracownika)
--
-- Pytanie: kto ma NIEZEROWE własne saldo VIN i jednocześnie jest pracownikiem
-- CUDZEGO warsztatu. Właściciel-użytkownik nie liczy się do tej grupy — on
-- i tak zobaczy jedną sumę, bo pula firmy jest jego.
--
-- Jeśli wynik jest pusty, nie budujemy trzeciego poziomu w billing_consume:
-- zostaje pula warsztatu → paczki warsztatu, a własne kredyty pracownika
-- nie mają czego dotyczyć.

-- ---------------------------------------------------------------------------
-- A. Lista imienna — kogo dotyczy
-- ---------------------------------------------------------------------------
SELECT
  vlc.user_id,
  vlc.remaining_credits                       AS wlasne_saldo,
  sp.id                                       AS warsztat_id,
  sp.company_name                             AS warsztat,
  we.role                                     AS rola,
  we.status                                   AS status_zatrudnienia,
  -- Czy ten sam człowiek jest gdziekolwiek właścicielem warsztatu.
  EXISTS (SELECT 1 FROM service_providers o WHERE o.user_id = vlc.user_id)
                                              AS jest_tez_wlascicielem
FROM vehicle_lookup_credits vlc
JOIN workshop_employees we
  ON we.user_id = vlc.user_id
 AND we.removed_at IS NULL
 AND COALESCE(we.is_active, true)
JOIN service_providers sp
  ON sp.id = we.provider_id
WHERE COALESCE(vlc.remaining_credits, 0) > 0
  -- „cudzy warsztat": pracownik nie jest jego właścicielem
  AND sp.user_id IS DISTINCT FROM vlc.user_id
ORDER BY vlc.remaining_credits DESC;

-- ---------------------------------------------------------------------------
-- B. Jedna liczba — to rozstrzyga, czy budujemy trzeci poziom
-- ---------------------------------------------------------------------------
SELECT
  count(DISTINCT vlc.user_id)                 AS pracownikow_z_wlasnym_saldem,
  COALESCE(sum(DISTINCT vlc.remaining_credits), 0) AS lacznie_kredytow
FROM vehicle_lookup_credits vlc
JOIN workshop_employees we
  ON we.user_id = vlc.user_id
 AND we.removed_at IS NULL
 AND COALESCE(we.is_active, true)
JOIN service_providers sp
  ON sp.id = we.provider_id
WHERE COALESCE(vlc.remaining_credits, 0) > 0
  AND sp.user_id IS DISTINCT FROM vlc.user_id;

-- ---------------------------------------------------------------------------
-- C. Kontrola tła — żeby zero z punktu B dało się odróżnić od zera z błędu
-- ---------------------------------------------------------------------------
-- Jeśli `pracownikow_z_wlasnym_saldem` wyjdzie 0, chcę wiedzieć, czy to
-- dlatego, że takich ludzi nie ma, czy dlatego, że np. nikt z pracowników
-- nie ma w ogóle wypełnionego `user_id` i złączenie nie ma się o co zaczepić.
SELECT
  (SELECT count(*) FROM workshop_employees
    WHERE removed_at IS NULL AND COALESCE(is_active, true))          AS pracownikow_aktywnych,
  (SELECT count(*) FROM workshop_employees
    WHERE removed_at IS NULL AND COALESCE(is_active, true)
      AND user_id IS NOT NULL)                                       AS z_kontem_uzytkownika,
  (SELECT count(*) FROM vehicle_lookup_credits
    WHERE COALESCE(remaining_credits, 0) > 0)                        AS wszystkich_z_niezerowym_saldem;
