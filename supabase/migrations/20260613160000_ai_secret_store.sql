-- ============================================================================
-- AI SECRET STORE — admin-only magazyn kluczy API wpisywanych z panelu
-- ----------------------------------------------------------------------------
-- Metoda A2 (wybrana zamiast Management API): admin wpisuje klucze w panelu
-- admina (Centrum AI), wartość trafia TYLKO tutaj, czytana wyłącznie przez
-- edge (service_role). Front NIGDY nie czyta tej tabeli.
--
-- BEZPIECZEŃSTWO (zamknięcie dziury z AIHubPanel, gdzie klucz leciał do
-- przeglądarki przez select('*')):
--   * RLS ON + BRAK jakiejkolwiek polityki dla authenticated/anon
--     => deny-by-default, brak ścieżki odczytu z PostgREST.
--   * REVOKE wszystkich uprawnień od anon/authenticated/PUBLIC.
--   * Dostęp ma WYŁĄCZNIE service_role (edge admin-ai-secrets), po wcześniejszej
--     weryfikacji has_role('admin') po stronie edge na podstawie JWT.
--   * Wartość trzymana zaszyfrowana at-rest (AES-GCM) gdy ustawiony sekret
--     AI_SECRETS_ENC_KEY; bez niego działa (is_encrypted=false), a panel to
--     sygnalizuje. Klucz szyfrujący nigdy nie dotyka frontu.
--
-- Generyczny — "jeden panel na wszystkie klucze AI" (secret_group grupuje:
-- voice, llm, ...). Nowy klucz = pozycja na allowliście w edge, zero zmian DDL.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.ai_secret_store (
  secret_key   text PRIMARY KEY,          -- np. 'ELEVENLABS_API_KEY'
  ciphertext   text NOT NULL,             -- AES-GCM(base64) lub plaintext gdy brak klucza szyfrującego
  is_encrypted boolean NOT NULL DEFAULT false,
  secret_group text,                       -- 'voice' | 'llm' | ...
  updated_at   timestamptz NOT NULL DEFAULT now(),
  updated_by   uuid
);

ALTER TABLE public.ai_secret_store ENABLE ROW LEVEL SECURITY;

-- Brak polityk dla authenticated/anon = deny-by-default (service_role omija RLS).
-- Dodatkowo twardo odbieramy uprawnienia obiektowe, żeby PostgREST nie widział tabeli.
REVOKE ALL ON public.ai_secret_store FROM PUBLIC;
REVOKE ALL ON public.ai_secret_store FROM anon;
REVOKE ALL ON public.ai_secret_store FROM authenticated;
GRANT ALL ON public.ai_secret_store TO service_role;

COMMENT ON TABLE public.ai_secret_store IS
  'Admin-only magazyn kluczy API wpisywanych z panelu. Czytany wyłącznie przez edge (service_role) po weryfikacji admina. Brak dostępu z frontu (RLS deny-all + REVOKE). Wartość szyfrowana at-rest gdy ustawiony AI_SECRETS_ENC_KEY.';
