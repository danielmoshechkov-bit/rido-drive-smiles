-- Identyfikator wiadomości od serwera poczty.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- 🔴 „WYSŁANO" NIE ZNACZY „DOSZŁO"
-- ═══════════════════════════════════════════════════════════════════════════
-- 10.09.2026 trzy faktury platformy (GR/2026/009, /010, /011) miały wypełnione
-- `email_sent_at`, pusty `email_error` i numer KSeF — a klient nie dostał
-- żadnej z nich.
--
-- `email_sent_at` mówi tylko tyle, że SMTP PRZYJĄŁ wiadomość. Co się z nią
-- stało dalej — dostarczona, odbita, wrzucona do spamu — widać wyłącznie
-- u dostawcy poczty, i tylko wtedy, gdy poda mu się IDENTYFIKATOR NADANY
-- PRZEZ SERWER. Bez niego reklamacja „nie dostałem faktury" kończy się
-- rozłożeniem rąk.
--
-- Uwierzytelnienie domeny jest przy tym poprawne — sprawdzone: SPF
-- `v=spf1 include:_spf.lh.pl -all`, DKIM z selektorem `default`, DMARC
-- `p=quarantine`, a serwer nadawczy (`mail21.lh.pl`) mieści się w SPF.
-- Czyli przyczyny trzeba szukać w dzienniku dostarczenia, nie w konfiguracji.
--
-- `nodemailer` oddaje `messageId` z odpowiedzi serwera i `send-invoice-email`
-- już go zwraca — dotąd trafiał wyłącznie do `console.log`, czyli donikąd.

BEGIN;

ALTER TABLE public.user_invoices
  ADD COLUMN IF NOT EXISTS email_message_id text;

COMMENT ON COLUMN public.user_invoices.email_message_id IS
  'Identyfikator wiadomości nadany przez serwer SMTP przy przyjęciu. Z nim da się poprosić dostawcę poczty o los konkretnej wiadomości; bez niego nie da się o nic zapytać.';

DO $KONIEC$
DECLARE v_ile int;
BEGIN
  SELECT count(*) INTO v_ile FROM information_schema.columns
  WHERE table_schema='public' AND table_name='user_invoices' AND column_name='email_message_id';
  IF v_ile <> 1 THEN
    RAISE EXCEPTION 'Kolumny email_message_id nie ma';
  END IF;

  -- Faktury wyslane PRZED ta migracja nie beda mialy identyfikatora i nic na
  -- to nie poradzimy — mowimy o tym wprost, zeby nikt nie szukal.
  SELECT count(*) INTO v_ile FROM user_invoices
  WHERE email_sent_at IS NOT NULL AND email_message_id IS NULL;
  IF v_ile > 0 THEN
    RAISE WARNING '% faktur wyslano przed wprowadzeniem identyfikatora — ich losu nie da sie juz odtworzyc u dostawcy poczty.', v_ile;
  END IF;

  RAISE NOTICE 'Identyfikator wiadomosci zalozony.';
END $KONIEC$;

COMMIT;

NOTIFY pgrst, 'reload schema';
