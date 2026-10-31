-- Adds operational room inventory and stays alongside existing public room listings.
-- Existing website requests, POS orders, pricing and stock procedures are unchanged.
alter table public.staff_roles drop constraint if exists staff_roles_role_check;
alter table public.staff_roles add constraint staff_roles_role_check check(role in
 ('director_admin','central_manager','accounts','central_storekeeper','department_manager','supervisor',
 'cashier','head_waiter','waiter','order_taker','handover_staff','release_staff','kitchen_staff','bar_staff',
 'stock_taker','receptionist','room_attendant'));

create or replace function public.hotel_accommodation_can_reception()
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.staff_roles r left join public.departments d on d.id=r.department_id
  join public.staff_profiles p on p.user_id=r.user_id
  where r.user_id=(select auth.uid()) and r.active and p.active
  and (r.role in ('director_admin','central_manager') or
       (d.name='Hotel' and r.role in ('department_manager','supervisor','receptionist'))));
$$;
create or replace function public.hotel_accommodation_can_housekeeping()
returns boolean language sql stable security definer set search_path='' as $$
 select public.hotel_accommodation_can_reception() or exists(
  select 1 from public.staff_roles r join public.departments d on d.id=r.department_id
  join public.staff_profiles p on p.user_id=r.user_id
  where r.user_id=(select auth.uid()) and r.active and p.active
  and d.name='Hotel' and r.role='room_attendant');
$$;
revoke all on function public.hotel_accommodation_can_reception() from public,anon;
revoke all on function public.hotel_accommodation_can_housekeeping() from public,anon;
grant execute on function public.hotel_accommodation_can_reception() to authenticated;
grant execute on function public.hotel_accommodation_can_housekeeping() to authenticated;

