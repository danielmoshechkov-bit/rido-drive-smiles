-- Dodaj politykę RLS pozwalającą każdemu zalogowanemu użytkownikowi tworzyć własne firmy
-- i zarządzać nimi (właściciel może robić wszystko ze swoimi encjami)

-- Najpierw usuń istniejące restrykcyjne polityki dla entities
DROP POLICY IF EXISTS "Users can insert own entities" ON public.entities;
DROP POLICY IF EXISTS "Users can view own entities" ON public.entities;
DROP POLICY IF EXISTS "Users can update own entities" ON public.entities;
DROP POLICY IF EXISTS "Users can delete own entities" ON public.entities;
DROP POLICY IF EXISTS "Entity owners manage own entities" ON public.entities;
DROP POLICY IF EXISTS "Accounting admins view assigned entities" ON public.entities;
DROP POLICY IF EXISTS "Accounting users can view assigned entities" ON public.entities;

-- Każdy zalogowany użytkownik może tworzyć własną firmę
CREATE POLICY "Anyone can create own entity"
ON public.entities
FOR INSERT
TO authenticated
WITH CHECK (owner_user_id = auth.uid());

-- Użytkownik widzi swoje firmy
CREATE POLICY "Users view own entities"
ON public.entities
FOR SELECT
TO authenticated
USING (owner_user_id = auth.uid());

-- Użytkownik może aktualizować swoje firmy
CREATE POLICY "Users update own entities"
ON public.entities
FOR UPDATE
TO authenticated
USING (owner_user_id = auth.uid())
WITH CHECK (owner_user_id = auth.uid());

-- Użytkownik może usuwać swoje firmy
CREATE POLICY "Users delete own entities"
ON public.entities
FOR DELETE
TO authenticated
USING (owner_user_id = auth.uid());

-- Accounting admins mogą widzieć przypisane firmy (przez accounting_assignments)
CREATE POLICY "Accounting users view assigned entities"
ON public.entities
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.accounting_assignments aa
    WHERE aa.entity_id = entities.id
    AND aa.accounting_user_id = auth.uid()
  )
);

-- Admini widzą wszystkie firmy
CREATE POLICY "Admins view all entities"
ON public.entities
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND role = 'admin'
  )
);