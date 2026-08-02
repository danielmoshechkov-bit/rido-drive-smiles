-- =====================================================================
-- PRZECHOWALNIA OPON — KANAŁ PRZYPOMNIENIA O ODBIORZE
--
-- Do tej pory formularz oferował „przypomnienie SMS za N miesięcy", ale kanał był
-- narzucony, a samego przypomnienia i tak nikt nie wysyłał. O sposobie kontaktu
-- decyduje klient: jeden chce SMS, drugi mail, trzeci nie chce nic.
--
-- 'none' jest wartością pełnoprawną, nie awarią: brak zgody na kontakt też trzeba
-- gdzieś zapisać, żeby nikt nie wysłał wiadomości „na wszelki wypadek".
-- =====================================================================

ALTER TABLE public.workshop_tire_storage
  ADD COLUMN IF NOT EXISTS reminder_channel text NOT NULL DEFAULT 'sms'
    CHECK (reminder_channel IN ('sms', 'email', 'none')),
  -- Ślad wysyłki — chroni przed powtórnym przypomnieniem przy każdym uruchomieniu zadania.
  ADD COLUMN IF NOT EXISTS reminder_sent_at timestamptz;

COMMENT ON COLUMN public.workshop_tire_storage.reminder_channel IS
  'Jak przypomnieć o odbiorze opon: sms, email albo none (klient nie chce przypomnień).';
COMMENT ON COLUMN public.workshop_tire_storage.reminder_sent_at IS
  'Kiedy wysłano przypomnienie — puste oznacza „jeszcze nie wysłano".';
