-- Split accommodation reception by operating section. Existing stay/payment data is untouched.
insert into public.mwisho_hotel_named_areas(name,kind,active)
select v.name,'reception',true from (values ('VVIP Reception'),('Regular Reception')) v(name)
where not exists(select 1 from public.mwisho_hotel_named_areas a where a.name=v.name and a.kind='reception');

create or replace function public.hotel_accommodation_can_manage_all()
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.staff_roles r
 join public.staff_profiles p on p.user_id=r.user_id
 left join public.departments d on d.id=r.department_id
 where r.user_id=(select auth.uid()) and r.active and p.active
 and (r.role in ('director_admin','central_manager','accounts')
      or (d.code='HOTEL' and r.role in ('department_manager','supervisor'))));
$$;

-- A receptionist must have exactly ONE named work area, and it must be a reception section.
-- Generic Reception or multiple assignments grant no guest/payment access.
create or replace function public.hotel_accommodation_reception_section()
returns text language sql stable security definer set search_path='' as $$
 select case when count(*)=1 then
  case min(a.name) when 'VVIP Reception' then 'vvip' when 'Regular Reception' then 'regular' end
 end
 from public.mwisho_staff_work_areas wa
 join public.mwisho_hotel_named_areas a on a.id=wa.area_id and a.active
 where wa.staff_id=(select auth.uid())
 and exists(select 1 from public.staff_roles r join public.staff_profiles p on p.user_id=r.user_id
  join public.departments d on d.id=r.department_id
  where r.user_id=(select auth.uid()) and r.active and p.active and d.code='HOTEL' and r.role='receptionist')
 and not exists(select 1 from public.mwisho_staff_work_areas x where x.staff_id=wa.staff_id
  and not exists(select 1 from public.mwisho_hotel_named_areas y where y.id=x.area_id));
$$;

create or replace function public.hotel_accommodation_can_reception()
returns boolean language sql stable security definer set search_path='' as $$
 select public.hotel_accommodation_can_manage_all() or public.hotel_accommodation_reception_section() is not null;
$$;

-- Keep both the legacy and package check-in RPC signatures, but enforce authorization
-- on the resulting ledger insert, every payment, and checkout update.
create or replace function public.hotel_accommodation_section_guard()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_category text;
begin
 if public.hotel_accommodation_can_manage_all() then return new; end if;
 if tg_table_name='hotel_accommodation_rooms' then
  v_category:=new.category;
 elsif tg_table_name='hotel_accommodation_stays' then
  select r.category into v_category from public.hotel_accommodation_rooms r where r.id=new.room_id;
 else
  select r.category into v_category from public.hotel_accommodation_stays s
  join public.hotel_accommodation_rooms r on r.id=s.room_id where s.id=new.stay_id;
 end if;
 if v_category is null or public.hotel_accommodation_reception_section() is distinct from v_category then
  raise exception 'Reception is not assigned to this accommodation section';
 end if;
 return new;
end;
$$;
drop trigger if exists hotel_reception_room_insert_guard on public.hotel_accommodation_rooms;
create trigger hotel_reception_room_insert_guard before insert on public.hotel_accommodation_rooms
 for each row execute function public.hotel_accommodation_section_guard();
drop trigger if exists hotel_reception_stay_insert_guard on public.hotel_accommodation_stays;
create trigger hotel_reception_stay_insert_guard before insert on public.hotel_accommodation_stays
 for each row execute function public.hotel_accommodation_section_guard();
drop trigger if exists hotel_reception_stay_checkout_guard on public.hotel_accommodation_stays;
create trigger hotel_reception_stay_checkout_guard before update of status on public.hotel_accommodation_stays
 for each row execute function public.hotel_accommodation_section_guard();
drop trigger if exists hotel_reception_payment_insert_guard on public.hotel_accommodation_payments;
create trigger hotel_reception_payment_insert_guard before insert on public.hotel_accommodation_payments
 for each row execute function public.hotel_accommodation_section_guard();

drop policy if exists hotel_rooms_staff_read on public.hotel_accommodation_rooms;
create policy hotel_rooms_staff_read on public.hotel_accommodation_rooms for select to authenticated
 using ((select public.hotel_accommodation_can_manage_all())
 or category=(select public.hotel_accommodation_reception_section())
 or exists(select 1 from public.staff_roles sr join public.staff_profiles sp on sp.user_id=sr.user_id
  join public.departments d on d.id=sr.department_id where sr.user_id=(select auth.uid())
  and sr.active and sp.active and d.code='HOTEL' and sr.role='room_attendant'));
