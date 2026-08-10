-- ============================================================================
-- voice-knowledge-reset-20260811.sql   — DO DECYZJI, NIE WYKONANE
--
-- Wyzerowanie całej aktywnej dziesiątki i budowanie bazy wiedzy od nowa,
-- już przez bramkę uczenia (voiceLearningGate).
--
-- STAN FAKTYCZNY, na którym opiera się ta propozycja:
--   - 5 z 10 aktywnych reguł było WADLIWYCH: konkretne godziny recytowane jako
--     dostępność, nieaktualna data przykładowa, dane osobowe prawdziwych klientów
--   - 3 z pozostałych 5 SPRZECZAJĄ SIĘ z promptem (wykryte przez voice-audit A2):
--       4ce81e63  prompt: „każdą cyfrę czytasz OSOBNO"   regula: „czytaj grupami"
--       caa27860  prompt: zakaz relacjonowania działań    regula: „Rozumiem, zapisuję Pana teraz"
--       e7daef7a  prompt: forma bezosobowa przed imieniem regula: „dla Pana najwygodniejszy"
--                 (ta ostatnia dała w bj6t2qmm „Jestem panią, nie jestem panem")
--   - wszystkie 10 powstało 14.06–04.08, czyli PRZED zebranymi rozmowami —
--     pochodzenia nie da się zweryfikować
--   - żadna nie przeszła przez świadomą akceptację: automatyczne włączanie
--     wyłączono dopiero 04.08
--
-- CO TRACIMY — sprawdzone regułą po regule:
--   NIC, czego nie ma już w prompcie budowanym w kodzie, w wersji nowszej
--   i mocniejszej. Odpowiedniki potwierdzone dla wszystkich sensownych reguł:
--     „data raz"                → „ALE DOKŁADNIE RAZ NA TURĘ"
--     „podsumowanie 1 zdaniem"  → „podsumuj JEDNYM zdaniem"
--     „godziny z narzędzia"     → „Podawaj wyłącznie godziny, które narzędzie zwróciło"
--     „nie zmyślaj dostępności" → „NIGDY nie zmyślaj godziny"
--     „nie pytaj o zbędne"      → „NIE prowadzisz diagnostyki"
--   Zysk uboczny: prompt krótszy o ~2 146 znaków (~613 tokenów, 11% całości).
--
-- CO ZYSKUJEMY: trzy sprzeczności znikają, a baza zaczyna się od zera i rośnie
-- WYŁĄCZNIE przez bramkę — z rozmów udanych, po redakcji danych osobowych
-- i konkretów, z is_active = false do świadomej akceptacji.
--
-- DEZAKTYWACJA, NIE KASOWANIE: treść zostaje do wglądu, a gdyby któraś reguła
-- okazała się potrzebna, wraca jednym UPDATE zamiast być odtwarzana z pamięci.
--
-- Rollback: voice-knowledge-reset-20260811-rollback.sql
-- ============================================================================

BEGIN;

UPDATE voice_agent_knowledge
   SET is_active = false,
       updated_at = now()
 WHERE persona_key = 'workshop_secretary'
   AND is_active = true;

COMMIT;

-- KONTROLA PO WYKONANIU
--   node scripts/voice-audit.mjs A B
--   A2 zgłosi wtedy „zero aktywnych reguł — kontrola nic nie obejrzała".
--   To jest ZAMIERZONE i poprawne: baza jest pusta z decyzji, nie z awarii.
--   Po pierwszej regule wpuszczonej przez bramkę kontrola wróci do normy.