create table if not exists public.hotel_accommodation_rooms(
 id uuid primary key default gen_random_uuid(),
 room_number text not null unique check(length(trim(room_number)) between 1 and 30),
 category text not null check(category in ('vvip','regular')),
 listing_id uuid references public.hotel_website_room_listings(id) on delete set null,
 nightly_rate_kes numeric(12,2) not null check(nightly_rate_kes>=0),
 housekeeping_status text not null default 'ready' check(housekeeping_status in ('ready','dirty','cleaning','inspection','maintenance')),
 active boolean not null default true,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create table if not exists public.hotel_accommodation_stays(
 id uuid primary key default gen_random_uuid(),
 room_id uuid not null references public.hotel_accommodation_rooms(id),
 guest_name text not null check(length(trim(guest_name)) between 2 and 150),
 guest_id_number text not null check(length(trim(guest_id_number)) between 3 and 60),
 guest_phone text not null check(length(trim(guest_phone)) between 7 and 30),
 nationality text not null, country_of_residence text not null, county_of_residence text not null,
 email text, vehicle_registration text,
 check_in_date date not null, expected_check_out_date date not null,
 actual_check_out_date date,
 nightly_rate_kes numeric(12,2) not null check(nightly_rate_kes>=0),
 total_kes numeric(12,2) generated always as ((expected_check_out_date-check_in_date)*nightly_rate_kes) stored,
 status text not null default 'checked_in' check(status in ('checked_in','checked_out')),
 created_by uuid not null default auth.uid() references auth.users(id),
 checked_out_by uuid references auth.users(id),
 created_at timestamptz not null default now(),
 check(status='checked_in' and actual_check_out_date is null or status='checked_out' and actual_check_out_date is not null),
 check(expected_check_out_date>check_in_date and expected_check_out_date<=check_in_date+365)
);
create unique index if not exists hotel_one_active_stay_per_room on public.hotel_accommodation_stays(room_id) where status='checked_in';
create index if not exists hotel_accommodation_stays_recent on public.hotel_accommodation_stays(created_at desc);
create table if not exists public.hotel_accommodation_payments(
 id uuid primary key default gen_random_uuid(),
 stay_id uuid not null references public.hotel_accommodation_stays(id),
 amount_kes numeric(12,2) not null check(amount_kes>0),
 method text not null check(method in ('cash','mpesa','bank','other')),
 reference text,
 received_by uuid not null default auth.uid() references auth.users(id),
 received_at timestamptz not null default now(),
 check(method<>'mpesa' or length(trim(coalesce(reference,'')))>=5)
);

alter table public.hotel_accommodation_rooms enable row level security;
alter table public.hotel_accommodation_stays enable row level security;
alter table public.hotel_accommodation_payments enable row level security;
revoke all on public.hotel_accommodation_rooms,public.hotel_accommodation_stays,public.hotel_accommodation_payments from anon,authenticated;
grant select,insert on public.hotel_accommodation_rooms to authenticated;
grant update(housekeeping_status) on public.hotel_accommodation_rooms to authenticated;
grant select on public.hotel_accommodation_stays to authenticated;
grant select on public.hotel_accommodation_payments to authenticated;
create policy hotel_rooms_staff_read on public.hotel_accommodation_rooms for select to authenticated
 using ((select public.hotel_accommodation_can_housekeeping()));
create policy hotel_rooms_reception_insert on public.hotel_accommodation_rooms for insert to authenticated
 with check ((select public.hotel_accommodation_can_reception()));
create policy hotel_rooms_staff_update on public.hotel_accommodation_rooms for update to authenticated
 using ((select public.hotel_accommodation_can_housekeeping())) with check ((select public.hotel_accommodation_can_housekeeping()));
create or replace function public.hotel_accommodation_guard_housekeeping()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.housekeeping_status is distinct from old.housekeeping_status
    and exists(select 1 from public.hotel_accommodation_stays where room_id=old.id and status='checked_in') then
  raise exception 'Room is occupied; housekeeping changes must follow checkout';
 end if;
 return new;
end;
$$;
revoke all on function public.hotel_accommodation_guard_housekeeping() from public,anon,authenticated;
drop trigger if exists hotel_accommodation_housekeeping_guard on public.hotel_accommodation_rooms;
create trigger hotel_accommodation_housekeeping_guard before update of housekeeping_status on public.hotel_accommodation_rooms
 for each row execute function public.hotel_accommodation_guard_housekeeping();
create policy hotel_stays_reception_read on public.hotel_accommodation_stays for select to authenticated
 using ((select public.hotel_accommodation_can_reception()));
create policy hotel_payments_reception_read on public.hotel_accommodation_payments for select to authenticated
 using ((select public.hotel_accommodation_can_reception()));

-- Privileged, narrowly scoped entry points enforce rates, balances and atomicity.
-- No client can directly insert/update stay or payment ledger rows.
create or replace function public.hotel_accommodation_checkin(
 p_room uuid,p_guest jsonb,p_check_in date,p_check_out date,
 p_initial_payment numeric default 0,p_method text default 'cash',p_reference text default null
) returns uuid language plpgsql security definer set search_path='' as $$
declare v_room public.hotel_accommodation_rooms%rowtype;v_total numeric;v_stay uuid;
begin
 if auth.uid() is null or not public.hotel_accommodation_can_reception() then raise exception 'Reception access required'; end if;
 if p_check_in is null or p_check_out is null or p_check_out<=p_check_in or p_check_out>p_check_in+365 then
  raise exception 'Invalid accommodation date range'; end if;
 select * into v_room from public.hotel_accommodation_rooms where id=p_room for update;
 if v_room.id is null or not v_room.active or v_room.housekeeping_status<>'ready' then raise exception 'Room is not available'; end if;
 if exists(select 1 from public.hotel_accommodation_stays where room_id=p_room and status='checked_in') then raise exception 'Room is occupied'; end if;
 v_total:=(p_check_out-p_check_in)*v_room.nightly_rate_kes;
 if p_initial_payment is null or p_initial_payment<0 or p_initial_payment>v_total then raise exception 'Invalid initial payment'; end if;
 insert into public.hotel_accommodation_stays(room_id,guest_name,guest_id_number,guest_phone,nationality,country_of_residence,
  county_of_residence,email,vehicle_registration,check_in_date,expected_check_out_date,nightly_rate_kes,created_by)
 values(p_room,nullif(trim(p_guest->>'guest_name'),''),nullif(trim(p_guest->>'guest_id_number'),''),
  nullif(trim(p_guest->>'guest_phone'),''),nullif(trim(p_guest->>'nationality'),''),
  nullif(trim(p_guest->>'country_of_residence'),''),nullif(trim(p_guest->>'county_of_residence'),''),
  nullif(trim(p_guest->>'email'),''),nullif(trim(p_guest->>'vehicle_registration'),''),p_check_in,p_check_out,
  v_room.nightly_rate_kes,auth.uid()) returning id into v_stay;
 if p_initial_payment>0 then
  insert into public.hotel_accommodation_payments(stay_id,amount_kes,method,reference,received_by)
  values(v_stay,p_initial_payment,p_method,p_reference,auth.uid());
 end if;
 return v_stay;
end;
$$;
create or replace function public.hotel_accommodation_record_payment(
 p_stay uuid,p_amount numeric,p_method text,p_reference text default null
) returns void language plpgsql security definer set search_path='' as $$
declare v_stay public.hotel_accommodation_stays%rowtype;v_paid numeric;
begin
 if auth.uid() is null or not public.hotel_accommodation_can_reception() then raise exception 'Reception access required'; end if;
 select * into v_stay from public.hotel_accommodation_stays where id=p_stay for update;
 if v_stay.id is null or v_stay.status<>'checked_in' then raise exception 'Stay is not active'; end if;
 select coalesce(sum(amount_kes),0) into v_paid from public.hotel_accommodation_payments where stay_id=p_stay;
 if p_amount is null or p_amount<=0 or v_paid+p_amount>v_stay.total_kes then raise exception 'Payment exceeds outstanding balance'; end if;
 insert into public.hotel_accommodation_payments(stay_id,amount_kes,method,reference,received_by)
 values(p_stay,p_amount,p_method,p_reference,auth.uid());
end;
$$;

-- Keep the departure and housekeeping handoff in one database transaction.
create or replace function public.hotel_accommodation_checkout(p_stay uuid)
returns void language plpgsql security definer set search_path='' as $$
declare v_room uuid;
begin
 if not public.hotel_accommodation_can_reception() then raise exception 'Reception access required'; end if;
 select room_id into v_room from public.hotel_accommodation_stays
  where id=p_stay and status='checked_in' for update;
 if v_room is null then raise exception 'Guest is not currently checked in'; end if;
 update public.hotel_accommodation_stays set status='checked_out',actual_check_out_date=(now() at time zone 'Africa/Nairobi')::date,
  checked_out_by=auth.uid() where id=p_stay;
 update public.hotel_accommodation_rooms set housekeeping_status='dirty',updated_at=now() where id=v_room;
end;
$$;
revoke all on function public.hotel_accommodation_checkin(uuid,jsonb,date,date,numeric,text,text) from public,anon;
revoke all on function public.hotel_accommodation_record_payment(uuid,numeric,text,text) from public,anon;
revoke all on function public.hotel_accommodation_checkout(uuid) from public,anon;
grant execute on function public.hotel_accommodation_checkin(uuid,jsonb,date,date,numeric,text,text) to authenticated;
grant execute on function public.hotel_accommodation_record_payment(uuid,numeric,text,text) to authenticated;
grant execute on function public.hotel_accommodation_checkout(uuid) to authenticated;