drop policy if exists hotel_stays_reception_read on public.hotel_accommodation_stays;
create policy hotel_stays_reception_read on public.hotel_accommodation_stays for select to authenticated
 using ((select public.hotel_accommodation_can_manage_all())
  or exists(select 1 from public.hotel_accommodation_rooms r where r.id=room_id
   and r.category=(select public.hotel_accommodation_reception_section())));
drop policy if exists hotel_payments_reception_read on public.hotel_accommodation_payments;
create policy hotel_payments_reception_read on public.hotel_accommodation_payments for select to authenticated
 using ((select public.hotel_accommodation_can_manage_all())
  or exists(select 1 from public.hotel_accommodation_stays s
   join public.hotel_accommodation_rooms r on r.id=s.room_id where s.id=stay_id
   and r.category=(select public.hotel_accommodation_reception_section())));
drop policy if exists hotel_room_listings_reception_read on public.hotel_website_room_listings;
create policy hotel_room_listings_reception_read on public.hotel_website_room_listings for select to authenticated
 using ((select public.hotel_accommodation_can_manage_all())
  or category=(select public.hotel_accommodation_reception_section()));

-- Fail closed for attempted dual-section assignment via the existing Admin workstation RPC.
-- Admin still uses that same RPC for non-reception staff.
create or replace function public.hotel_accommodation_guard_staff_area()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_name text;
begin
 if exists(select 1 from public.staff_roles r join public.departments d on d.id=r.department_id
  where r.user_id=new.staff_id and r.active and d.code='HOTEL' and r.role='receptionist') then
  select a.name into v_name from public.mwisho_hotel_named_areas a where a.id=new.area_id and a.active;
  if v_name not in ('VVIP Reception','Regular Reception') or v_name is null
   or exists(select 1 from public.mwisho_staff_work_areas x where x.staff_id=new.staff_id and x.area_id<>new.area_id) then
   raise exception 'A receptionist must be assigned exclusively to VVIP Reception or Regular Reception';
  end if;
 end if;
 return new;
end;
$$;
drop trigger if exists hotel_reception_staff_area_guard on public.mwisho_staff_work_areas;
create trigger hotel_reception_staff_area_guard before insert or update on public.mwisho_staff_work_areas
 for each row execute function public.hotel_accommodation_guard_staff_area();

create or replace function public.hotel_accommodation_section_sales(p_start date,p_end date)
returns table(section text,stay_count bigint,charged_kes numeric,paid_kes numeric,balance_kes numeric)
language plpgsql stable security definer set search_path='' as $$
begin
 if not public.hotel_accommodation_can_reception() then raise exception 'Reception access required'; end if;
 if p_start is null or p_end is null or p_end<p_start or p_end>p_start+366 then
  raise exception 'Invalid report date range'; end if;
 return query
 with scoped as (
  select r.category,s.id,s.total_kes from public.hotel_accommodation_stays s
  join public.hotel_accommodation_rooms r on r.id=s.room_id
  where s.check_in_date between p_start and p_end
   and (public.hotel_accommodation_can_manage_all()
     or r.category=public.hotel_accommodation_reception_section())
 ), receipts as (
  select x.id,coalesce(sum(p.amount_kes),0) amount from scoped x
  left join public.hotel_accommodation_payments p on p.stay_id=x.id group by x.id
 )
 select x.category,count(*)::bigint,coalesce(sum(x.total_kes),0),
  coalesce(sum(y.amount),0),coalesce(sum(greatest(0,x.total_kes-y.amount)),0)
 from scoped x join receipts y on y.id=x.id group by x.category order by x.category;
end;
$$;
revoke all on function public.hotel_accommodation_section_sales(date,date) from public,anon;
grant execute on function public.hotel_accommodation_section_sales(date,date) to authenticated;

revoke all on function public.hotel_accommodation_can_manage_all() from public,anon;
revoke all on function public.hotel_accommodation_reception_section() from public,anon;
revoke all on function public.hotel_accommodation_section_guard() from public,anon,authenticated;
revoke all on function public.hotel_accommodation_guard_staff_area() from public,anon,authenticated;
grant execute on function public.hotel_accommodation_can_manage_all() to authenticated;
grant execute on function public.hotel_accommodation_reception_section() to authenticated;
