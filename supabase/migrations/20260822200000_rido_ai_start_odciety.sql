-- 🔴 `przyznaj_start_rido_ai` była wywoływalna przez klienta — także BEZ zalogowania.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- CO SIĘ STAŁO
-- ═══════════════════════════════════════════════════════════════════════════
-- Migracja `20260822180000_rido_ai_bez_limitu_miesiecznego` zakłada funkcję
-- `SECURITY DEFINER`, która nadaje pakiet startowy Rido AI, i zamyka ją tak:
--
--     REVOKE ALL ON FUNCTION public.przyznaj_start_rido_ai(uuid, text) FROM PUBLIC, anon, authenticated;
--     GRANT EXECUTE ON FUNCTION public.przyznaj_start_rido_ai(uuid, text) TO service_role;
--
-- To ten sam wzorzec, którym zamknęliśmy siedemnaście innych funkcji — i który
-- okazał się nie zamykać niczego. `PUBLIC` w PostgreSQL to osobne uprawnienie
-- domyślne; Supabase nadaje `EXECUTE` rolom `anon` i `authenticated` JAWNIE,
-- a odebranie `PUBLIC` tych nadań nie rusza.
--
-- Sprawdzone na produkcji, nie w pliku: `anon = true`, `authenticated = true`.
-- Każdy — również niezalogowany — mógł nadać dowolnemu warsztatowi pakiet
-- startowy Rido AI, w kółko.
--
-- Nie jest to zarzut wobec autora migracji: wzorzec był w repozytorium wszędzie
-- i wyglądał poprawnie. Dlatego reguła trafiła do `CLAUDE.md`, a kontrola do CI —
-- i to właśnie ta kontrola tę funkcję wskazała, przy pierwszym scaleniu po jej
-- powstaniu.

BEGIN;

REVOKE ALL ON FUNCTION public.przyznaj_start_rido_ai(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.przyznaj_start_rido_ai(uuid, text) TO service_role;

DO $$
BEGIN
  IF has_function_privilege('anon', 'public.przyznaj_start_rido_ai(uuid,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.przyznaj_start_rido_ai(uuid,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'przyznaj_start_rido_ai nadal wywoływalna przez klienta';
  END IF;

  -- Kontrola pozytywna: `service_role` MUSI zachować dostęp, inaczej odcinamy
  -- funkcję brzegową razem z napastnikiem.
  IF NOT has_function_privilege('service_role', 'public.przyznaj_start_rido_ai(uuid,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'service_role stracił dostęp — pakiet startowy Rido AI przestałby działać';
  END IF;

  RAISE NOTICE 'przyznaj_start_rido_ai: odcięta od klienta, service_role zachowany.';
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';
