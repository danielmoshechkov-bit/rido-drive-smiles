-- Sprint 1 / A3 (giełda aut) — SEO-friendly URL slugs for vehicle listings.
--
-- Adds `vehicle_listings.slug` and guarantees every row gets a stable, unique,
-- human/SEO-readable slug of the form:  brand-model-year-city-<short-id>
-- e.g.  bmw-seria-3-2019-warszawa-a1b2c3
--
-- Slug generation is done with a BEFORE INSERT/UPDATE trigger rather than in the
-- frontend, because vehicle_listings is inserted from ~10 different components
-- (AddVehicleListing, fleet/driver modals, admin, etc.). A DB trigger is the only
-- place that covers all of them. The matching client helper lives in
-- src/utils/slug.ts (kept in sync with slugify() below) for building canonical URLs
-- optimistically before the row round-trips.
--
-- SEO note: the slug is generated on INSERT and only (re)filled on UPDATE when it is
-- missing — once set it never changes, so published URLs stay stable.

-- 1. Polish-aware slugify. unaccent does not handle 'ł', so we translate the Polish
--    letters explicitly, then lowercase and collapse everything else to single '-'.
create or replace function public.slugify(value text)
returns text
language sql
immutable
as $$
  select trim(both '-' from
    regexp_replace(
      regexp_replace(
        lower(
          translate(
            coalesce(value, ''),
            'ąćęłńóśźżĄĆĘŁŃÓŚŹŻ',
            'acelnoszzacelnoszz'
          )
        ),
        '[^a-z0-9]+', '-', 'g'
      ),
      '-{2,}', '-', 'g'
    )
  );
$$;

-- 2. Build the vehicle slug from its descriptive fields + a short id fragment.
--    `suffix_len` controls how many hex chars of the id are appended (uniqueness).
create or replace function public.build_vehicle_slug(
  p_brand text,
  p_model text,
  p_year int,
  p_city text,
  p_id uuid,
  p_suffix_len int default 6
)
returns text
language sql
immutable
as $$
  select public.slugify(
    concat_ws('-',
      nullif(p_brand, ''),
      nullif(p_model, ''),
      nullif(p_year::text, ''),
      nullif(p_city, ''),
      left(replace(p_id::text, '-', ''), greatest(p_suffix_len, 4))
    )
  );
$$;

-- 3. Column (nullable for now; backfilled below, then a unique index is added).
alter table public.vehicle_listings
  add column if not exists slug text;

-- 4. Trigger: fill slug on insert, or on update if it is still empty. Extends the
--    id fragment if a (very unlikely) collision with another row occurs.
create or replace function public.set_vehicle_listing_slug()
returns trigger
language plpgsql
as $$
declare
  candidate text;
  suffix_len int := 6;
begin
  if new.slug is null or new.slug = '' then
    candidate := public.build_vehicle_slug(new.brand, new.model, new.year, new.city, new.id, suffix_len);
    while exists (
      select 1 from public.vehicle_listings vl
      where vl.slug = candidate and vl.id <> new.id
    ) loop
      suffix_len := suffix_len + 2;
      candidate := public.build_vehicle_slug(new.brand, new.model, new.year, new.city, new.id, suffix_len);
      exit when suffix_len >= 32;
    end loop;
    new.slug := candidate;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_vehicle_listing_slug on public.vehicle_listings;
create trigger trg_vehicle_listing_slug
  before insert or update on public.vehicle_listings
  for each row
  execute function public.set_vehicle_listing_slug();

-- 5. Backfill existing rows.
update public.vehicle_listings
set slug = public.build_vehicle_slug(brand, model, year, city, id)
where slug is null or slug = '';

-- 6. Resolve any residual duplicate slugs (defensive — the id fragment makes this
--    near-impossible) by appending a longer id fragment to all but the first.
with d as (
  select id,
    row_number() over (partition by slug order by created_at nulls last, id) as rn
  from public.vehicle_listings
)
update public.vehicle_listings vl
set slug = vl.slug || '-' || left(replace(vl.id::text, '-', ''), 10)
from d
where d.id = vl.id and d.rn > 1;

-- 7. Enforce uniqueness + fast lookup by slug.
create unique index if not exists vehicle_listings_slug_key
  on public.vehicle_listings (slug);
