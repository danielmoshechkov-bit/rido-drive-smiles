-- ROLLBACK voice-knowledge-reset-20260811.sql
-- Przywraca aktywnosc dokladnie tym dziesieciu regulom, ktore byly wlaczone 11.08.
BEGIN;
UPDATE voice_agent_knowledge SET is_active = true WHERE id IN (
  '446d5266-8fd4-45f8-8e17-680c8acd76aa',  -- scheduling: Umówienie terminu w przyszłym tygodniu
  '99be4f56-332f-469e-8a2f-ecf93d45bc8d',  -- closing: Podsumowanie rezerwacji
  '7bdc7302-d47a-48c6-bcdb-f796dc7c3f93',  -- scheduling: Klient mówi 'jutro' bez konkretnej godziny
  '84cedb76-7b46-48f3-b727-c63bdd2b853e',  -- qualifying: Gdy klient od razu wyraża chęć rezerwacji ("ch
  '4ce81e63-b532-4490-903a-0601525cbdf3',  -- style: Potwierdzanie danych (numer telefonu, rejestra
  '3be05aa2-b5a2-4d05-8ab9-f1772b14e85d',  -- qualifying: Gdy klient podał już wszystkie kluczowe dane (
  'fc943f39-7512-454f-a8d9-840eff09ed0d',  -- closing: Gdy masz wszystkie dane do rezerwacji
  'caa27860-50dd-48f4-9026-3486d901f2e7',  -- style: Gdy klient wykazuje znaki niecierpliwości (mów
  'e7daef7a-34b6-498a-a3d8-43acdfc61886',  -- closing: Po ustaleniu problemu
  'c009f30f-5288-4fd3-a4d0-2a3d0d256391'  -- style: Gdy agent musi poprosić o powtórzenie informac
);
COMMIT;
