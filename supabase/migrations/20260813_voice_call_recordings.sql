-- Nagrania rozmów telefonicznych — miejsce na plik i ślad po próbie pobrania.
--
-- Do tej pory po rozmowie zostawał wyłącznie transkrypt. Nagranie istnieje po
-- stronie dostawcy telefonii (ElevenLabs), ale tylko tam i tylko przez okres
-- ich retencji — czyli dokładnie to, czego warsztat nie kontroluje. Zlecenie
-- żyje latami, a spór „co klient powiedział przez telefon" bywa rok później.
--
-- Dlatego nagranie ściągamy RAZ, przy pierwszym odsłuchaniu, i zostaje u nas
-- w prywatnym koszyku. Kolejne odsłuchania to już podpisany link do naszego
-- pliku — bez ruchu do dostawcy i bez zależności od jego retencji.
--
-- `recording_status` zapamiętuje też wynik NEGATYWNY („dostawca nie ma audio"),
-- żeby panel nie próbował ściągać w kółko przy każdym otwarciu zakładki.

ALTER TABLE public.voice_calls
  ADD COLUMN IF NOT EXISTS recording_path       text,        -- ścieżka w koszyku voice-recordings
  ADD COLUMN IF NOT EXISTS recording_status     text,        -- available | unavailable | error
  ADD COLUMN IF NOT EXISTS recording_checked_at timestamptz;

-- Prywatny koszyk. Dostęp wyłącznie przez podpisane linki wystawiane przez
-- edge po sprawdzeniu, że pytający ma prawo do tego zlecenia — brak polityk
-- publicznych jest tu celowy.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('voice-recordings', 'voice-recordings', false, 52428800,
        ARRAY['audio/mpeg','audio/mp3','audio/mp4','audio/wav','application/octet-stream'])
ON CONFLICT (id) DO NOTHING;
