create or replace function public.hotel_manage_menu(p_id uuid,p_sku text,p_name text,p_price numeric,p_area text,p_options jsonb,p_active boolean default true)
returns uuid language plpgsql security definer set search_path='' as $fn$
declare v_dept uuid;v_id uuid;
begin
 select id into v_dept from public.departments where code='HOTEL';
 if not exists(select 1 from public.staff_profiles s join public.staff_roles r on r.user_id=s.user_id
 where s.user_id=auth.uid() and s.active and r.active and
 (r.role in ('director_admin','central_manager') or (r.department_id=v_dept and r.role='department_manager')))
 then raise exception 'Hotel manager authorization required';end if;
 if length(trim(coalesce(p_sku,''))) not between 1 and 40 or length(trim(coalesce(p_name,''))) not between 1 and 150
 or p_price is null or p_price<0 or p_area not in ('kitchen','bar')
 or jsonb_typeof(p_options) is distinct from 'array' or jsonb_array_length(p_options)>12
 or exists(select 1 from jsonb_array_elements(p_options) v where jsonb_typeof(v)<>'string' or length(trim(v #>> '{}')) not between 1 and 60)
 then raise exception 'Invalid menu item';end if;
 if p_id is null then
 insert into public.products(department_id,sku,name,price,preparation_area,preparation_options,active)
 values(v_dept,trim(p_sku),trim(p_name),p_price,p_area,p_options,p_active) returning id into v_id;
 else
 update public.products set sku=trim(p_sku),name=trim(p_name),price=p_price,preparation_area=p_area,
 preparation_options=p_options,active=p_active where id=p_id and department_id=v_dept returning id into v_id;
 if v_id is null then raise exception 'Hotel product not found';end if;
 end if;
 return v_id;
end $fn$;
revoke all on function public.hotel_manage_menu(uuid,text,text,numeric,text,jsonb,boolean) from public,anon;
grant execute on function public.hotel_manage_menu(uuid,text,text,numeric,text,jsonb,boolean) to authenticated;
create or replace function public.hotel_management_menu()
returns table(id uuid,sku text,name text,price numeric,preparation_area text,preparation_options jsonb,active boolean)
language sql stable security definer set search_path='' as $fn$
 select p.id,p.sku,p.name,p.price,p.preparation_area,p.preparation_options,p.active
 from public.products p join public.departments d on d.id=p.department_id
 where d.code='HOTEL' and exists(select 1 from public.staff_profiles s join public.staff_roles r on r.user_id=s.user_id
 where s.user_id=auth.uid() and s.active and r.active and
 (r.role in ('director_admin','central_manager') or (r.department_id=d.id and r.role='department_manager')))
 order by p.name;
$fn$;
revoke all on function public.hotel_management_menu() from public,anon;
grant execute on function public.hotel_management_menu() to authenticated;
create or replace function public.hotel_assign_cashier(p_counter uuid,p_cashier uuid)
returns void language plpgsql security definer set search_path='' as $fn$
declare v_department uuid;
begin
 select c.department_id into v_department from public.counters c join public.departments d on d.id=c.department_id
 where c.id=p_counter and c.active and d.code='HOTEL';
 if v_department is null then raise exception 'Hotel counter not found';end if;
 if not exists(select 1 from public.staff_profiles s join public.staff_roles r on r.user_id=s.user_id
 where s.user_id=auth.uid() and s.active and r.active and
 (r.role in ('director_admin','central_manager') or (r.department_id=v_department and r.role='department_manager')))
 then raise exception 'Manager authorization required';end if;
 if not exists(select 1 from public.staff_profiles s join public.staff_roles r on r.user_id=s.user_id
 where s.user_id=p_cashier and s.active and r.active and r.role='cashier' and r.department_id=v_department)
 then raise exception 'Cashier does not have active hotel cashier role';end if;
 perform pg_advisory_xact_lock(hashtext(p_counter::text));
 update public.cashier_assignments set ends_at=now() where counter_id=p_counter and ends_at is null and cashier_id<>p_cashier;
 if not exists(select 1 from public.cashier_assignments where counter_id=p_counter and cashier_id=p_cashier and ends_at is null) then
 insert into public.cashier_assignments(counter_id,cashier_id,assigned_by) values(p_counter,p_cashier,auth.uid());
 end if;
end $fn$;
revoke all on function public.hotel_assign_cashier(uuid,uuid) from public,anon;
grant execute on function public.hotel_assign_cashier(uuid,uuid) to authenticated;