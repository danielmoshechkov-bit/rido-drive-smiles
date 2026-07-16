-- Konta testowe z pełnym dostępem (widzą funkcje "wkrótce" jako aktywne).
-- Dedykowana tabela zamiast kolumny na marketplace_user_profiles: konta warsztatowe /
-- flotowe / kierowców nie mają wiersza w mp_profiles (np. warsztat@test.pl), a to
-- właśnie je chcemy móc oznaczać. Odblokowanie kolejnego konta = jeden INSERT, bez kodu.
-- Idempotentna: bezpieczna do wielokrotnego odpalenia.

create table if not exists public.beta_testers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  note text,
  created_at timestamptz not null default now()
);

alter table public.beta_testers enable row level security;

-- Użytkownik widzi wyłącznie własny wpis (helper useIsBetaTester czyta swój rekord).
drop policy if exists "beta_testers self read" on public.beta_testers;
create policy "beta_testers self read"
  on public.beta_testers for select
  using (auth.uid() = user_id);

-- Admini mogą czytać/zarządzać wszystkimi wpisami (nadawanie flagi z panelu w przyszłości).
drop policy if exists "beta_testers admin all" on public.beta_testers;
create policy "beta_testers admin all"
  on public.beta_testers for all
  using (exists (select 1 from public.user_roles r where r.user_id = auth.uid() and r.role = 'admin'))
  with check (exists (select 1 from public.user_roles r where r.user_id = auth.uid() and r.role = 'admin'));

-- Seed: konto testowe warsztat@test.pl
insert into public.beta_testers (user_id, note)
select id, 'konto testowe — pełny dostęp' from auth.users where email = 'warsztat@test.pl'
on conflict (user_id) do nothing;
