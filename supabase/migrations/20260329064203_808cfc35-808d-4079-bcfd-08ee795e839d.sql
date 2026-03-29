
-- SEO audit results table
create table if not exists public.seo_audit_results (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid references public.agent_listings(id) on delete cascade,
  audit_type text not null,
  issue text,
  suggestion text,
  score int,
  status text not null default 'pending',
  approved_by uuid,
  approved_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.seo_audit_results enable row level security;

create policy "Admin full access on seo_audit_results"
  on public.seo_audit_results
  for all
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

-- Add AI SEO columns to agent_listings
alter table public.agent_listings add column if not exists ai_seo_description text;
alter table public.agent_listings add column if not exists ai_title_audit jsonb;
