-- Room-specific tariffs; preserves legacy nightly_rate_kes for existing callers.
create or replace function public.hotel_valid_package_rates(p jsonb)
returns boolean language plpgsql immutable set search_path='' as $body$
declare item record; price numeric; supplement numeric;
begin
 if p is null or jsonb_typeof(p) <> 'object' then return false; end if;
 for item in select key,value from jsonb_each(p) loop
  if item.key not in ('bed_only','bed_breakfast','half_board','full_board') then return false; end if;
  if jsonb_typeof(item.value) <> 'object' then return false; end if;
  if jsonb_typeof(item.value->'base_rate_kes') <> 'number'
    or jsonb_typeof(item.value->'extra_guest_kes') <> 'number' then return false; end if;
  price:=(item.value->>'base_rate_kes')::numeric;
  supplement:=(item.value->>'extra_guest_kes')::numeric;
  if price < 0 or price > 10000000 or supplement < 0 or supplement > 10000000 then return false; end if;
 end loop;
 return true;
exception when others then return false;
end;
$body$;
alter table public.hotel_website_room_listings
 add column if not exists package_rates jsonb not null default '{}'::jsonb;
update public.hotel_website_room_listings
set package_rates=jsonb_build_object('bed_only',jsonb_build_object('base_rate_kes',nightly_rate_kes,'extra_guest_kes',0))
where package_rates='{}'::jsonb;
alter table public.hotel_website_room_listings
 add constraint hotel_website_room_packages_valid check (public.hotel_valid_package_rates(package_rates));
