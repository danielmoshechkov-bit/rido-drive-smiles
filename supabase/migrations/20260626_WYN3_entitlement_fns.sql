-- =====================================================================
-- WYN3 — Funkcje uprawnień: company_module_enabled() + can_use_module()
-- Paczka 1 (fundament modularności). Migracja ADDYTYWNA.
-- Dokument: docs/wynajem-mvp-projekt.md (pkt 1.4) + rozstrzygnięcie N1.
--
-- N1: rozdział na dwie funkcje:
--   - company_module_enabled() = warstwy 1+2 (platforma + entitlement firmy),
--     BEZ roli -> używane przez DISPATCHER (kontekst service-role, brak auth.uid()).
--   - can_use_module()         = warstwy 1+2+3 (z rolą auth.uid())
--     -> używane w RLS i UI.
--
-- Kolejność AND (od najszerszego kill-switcha do najwęższego):
--   1) PLATFORMA: feature_toggles (globalny wyłącznik modułu)
--   2) FIRMA:     company_modules (co firma ma wykupione / trial)
--   3) ROLA:      module_visibility.visible_to_roles (per-użytkownik)
--
-- SEMANTYKA "BRAK WIERSZA" (decyzja implementacyjna, udokumentowana):
--   Warstwa 1 i 3 to KILL-SWITCHE -> brak wiersza = NIE blokuje.
--   (feature_toggles blokuje tylko gdy istnieje wiersz z is_enabled=false;
--    module_visibility blokuje tylko gdy istnieje wiersz i rola się nie zgadza.)
--   Warstwa 2 to realny gate per-firma -> wiersz MUSI istnieć i być aktywny.
-- =====================================================================

-- ---- Warstwy 1+2 (dispatcher) ---------------------------------------
CREATE OR REPLACE FUNCTION public.company_module_enabled(
  p_company_id uuid,
  p_module_key text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    -- Warstwa 1 (platforma / kill-switch): brak wiersza = nie blokuje.
    NOT EXISTS (
      SELECT 1 FROM public.feature_toggles ft
      WHERE ft.feature_key = p_module_key
        AND ft.is_enabled = false
    )
    AND
    -- Warstwa 2 (firma): realny gate, wiersz musi istnieć i być aktywny.
    EXISTS (
      SELECT 1 FROM public.company_modules cm
      WHERE cm.company_id = p_company_id
        AND cm.module_key = p_module_key
        AND (
          cm.enabled = true
          OR (cm.trial_until IS NOT NULL AND cm.trial_until > now())
        )
    );
$$;

-- ---- Warstwy 1+2+3 (RLS + UI) ---------------------------------------
CREATE OR REPLACE FUNCTION public.can_use_module(
  p_company_id uuid,
  p_module_key text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.company_module_enabled(p_company_id, p_module_key)
    AND
    -- Warstwa 3 (rola): admin zawsze; brak wiersza module_visibility = nie blokuje;
    -- gdy wiersz istnieje -> musi być is_active oraz rola usera w visible_to_roles.
    (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR NOT EXISTS (
        SELECT 1 FROM public.module_visibility mv
        WHERE mv.module_key = p_module_key
      )
      OR EXISTS (
        SELECT 1 FROM public.module_visibility mv
        WHERE mv.module_key = p_module_key
          AND mv.is_active = true
          AND EXISTS (
            SELECT 1 FROM public.user_roles ur
            WHERE ur.user_id = auth.uid()
              AND ur.role::text = ANY (mv.visible_to_roles)
          )
      )
    );
$$;

-- =====================================================================
-- WERYFIKACJA:
--   SELECT public.company_module_enabled('<company_uuid>','rental');
--   SELECT public.can_use_module('<company_uuid>','rental');
-- =====================================================================
