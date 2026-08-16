-- ============================================================================
-- telephony_events — zdarzenia połączeń prosto od operatora (SuperVoIP).
--
-- Powód: dziś widzimy WYŁĄCZNIE rozmowy, które doszły do ElevenLabs. Połączenie
-- odrzucone, nieodebrane, zajęte albo takie, przy którym padła integracja,
-- nie zostawia po sobie żadnego śladu — a to są dokładnie te połączenia,
-- o których warsztat dowiaduje się od klienta, nie od nas.
--
-- Webhook operatora przychodzi przy KAŻDYM połączeniu i niesie `callid`,
-- czyli SIP Call-ID. Ten sam Call-ID widać w ElevenLabs w `sip-messages`,
-- więc obie strony da się skleić bez zgadywania.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.telephony_events (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider       text        NOT NULL DEFAULT 'supervoip',
  event_status   text,                      -- callstart | callend | queuestart | callanswer | callringing
  direction      text,                      -- in | out
  caller_number  text,                      -- numberA — numer źródłowy
  called_number  text,                      -- numberB — numer docelowy
  sip_number     text,
  disposition    text,                      -- answer | busy | chanunavail
  bill_seconds   integer,
  call_id        text,                      -- SIP Call-ID — klucz sklejenia z ElevenLabs
  unique_id      text,
  ivr_action     text,
  occurred_at    timestamptz,               -- z `createdat` (unix timestamp)
  raw            jsonb       NOT NULL,      -- pełny ładunek, cokolwiek przyszło
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- Webhook potrafi przyjść dwa razy (ponowienie po timeoucie). Klucz naturalny
-- to zdarzenie danego typu w danym połączeniu. COALESCE, bo operator nie
-- gwarantuje kompletu pól przy każdym statusie.
CREATE UNIQUE INDEX IF NOT EXISTS telephony_events_dedup
  ON public.telephony_events (
    provider,
    COALESCE(unique_id, call_id, id::text),
    COALESCE(event_status, ''),
    COALESCE(sip_number, '')
  );

CREATE INDEX IF NOT EXISTS telephony_events_call_id  ON public.telephony_events (call_id);
CREATE INDEX IF NOT EXISTS telephony_events_called   ON public.telephony_events (called_number, occurred_at DESC);
CREATE INDEX IF NOT EXISTS telephony_events_occurred ON public.telephony_events (occurred_at DESC);

ALTER TABLE public.telephony_events ENABLE ROW LEVEL SECURITY;

-- Zapisuje wyłącznie funkcja brzegowa kluczem service_role (RLS jej nie dotyczy).
-- Dla użytkowników zostaje sam odczyt i tylko dla admina — w tabeli są numery
-- telefonów dzwoniących, czyli dane osobowe.
DROP POLICY IF EXISTS "telephony_events admin read" ON public.telephony_events;
CREATE POLICY "telephony_events admin read"
  ON public.telephony_events FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

COMMENT ON TABLE public.telephony_events IS
  'Zdarzenia połączeń z webhooka operatora. Niezależne od ElevenLabs — pokazuje także połączenia, które nie doszły do agenta.';
