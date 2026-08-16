-- Miesiące wysyłek SMS z licznikami — do podziału listy i do statystyk.
--
-- Ekran „Centrum SMS" wczytywał 200 ostatnich wiadomości do jednej listy
-- i z nich liczył statystyki. Przy 200 SMS-ach lista jest nie do przejrzenia,
-- a statystyki kłamią: pokazują „wysłane łącznie" z ostatnich dwustu, nie ze
-- wszystkich. Dane trzeba ciąć po miesiącach — i po stronie bazy, bo tylko
-- ona zna PEŁNY zbiór.
--
-- SECURITY DEFINER z jawnym sprawdzeniem dostępu: warsztat widzi tylko swoje
-- miesiące. Bez tego funkcja omijałaby RLS tabeli dziennika.

CREATE OR REPLACE FUNCTION public.workshop_sms_miesiace(p_provider uuid)
RETURNS TABLE (
  miesiac      text,      -- 'YYYY-MM'
  wyslane      int,
  nieudane     int,
  czesci       int,       -- ile części SMS (koszt)
  pierwszy     timestamptz,
  ostatni      timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (
    EXISTS (SELECT 1 FROM service_providers WHERE id = p_provider AND user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM workshop_employees WHERE provider_id = p_provider AND user_id = auth.uid() AND status = 'active')
    OR public.has_role(auth.uid(), 'admin'::app_role)
  ) THEN
    RAISE EXCEPTION 'Brak dostępu do tego warsztatu';
  END IF;

  RETURN QUERY
  SELECT to_char(COALESCE(s.sent_at, s.created_at), 'YYYY-MM') AS miesiac,
         count(*) FILTER (WHERE s.status = 'sent')::int,
         count(*) FILTER (WHERE s.status = 'failed')::int,
         COALESCE(sum(COALESCE(s.parts_count, 1)) FILTER (WHERE s.status = 'sent'), 0)::int,
         min(COALESCE(s.sent_at, s.created_at)),
         max(COALESCE(s.sent_at, s.created_at))
  FROM public.workshop_sms_log s
  WHERE s.provider_id = p_provider
    AND s.status IN ('sent', 'failed')
  GROUP BY 1
  ORDER BY 1 DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.workshop_sms_miesiace(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.workshop_sms_miesiace(uuid) TO authenticated, service_role;
