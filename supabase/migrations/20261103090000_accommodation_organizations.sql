-- Reusable organization directory and guest classification for accommodation.
-- An organization can have many room stays; room, billing and reception rules
-- remain enforced by the original package check-in RPC.
create table if not exists public.hotel_accommodation_organizations (
 id uuid primary key default gen_random_uuid(),
 name text not null check (char_length(btrim(name)) between 2 and 180),
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now()
);
create unique index if not exists hotel_accommodation_organization_name_key
 on public.hotel_accommodation_organizations ((lower(btrim(name))));
alter table public.hotel_accommodation_organizations enable row level security;
revoke all on public.hotel_accommodation_organizations from public,anon,authenticated;
grant select on public.hotel_accommodation_organizations to authenticated;
drop policy if exists hotel_accommodation_organizations_reception_read on public.hotel_accommodation_organizations;
create policy hotel_accommodation_organizations_reception_read on public.hotel_accommodation_organizations
 for select to authenticated using ((select public.hotel_accommodation_can_reception()));

alter table public.hotel_accommodation_stays
 add column if not exists guest_type text not null default 'walk_in',
 add column if not exists organization_id uuid references public.hotel_accommodation_organizations(id);
alter table public.hotel_accommodation_stays
 drop constraint if exists hotel_accommodation_guest_type_valid;
alter table public.hotel_accommodation_stays
 add constraint hotel_accommodation_guest_type_valid check (
  (guest_type='walk_in' and organization_id is null) or
  (guest_type='organization' and organization_id is not null)
 );
create index if not exists hotel_accommodation_stays_organization
 on public.hotel_accommodation_stays(organization_id) where organization_id is not null;

create or replace function public.hotel_accommodation_register_organization(p_name text)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_name text;v_id uuid;
begin
 if auth.uid() is null or not public.hotel_accommodation_can_reception() then
  raise exception 'Reception access required';
 end if;
 v_name:=btrim(regexp_replace(coalesce(p_name,''),'[[:space:]]+',' ','g'));
 if char_length(v_name) not between 2 and 180 or v_name ~ '[[:cntrl:]]' then
  raise exception 'Enter an organization name between 2 and 180 characters';
 end if;
 insert into public.hotel_accommodation_organizations(name,created_by)
 values(v_name,auth.uid()) on conflict do nothing returning id into v_id;
 if v_id is null then
  select id into v_id from public.hotel_accommodation_organizations
  where lower(btrim(name))=lower(v_name);
 end if;
 if v_id is null then raise exception 'Could not locate organization. Please retry'; end if;
 return v_id;
end;$$;

-- Delegate all availability, package pricing, receipt and section checks to
-- the existing proven RPC. This wrapper only records guest classification.
create or replace function public.hotel_accommodation_checkin_grouped(
 p_room uuid,p_listing uuid,p_package text,p_guests integer,p_guest jsonb,
 p_check_in date,p_check_out date,p_initial_payment numeric default 0,
 p_method text default 'cash',p_reference text default null
) returns uuid language plpgsql security definer set search_path='' as $$
declare v_stay uuid;v_type text;v_org uuid;
begin
 if auth.uid() is null or not public.hotel_accommodation_can_reception() then
  raise exception 'Reception access required';
 end if;
 v_type:=coalesce(nullif(btrim(p_guest->>'guest_type'),''),'walk_in');
 if v_type not in ('walk_in','organization') then raise exception 'Invalid guest category'; end if;
 if v_type='organization' then
  if nullif(btrim(p_guest->>'organization_id'),'') is null then
   raise exception 'Choose or register an organization';
  end if;
  v_org:=(p_guest->>'organization_id')::uuid;
  if not exists(select 1 from public.hotel_accommodation_organizations where id=v_org) then
   raise exception 'Organization is not registered';
  end if;
 elsif nullif(btrim(p_guest->>'organization_id'),'') is not null then
  raise exception 'Walk-in guests cannot be assigned an organization';
 end if;
 v_stay:=public.hotel_accommodation_checkin_package(
  p_room,p_listing,p_package,p_guests,p_guest,p_check_in,p_check_out,
  p_initial_payment,p_method,p_reference
 );
 update public.hotel_accommodation_stays
 set guest_type=v_type,organization_id=v_org where id=v_stay;
 return v_stay;
end;$$;

-- An organization guest's eventual group invoice must identify that
-- organization, unless a separate invoice organization was explicitly chosen
-- during checkout (which takes precedence).
create or replace function public.hotel_accommodation_guard_invoice_organization()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_expected text;v_actual text;
begin
 select coalesce(s.invoice_organization_name,o.name) into v_expected
 from public.hotel_accommodation_stays s
 left join public.hotel_accommodation_organizations o on o.id=s.organization_id
 where s.id=new.stay_id;
 select organization_name into v_actual
 from public.hotel_accommodation_invoices where id=new.invoice_id;
 if v_expected is not null and lower(btrim(v_expected))<>lower(btrim(v_actual)) then
  raise exception 'Room was registered for a different invoice organization';
 end if;
 return new;
end;$$;
revoke all on function public.hotel_accommodation_register_organization(text) from public,anon;
revoke all on function public.hotel_accommodation_checkin_grouped(uuid,uuid,text,integer,jsonb,date,date,numeric,text,text) from public,anon;
grant execute on function public.hotel_accommodation_register_organization(text) to authenticated;
grant execute on function public.hotel_accommodation_checkin_grouped(uuid,uuid,text,integer,jsonb,date,date,numeric,text,text) to authenticated;
