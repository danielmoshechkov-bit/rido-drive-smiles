-- =====================================================================
-- KSeF — OSOBNY TOKEN DLA KAŻDEGO ŚRODOWISKA
--
-- PO CO: token KSeF działa TYLKO na tym środowisku, na którym powstał. Do tej pory
-- było jedno pole na token, więc przełączenie „testowe ↔ produkcja" wymagało wklejania
-- tokenu za każdym razem, a poprzedni bezpowrotnie przepadał. W praktyce oznaczało to,
-- że nie dało się nic sprawdzić na testowym bez rozmontowania konfiguracji produkcyjnej.
--
-- Teraz każdy token ma swoje miejsce, a przełącznik tylko wybiera, którego użyć.
-- Status połączenia też jest osobny — inaczej po przełączeniu widniałoby „Połączony",
-- choć dotyczyłoby to drugiego środowiska.
--
-- Stara kolumna `ksef_token` ZOSTAJE: backend czyta ją awaryjnie, gdy nowe pole jest puste,
-- więc nikomu nie znika działająca konfiguracja w trakcie wdrożenia.
-- =====================================================================

ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS ksef_token_test        text,
  ADD COLUMN IF NOT EXISTS ksef_token_production  text,
  ADD COLUMN IF NOT EXISTS ksef_status_test       text,
  ADD COLUMN IF NOT EXISTS ksef_status_production text;

COMMENT ON COLUMN public.company_settings.ksef_token_test IS
  'Token KSeF dla środowiska testowego (api-test.ksef.mf.gov.pl). Nie działa na produkcji.';
COMMENT ON COLUMN public.company_settings.ksef_token_production IS
  'Token KSeF dla produkcji (api.ksef.mf.gov.pl). Faktury wysłane tym tokenem trafiają do urzędu.';
COMMENT ON COLUMN public.company_settings.ksef_token IS
  'PRZESTARZAŁE — jedno wspólne pole na token. Zostawione jako zapas na czas przejścia; nowe zapisy idą do ksef_token_test / ksef_token_production.';

-- Przeniesienie tego, co już jest, do właściwej szufladki — wg zapisanego środowiska.
-- 'integration' i 'test' to u nas to samo środowisko testowe.
UPDATE public.company_settings
   SET ksef_token_production = ksef_token,
       ksef_status_production = ksef_status
 WHERE coalesce(ksef_token, '') <> ''
   AND ksef_environment = 'production'
   AND coalesce(ksef_token_production, '') = '';

UPDATE public.company_settings
   SET ksef_token_test = ksef_token,
       ksef_status_test = ksef_status
 WHERE coalesce(ksef_token, '') <> ''
   AND ksef_environment IN ('test', 'integration', 'demo')
   AND coalesce(ksef_token_test, '') = '';
