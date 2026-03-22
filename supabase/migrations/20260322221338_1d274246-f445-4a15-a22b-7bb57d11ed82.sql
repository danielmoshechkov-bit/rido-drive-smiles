-- KSeF Monitor Alerts table
create table if not exists ksef_monitor_alerts (
  id uuid default gen_random_uuid() primary key,
  created_at timestamptz default now(),
  user_id uuid references auth.users(id) on delete cascade,
  severity text check (severity in ('critical','warning','info')) not null,
  title text not null,
  description text,
  action_required text,
  source text,
  source_url text,
  is_read boolean default false,
  resolved_at timestamptz
);

-- KSeF Monitor Config table (per user)
create table if not exists ksef_monitor_config (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade unique,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  alert_email text,
  slack_webhook_url text,
  scan_enabled boolean default true,
  scan_frequency text default 'daily',
  notify_critical boolean default true,
  notify_warning boolean default true,
  notify_info boolean default false,
  last_scan_at timestamptz,
  last_scan_status text default 'never',
  last_scan_alerts_count int default 0
);

-- KSeF Monitor Scan History
create table if not exists ksef_monitor_scans (
  id uuid default gen_random_uuid() primary key,
  created_at timestamptz default now(),
  user_id uuid references auth.users(id) on delete cascade,
  status text check (status in ('ok','error')) not null,
  sources_checked int default 0,
  alerts_found int default 0,
  error_message text,
  duration_ms int
);

-- RLS
alter table ksef_monitor_alerts enable row level security;
alter table ksef_monitor_config enable row level security;
alter table ksef_monitor_scans enable row level security;

create policy "Users see own ksef alerts" on ksef_monitor_alerts for select using (user_id = auth.uid());
create policy "Users update own ksef alerts" on ksef_monitor_alerts for update using (user_id = auth.uid());
create policy "Insert ksef alerts" on ksef_monitor_alerts for insert with check (true);

create policy "Users select ksef config" on ksef_monitor_config for select using (user_id = auth.uid());
create policy "Users insert ksef config" on ksef_monitor_config for insert with check (user_id = auth.uid());
create policy "Users update ksef config" on ksef_monitor_config for update using (user_id = auth.uid());

create policy "Users see own ksef scans" on ksef_monitor_scans for select using (user_id = auth.uid());
create policy "Insert ksef scans" on ksef_monitor_scans for insert with check (true);

-- Updated_at trigger
create trigger ksef_monitor_config_updated_at before update on ksef_monitor_config
  for each row execute function trigger_set_updated_at();