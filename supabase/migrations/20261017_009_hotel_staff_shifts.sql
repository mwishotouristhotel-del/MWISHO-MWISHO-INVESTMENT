create or replace function public.hotel_assign_existing_staff(p_user uuid,p_name text,p_role text)
returns void language plpgsql security definer set search_path='' as $fn$
declare v_hotel uuid;
begin
 select id into v_hotel from public.departments where code='HOTEL';
 if not exists(select 1 from public.staff_profiles p join public.staff_roles r on r.user_id=p.user_id where p.user_id=auth.uid() and p.active and r.active and (r.role in ('director_admin','central_manager') or (r.department_id=v_hotel and r.role='department_manager'))) then raise exception 'Manager authorization required';end if;
 if p_role not in ('cashier','waiter','head_waiter','kitchen_staff','bar_staff','supervisor') or length(trim(coalesce(p_name,''))) not between 2 and 100 then raise exception 'Invalid staff name or role';end if;
 if not exists(select 1 from auth.users where id=p_user) then raise exception 'User must first be created in Supabase Auth';end if;
 insert into public.staff_profiles(user_id,display_name,active) values(p_user,trim(p_name),true) on conflict(user_id) do update set display_name=excluded.display_name,active=true;
 insert into public.staff_roles(user_id,department_id,role,active) values(p_user,v_hotel,p_role,true)
 on conflict do nothing;
 update public.staff_roles set active=true where user_id=p_user and department_id=v_hotel and role=p_role;
end $fn$;
revoke all on function public.hotel_assign_existing_staff(uuid,text,text) from public,anon;
grant execute on function public.hotel_assign_existing_staff(uuid,text,text) to authenticated;
create or replace function public.hotel_open_cashier_shift(p_assignment uuid,p_float numeric)
returns uuid language plpgsql security definer set search_path='' as $fn$
declare v_shift uuid;
begin
 if p_float is null or p_float<0 then raise exception 'Invalid opening float';end if;
 if not exists(select 1 from public.cashier_assignments a join public.staff_profiles p on p.user_id=a.cashier_id join public.staff_roles r on r.user_id=p.user_id
 join public.counters c on c.id=a.counter_id join public.departments d on d.id=c.department_id
 where a.id=p_assignment and a.ends_at is null and a.cashier_id=auth.uid() and p.active and r.active and r.role='cashier' and r.department_id=d.id and d.code='HOTEL') then raise exception 'Active cashier assignment required';end if;
 insert into public.cashier_shifts(assignment_id,opening_float) values(p_assignment,p_float) returning id into v_shift;
 return v_shift;
end $fn$;
revoke all on function public.hotel_open_cashier_shift(uuid,numeric) from public,anon;
grant execute on function public.hotel_open_cashier_shift(uuid,numeric) to authenticated;
create or replace function public.hotel_my_cashier_shifts()
returns table(assignment_id uuid,shift_id uuid,counter_name text,opened_at timestamptz,opening_float numeric,closed_at timestamptz)
language sql stable security definer set search_path='' as $fn$
 select a.id,s.id,c.name,s.opened_at,s.opening_float,s.closed_at
 from public.cashier_assignments a join public.counters c on c.id=a.counter_id join public.departments d on d.id=c.department_id
 left join lateral (select x.* from public.cashier_shifts x where x.assignment_id=a.id order by x.opened_at desc limit 1) s on true
 where a.cashier_id=auth.uid() and a.ends_at is null and d.code='HOTEL'
 and exists(select 1 from public.staff_profiles p join public.staff_roles r on r.user_id=p.user_id where p.user_id=auth.uid() and p.active and r.active and r.role='cashier' and r.department_id=d.id);
$fn$;
revoke all on function public.hotel_my_cashier_shifts() from public,anon;
grant execute on function public.hotel_my_cashier_shifts() to authenticated;