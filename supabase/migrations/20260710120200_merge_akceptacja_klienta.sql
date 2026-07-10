-- M3: scalenie statusu "Akceptacja klienta" -> "Zaakceptowano"
-- (jedno zdarzenie biznesowe = jedna wartość w DB; "Akceptacja klienta" zostaje
--  w kodzie wyłącznie jako alias do odczytu dla danych historycznych)

-- 1) Katalog per provider: przenieś sends_sms na 'Zaakceptowano' tam, gdzie już istnieje
UPDATE workshop_order_statuses zs
SET sends_sms = true
FROM workshop_order_statuses ak
WHERE ak.provider_id = zs.provider_id
  AND ak.name = 'Akceptacja klienta' AND ak.sends_sms = true
  AND zs.name = 'Zaakceptowano';

-- 2) Dołóż 'Zaakceptowano' providerom, którzy mieli tylko 'Akceptacja klienta'
--    (DISTINCT ON: gdyby provider miał zduplikowany wiersz 'Akceptacja klienta',
--    wstawiamy 'Zaakceptowano' tylko raz)
INSERT INTO workshop_order_statuses (provider_id, name, color, sort_order, is_default, sends_sms)
SELECT DISTINCT ON (ak.provider_id)
  ak.provider_id, 'Zaakceptowano', '#22c55e', ak.sort_order, false, ak.sends_sms
FROM workshop_order_statuses ak
WHERE ak.name = 'Akceptacja klienta'
  AND NOT EXISTS (
    SELECT 1 FROM workshop_order_statuses z
    WHERE z.provider_id = ak.provider_id AND z.name = 'Zaakceptowano'
  )
ORDER BY ak.provider_id, ak.sends_sms DESC;

-- 3) Usuń 'Akceptacja klienta' z katalogu (znika z dropdownu pickera)
DELETE FROM workshop_order_statuses WHERE name = 'Akceptacja klienta';

-- 4) Historyczne zlecenia (audyt 2026-07: 2 wiersze)
UPDATE workshop_orders SET status_name = 'Zaakceptowano'
WHERE status_name = 'Akceptacja klienta';

-- 5) Seed dla nowych warsztatów: 'Zaakceptowano' zamiast 'Akceptacja klienta'
--    + hexy zgodne z paletą "Zalecane" (istotne tylko w trybie kolorów Ręczne)
CREATE OR REPLACE FUNCTION public.init_workshop_default_statuses(p_provider_id UUID)
  RETURNS VOID
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO workshop_order_statuses (provider_id, name, color, sort_order, is_default, sends_sms) VALUES
    (p_provider_id, 'Przyjęcie do serwisu', '#3b82f6', 0, true, false),
    (p_provider_id, 'Nowe zlecenie', '#9ca3af', 1, false, false),
    (p_provider_id, 'Zaakceptowano', '#22c55e', 2, false, true),
    (p_provider_id, 'W trakcie naprawy', '#3b82f6', 3, false, false),
    (p_provider_id, 'Zadania wykonane', '#22c55e', 4, false, false),
    (p_provider_id, 'Gotowy do odbioru', '#7c3aed', 5, false, true),
    (p_provider_id, 'Zakończone', '#1f2937', 6, false, false)
  ON CONFLICT DO NOTHING;
END;
$$;

-- 6) Historia zdarzeń: rozróżnij źródło zmiany statusu.
--    Zmiana statusu bez auth.uid() może przyjść wyłącznie z publicznego portalu
--    klienta (anon ma prawo UPDATE flag akceptacji) -> actor_role 'client'.
--    Dotychczas anon był mylnie logowany jako 'admin'.
CREATE OR REPLACE FUNCTION public.log_workshop_order_status_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_name text;
BEGIN
  IF NEW.status_name IS DISTINCT FROM OLD.status_name THEN
    SELECT COALESCE(first_name || ' ' || last_name, email) INTO v_name FROM workshop_employees WHERE user_id = v_actor AND provider_id = NEW.provider_id LIMIT 1;
    INSERT INTO workshop_order_events (order_id, provider_id, event_type, from_status, to_status, actor_user_id, actor_name, actor_role)
    VALUES (
      NEW.id, NEW.provider_id, 'status_change', OLD.status_name, NEW.status_name, v_actor, v_name,
      CASE
        WHEN v_actor IS NULL THEN 'client'
        WHEN v_name IS NOT NULL THEN 'employee'
        ELSE 'admin'
      END
    );
  END IF;
  RETURN NEW;
END;
$$;
