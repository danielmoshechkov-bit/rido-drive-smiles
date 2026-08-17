-- ============================================================================
-- JEDNO ZADANIE UZUPEŁNIENIA PULI W CAŁYM SYSTEMIE.
--
-- Co się stało 17.08: zadanie aktywacji nie znalazło wolnego numeru, zleciło
-- uzupełnienie puli i odroczyło się o 90 s. Przy każdym odroczeniu zlecało
-- KOLEJNE uzupełnienie — bo indeks częściowy pilnował tylko `typ='aktywacja'`.
-- Po dwudziestu minutach w kolejce stały 22 identyczne zadania, każde
-- zaparkowane na `czeka_na_zgode`, i 22 alerty o tym samym.
--
-- Pula jest JEDNA dla całego systemu, nie per warsztat — więc unikalność też
-- ma być globalna. `provider_id` w takim zadaniu służy tylko do wybrania strefy.
--
-- Dlaczego indeksem, a nie sprawdzeniem w kodzie: kod, który sprawdza przed
-- wstawieniem, przy dwóch przebiegach obok siebie wstawi dwa razy. Baza nie.
-- ============================================================================
CREATE UNIQUE INDEX IF NOT EXISTS voice_number_jobs_jedno_uzupelnienie
  ON public.voice_number_jobs ((typ))
  WHERE typ = 'uzupelnienie_puli' AND status IN ('oczekuje', 'w_toku', 'czeka_na_zgode');
