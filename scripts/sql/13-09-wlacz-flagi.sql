-- ═══════════════════════════════════════════════════════════════════════════
-- DWIE FLAGI AGENTA — WŁĄCZENIE PO WDROŻENIU (13.09.2026)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Obie były wdrożone świadomie martwe: kod trafił na produkcję wcześniej niż
-- decyzja, żeby zaczął działać. Włączamy dopiero teraz, gdy komplet — front
-- i sześć funkcji brzegowych — stoi na produkcji.
--
-- URUCHAMIAĆ PO `13-09-czysty-stan-minut.sql`, nie przed. Inaczej bramka minut
-- zobaczy jeszcze 17 minut zapisanych na CART78GARAGE z testów.
--
--
-- `voice_minuty_blokuja` — BRAMKA MINUT.
--   Czyta ją `voice_odmowic_brak_minut`, wołana w `voice-agent-init` przed
--   zajęciem linii. Odmawia WYŁĄCZNIE warsztatowi, który ma opłacony pakiet
--   i zszedł poniżej jednej minuty. Warsztat BEZ pakietu przepuszcza — i to
--   jest celowe: dzięki temu numer demonstracyjny CART78GARAGE odbiera dalej.
--   „Nie ma pakietu = nie ma agenta" egzekwuje druga flaga, na wejściu.
--
-- `agent_bramka_aktywacji` — BRAMKA PRZYDZIAŁU NUMERU.
--   Czytają ją `voice-number-activate` (odmowa 402 z czytelnym zdaniem)
--   ORAZ `voice-numbers-worker` (pas i szelki: zadanie mogło powstać, zanim
--   flagę włączono, a kupno numeru u operatora jest nieodwracalne).
--   Od tej chwili numeru nie dostanie nikt bez opłaconego pakietu.
--
--   TO JEST TA FLAGA, KTÓRA ZAMYKA DZIURĘ: do dziś każdy z 31 warsztatów mógł
--   kliknąć „Aktywuj agenta" i uruchomić zakup numeru za nasze pieniądze,
--   bo w puli nie ma ani jednego wolnego.
--
-- Numery już przydzielone (CART78GARAGE i CART) zostają — bramka pilnuje
-- nowych przydziałów, nie odbiera istniejących.
--
-- Uruchomienie:  supabase db query --linked -f scripts/sql/13-09-wlacz-flagi.sql

update billing_settings
   set voice_minuty_blokuja   = true,
       agent_bramka_aktywacji = true
 where id = true;

-- KONTROLA. Oczekiwane: obie `true`.
select voice_minuty_blokuja, agent_bramka_aktywacji
  from billing_settings
 where id = true;
