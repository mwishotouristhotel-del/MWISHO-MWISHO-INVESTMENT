-- Validate only the four recognized package codes, and require priced plans to specify extra-guest charges.
create or replace function public.select_every_room_package_prices_valid(p jsonb)
returns boolean language sql immutable set search_path='' as $$
 select coalesce(jsonb_typeof(p)='object'
 and not exists (select 1 from jsonb_object_keys(p) as k(key)
   where k.key not in ('bed_only','bed_breakfast','half_board','full_board'))
 and not exists (select 1 from jsonb_each(p) as e(key,val)
   where jsonb_typeof(e.val)<>'object'
   or not (e.val ? 'base_rate_kes') or not (e.val ? 'extra_guest_kes')
   or jsonb_typeof(e.val->'base_rate_kes')<>'number'
   or jsonb_typeof(e.val->'extra_guest_kes')<>'number'
   or (e.val->>'base_rate_kes')::numeric < 0
   or (e.val->>'extra_guest_kes')::numeric < 0
   or (e.val->>'base_rate_kes')::numeric > 10000000
   or (e.val->>'extra_guest_kes')::numeric > 10000000
 )) false
$$;
-- Room-specific meal plans; separate rates and extra-guest charges per package.
-- Existing nightly_rate_kes remains for backwards compatibility with other readers.
alter table public.hotel_website_room_listings
 add column if not exists package_rates jsonb not null default '{}'::jsonb;
update public.hotel_website_room_listings
set package_rates=jsonb_build_object('bed_only',jsonb_build_object('base_rate_kes',nightly_rate_kes,'extra_guest_kes',0))
where package_rates='{}'::jsonb;
alter table public.hotel_website_room_listings
 add constraint hotel_website_room_packages_valid check (
 jsonb_typeof(package_rates)='object'
 and (public.select_every_room_package_prices_valid(package_rates))
 );
