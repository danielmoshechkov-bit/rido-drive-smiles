-- Czat wsparcia: pierwsza linia AI.
--
-- Zasada: asystent odpowiada WYŁĄCZNIE z bazy wiedzy o portalu. Czego nie wie —
-- nie zgaduje, tylko przekazuje rozmowę do człowieka i wysyła SMS na numer
-- z ustawień powiadomień. Cena, terminy i zobowiązania to obszary, w których
-- zmyślona odpowiedź kosztuje więcej niż brak odpowiedzi.

-- 1) Wiadomości mogą pochodzić także od asystenta.
ALTER TABLE public.support_messages DROP CONSTRAINT IF EXISTS support_messages_sender_role_check;
ALTER TABLE public.support_messages
  ADD CONSTRAINT support_messages_sender_role_check
  CHECK (sender_role IN ('user', 'admin', 'ai'));

-- 2) Ślad eskalacji — od kiedy sprawa czeka na człowieka.
ALTER TABLE public.support_conversations
  ADD COLUMN IF NOT EXISTS escalated_at timestamptz,
  ADD COLUMN IF NOT EXISTS ai_replies_count integer NOT NULL DEFAULT 0;

-- 3) Ustawienia asystenta (dokładamy do istniejących ustawień wsparcia).
ALTER TABLE public.support_settings
  ADD COLUMN IF NOT EXISTS ai_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS ai_model text NOT NULL DEFAULT 'google/gemini-3-flash-preview',
  -- po tylu odpowiedziach AI bez rozwiązania sprawa idzie do człowieka
  ADD COLUMN IF NOT EXISTS ai_escalate_after integer NOT NULL DEFAULT 3
    CHECK (ai_escalate_after BETWEEN 1 AND 10);

-- 4) Baza wiedzy o portalu — to, z czego asystent może korzystać.
CREATE TABLE IF NOT EXISTS public.support_knowledge (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL DEFAULT 'ogolne',
  question text NOT NULL,
  answer text NOT NULL,
  -- dodatkowe sformułowania tego samego pytania (klienci pytają różnie)
  keywords text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_support_knowledge_active
  ON public.support_knowledge (category) WHERE is_active;

ALTER TABLE public.support_knowledge ENABLE ROW LEVEL SECURITY;

-- Czytać może każdy zalogowany (to treści pomocy), pisać tylko admin.
DROP POLICY IF EXISTS "support_knowledge_read" ON public.support_knowledge;
CREATE POLICY "support_knowledge_read" ON public.support_knowledge
  FOR SELECT TO authenticated USING (is_active OR public.is_support_admin());

DROP POLICY IF EXISTS "support_knowledge_admin" ON public.support_knowledge;
CREATE POLICY "support_knowledge_admin" ON public.support_knowledge
  FOR ALL TO authenticated
  USING (public.is_support_admin()) WITH CHECK (public.is_support_admin());

-- 5) Wiedza startowa — fakty z portalu (cennik zgodny z src/config/workshopPlans.ts).
INSERT INTO public.support_knowledge (category, question, answer, keywords)
SELECT * FROM (VALUES
  ('cennik', 'Ile kosztuje program dla warsztatu?',
   'Warsztat ma cztery pakiety: Darmowy 0 zl/mc (20 zlecen miesiecznie), Standard 89 zl netto/mc (zlecenia, wyceny i faktury bez limitu, KSeF, fiskalizacja, przechowalnia), Pro 169 zl netto/mc (dodatkowo magazyn, OCR faktur, integracje z hurtowniami, panel pracownikow) oraz Sieci - wycena indywidualna. Agent AI, ktory odbiera telefon, to osobny produkt: 139 zl netto/mc (120 minut) lub 289 zl netto/mc (300 minut).',
   'cena, cennik, ile kosztuje, abonament, pakiet, oplata'),
  ('cennik', 'Czy jest darmowy okres probny?',
   'Tak. Pakiety Standard i Pro mozna testowac 14 dni. Jest tez pakiet Darmowy 0 zl na stale, z limitem 20 zlecen miesiecznie.',
   'trial, testowac, za darmo, okres probny, 14 dni'),
  ('zlecenia', 'Jak dodac rabat kwotowy zamiast procentowego?',
   'W karcie zlecenia, w zakladce Wycena zlecenia, przy pozycji jest przelacznik przy polu Rabat. Wybierz zl zamiast % i wpisz kwote. Wybor zapisuje sie razem z pozycja, wiec po wyjsciu ze zlecenia zostaje kwota, a nie procent.',
   'rabat, znizka, upust, kwota, procent, zl'),
  ('pracownicy', 'Jak pracownik uzupelnia zlecenie?',
   'Pracownik otwiera zlecenie w panelu pracownika i przechodzi po kolei przez pozycje z przyjecia. Przy kazdej wpisuje co zrobil (robocizna) i jakich czesci uzyl, podaje czas, po czym zatwierdza punkt. Moze tez dodac wlasna pozycje - musi ja nazwac. Robocizna i czesci trafiaja automatycznie do wyceny zlecenia; ceny uzupelnia biuro.',
   'pracownik, mechanik, panel pracownika, robocizna, czesci, pozycje'),
  ('terminarz', 'Jak przypisac pracownika do zlecenia?',
   'W Terminarzu kliknij blok zlecenia i wybierz osobe z listy Pracownik. Przypisanie zapisuje sie od razu i liczy sie potem w raporcie pracownikow (zakladka Raporty).',
   'przypisac, pracownik, terminarz, mechanik, kalendarz'),
  ('faktury', 'Czy program obsluguje KSeF?',
   'Tak. Wystawianie i wysylka faktur w formacie FA(3), monitoring statusow oraz pobieranie UPO dzialaja od pakietu Standard.',
   'ksef, faktura, fa(3), upo, e-faktura'),
  ('sms', 'Ile kosztuja SMS-y do klientow?',
   'SMS-y rozliczane sa z pakietu SMS, ktory kupuje sie osobno od abonamentu. W panelu widac saldo i historie wysylek.',
   'sms, powiadomienia, wiadomosci, pakiet sms'),
  ('konto', 'Jak zalozyc konto warsztatu?',
   'Wejdz na getrido.pl, kliknij Zaloz konto i wybierz profil uslugodawcy. Po rejestracji uzupelnij dane firmy w Ustawieniach warsztatu - beda uzywane na fakturach i w wycenach dla klienta.',
   'konto, rejestracja, zalozyc, zaczac, start')
) AS v(category, question, answer, keywords)
WHERE NOT EXISTS (SELECT 1 FROM public.support_knowledge);

COMMENT ON TABLE public.support_knowledge IS
  'Wiedza, z ktorej korzysta pierwsza linia AI w czacie wsparcia. Czego tu nie ma, tego asystent nie odpowie - przekaze do czlowieka.';
