
-- ═══════════════════════════════════════
-- ZLECENIA REKLAMOWE
-- ═══════════════════════════════════════
create table if not exists ad_orders (
  id uuid default gen_random_uuid() primary key,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  service_id uuid not null,
  provider_user_id uuid not null,
  specialist_user_id uuid,
  status text default 'new' check (status in (
    'new','accepted','in_progress','review','active','paused','completed','cancelled'
  )),
  budget_monthly numeric not null default 0,
  budget_currency text default 'PLN',
  target_location text,
  target_audience text,
  campaign_goal text check (campaign_goal in ('leads','calls','messages','awareness')) default 'leads',
  additional_notes text,
  expected_leads_per_month int,
  meta_ad_account_id text,
  meta_page_id text,
  meta_campaign_id text,
  meta_adset_id text,
  meta_ad_id text,
  meta_form_id text,
  meta_pixel_id text,
  meta_access_token text,
  leads_total int default 0,
  leads_this_month int default 0,
  spend_total numeric default 0,
  spend_this_month numeric default 0,
  cpl_avg numeric default 0,
  last_message_at timestamptz,
  unread_messages_provider int default 0,
  unread_messages_specialist int default 0,
  campaign_name text,
  campaign_started_at timestamptz,
  campaign_paused_at timestamptz
);

-- ═══════════════════════════════════════
-- WIADOMOŚCI W ZLECENIU
-- ═══════════════════════════════════════
create table if not exists ad_order_messages (
  id uuid default gen_random_uuid() primary key,
  created_at timestamptz default now(),
  order_id uuid references ad_orders(id) on delete cascade,
  sender_id uuid not null,
  sender_type text check (sender_type in ('provider','specialist','system')),
  message text not null,
  attachments jsonb default '[]'::jsonb,
  is_read boolean default false
);

-- ═══════════════════════════════════════
-- LEADY
-- ═══════════════════════════════════════
create table if not exists leads (
  id uuid default gen_random_uuid() primary key,
  created_at timestamptz default now(),
  provider_user_id uuid not null,
  service_id uuid,
  ad_order_id uuid references ad_orders(id),
  source text default 'meta' check (source in ('meta','manual','website','phone','referral')),
  source_detail text,
  first_name text,
  last_name text,
  phone text,
  email text,
  city text,
  voivodeship text,
  meta_lead_id text unique,
  meta_form_id text,
  meta_ad_id text,
  meta_campaign_name text,
  custom_form_fields jsonb default '{}'::jsonb,
  status text default 'new' check (status in (
    'new','viewed','contacted','in_conversation','meeting_booked','converted','rejected','no_answer','opted_out'
  )),
  priority text default 'normal' check (priority in ('hot','warm','normal','cold')),
  ai_agent_enabled boolean default false,
  ai_agent_id uuid,
  ai_agent_status text default 'idle' check (ai_agent_status in ('idle','running','paused','completed')),
  meeting_scheduled_at timestamptz,
  meeting_type text,
  meeting_notes text,
  notes text,
  tags text[] default array[]::text[],
  last_contact_at timestamptz,
  next_follow_up_at timestamptz,
  contact_attempts int default 0,
  ai_score int default 50,
  ai_intent text
);

-- ═══════════════════════════════════════
-- OCENY SPECJALISTÓW
-- ═══════════════════════════════════════
create table if not exists specialist_ratings (
  id uuid default gen_random_uuid() primary key,
  created_at timestamptz default now(),
  order_id uuid references ad_orders(id) unique,
  specialist_user_id uuid,
  provider_user_id uuid,
  rating int check (rating between 1 and 5),
  comment text
);

-- RLS
alter table ad_orders enable row level security;
alter table ad_order_messages enable row level security;
alter table leads enable row level security;
alter table specialist_ratings enable row level security;

create policy "Provider manages own ad_orders" on ad_orders for all
  using (provider_user_id = auth.uid());
create policy "Specialist sees assigned ad_orders" on ad_orders for select
  using (specialist_user_id = auth.uid() or (specialist_user_id is null and status = 'new'));
create policy "Specialist updates assigned ad_orders" on ad_orders for update
  using (specialist_user_id = auth.uid());

create policy "Provider manages own leads" on leads for all
  using (provider_user_id = auth.uid());

create policy "Order participants see messages" on ad_order_messages for all
  using (
    exists (
      select 1 from ad_orders
      where id = ad_order_messages.order_id
      and (provider_user_id = auth.uid() or specialist_user_id = auth.uid())
    )
  );

create policy "Rating participants" on specialist_ratings for all
  using (provider_user_id = auth.uid() or specialist_user_id = auth.uid());

-- Indeksy
create index if not exists idx_leads_provider on leads(provider_user_id);
create index if not exists idx_leads_status on leads(status);
create index if not exists idx_leads_source on leads(source);
create index if not exists idx_leads_created on leads(created_at desc);
create index if not exists idx_ad_orders_provider on ad_orders(provider_user_id);
create index if not exists idx_ad_orders_specialist on ad_orders(specialist_user_id);
create index if not exists idx_ad_orders_status on ad_orders(status);

-- Trigger updated_at
create trigger set_ad_orders_updated_at before update on ad_orders
  for each row execute function trigger_set_updated_at();
