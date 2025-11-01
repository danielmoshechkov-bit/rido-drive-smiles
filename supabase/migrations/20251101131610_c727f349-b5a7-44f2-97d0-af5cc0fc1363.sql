-- Create table to track settlement plan changes
create table public.settlement_plan_changes (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.drivers(id) on delete cascade,
  old_plan_id uuid references public.settlement_plans(id),
  new_plan_id uuid not null references public.settlement_plans(id),
  changed_by uuid not null,
  changed_at timestamp with time zone not null default now(),
  changed_by_role app_role not null,
  notes text
);

-- Index for quick lookup of last change
create index idx_plan_changes_driver_date 
  on public.settlement_plan_changes(driver_id, changed_at desc);

-- Enable RLS
alter table public.settlement_plan_changes enable row level security;

-- RLS policies
create policy "Admins can manage plan changes"
  on public.settlement_plan_changes
  for all
  to authenticated
  using (has_role(auth.uid(), 'admin'::app_role))
  with check (has_role(auth.uid(), 'admin'::app_role));

create policy "Users can view their own plan changes"
  on public.settlement_plan_changes
  for select
  to authenticated
  using (
    driver_id in (
      select driver_id from driver_app_users where user_id = auth.uid()
    )
    or has_role(auth.uid(), 'admin'::app_role)
    or exists (
      select 1 from drivers d
      where d.id = settlement_plan_changes.driver_id
      and d.fleet_id = get_user_fleet_id(auth.uid())
    )
  );

-- Create function to check if user can change settlement plan
create or replace function public.can_change_settlement_plan(
  _driver_id uuid,
  _user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  _is_admin boolean;
  _last_change_date timestamp with time zone;
  _days_since_change integer;
  _can_change boolean;
  _days_until_change integer;
begin
  -- Check if user is admin
  _is_admin := has_role(_user_id, 'admin'::app_role);
  
  -- Admin can always change
  if _is_admin then
    return jsonb_build_object(
      'can_change', true,
      'is_admin', true,
      'reason', 'Administrator może zmieniać plan w dowolnym momencie'
    );
  end if;
  
  -- Get last change date for driver
  select changed_at into _last_change_date
  from settlement_plan_changes
  where driver_id = _driver_id
  order by changed_at desc
  limit 1;
  
  -- If no previous change, can change
  if _last_change_date is null then
    return jsonb_build_object(
      'can_change', true,
      'is_admin', false,
      'reason', 'Brak wcześniejszych zmian planu'
    );
  end if;
  
  -- Calculate days since last change
  _days_since_change := extract(epoch from (now() - _last_change_date)) / 86400;
  _can_change := _days_since_change >= 30;
  _days_until_change := greatest(0, 30 - _days_since_change::integer);
  
  return jsonb_build_object(
    'can_change', _can_change,
    'is_admin', false,
    'days_since_last_change', _days_since_change::integer,
    'days_until_next_change', _days_until_change,
    'last_change_date', _last_change_date,
    'reason', case 
      when _can_change then 'Minęło 30 dni od ostatniej zmiany'
      else format('Następna zmiana możliwa za %s dni', _days_until_change)
    end
  );
end;
$$;