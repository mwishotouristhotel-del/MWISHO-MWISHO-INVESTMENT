-- Authenticated staff-only POS access; no public roster or inventory reads.
create or replace function public.my_pos_access()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_profile public.staff_profiles%rowtype; v_roles jsonb; v_counters jsonb;
begin
 if v_uid is null then raise exception 'Authentication required' using errcode='28000'; end if;
 select * into v_profile from public.staff_profiles where user_id=v_uid and active=true;
 if not found then return jsonb_build_object('active',false,'roles','[]'::jsonb,'counters','[]'::jsonb); end if;
 select coalesce(jsonb_agg(jsonb_build_object('role',r.role,'department_id',r.department_id,'department',d.name)),'[]'::jsonb) into v_roles
 from public.staff_roles r left join public.departments d on d.id=r.department_id where r.user_id=v_uid and r.active=true;
 select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'type',c.counter_type,'department',d.name)),'[]'::jsonb) into v_counters
 from public.cashier_assignments ca join public.counters c on c.id=ca.counter_id join public.departments d on d.id=c.department_id
 where ca.cashier_id=v_uid and ca.ends_at is null and c.active=true;
 return jsonb_build_object('active',exists(select 1 from public.staff_roles where user_id=v_uid and active=true),'name',v_profile.display_name,'roles',v_roles,'counters',v_counters);
end $$;
revoke all on function public.my_pos_access() from public, anon;
grant execute on function public.my_pos_access() to authenticated;
-- Waiter counter listing is deliberately limited to the hotel bar/restaurant sections.
create or replace function public.my_waiter_counters()
returns table(id uuid,name text,counter_type text) language sql stable security definer set search_path='' as $$
 select c.id,c.name,c.counter_type from public.counters c join public.departments d on d.id=c.department_id
 where d.code='HOTEL' and c.active=true and c.counter_type in ('bar','restaurant')
 and auth.uid() is not null and exists(
 select 1 from public.staff_profiles p join public.staff_roles r on r.user_id=p.user_id
 where p.user_id=auth.uid() and p.active=true and r.active=true and
 (r.role in ('director_admin','central_manager') or
 (r.role in ('waiter','head_waiter','supervisor','department_manager') and r.department_id=d.id)))
 order by c.counter_type,c.name;
$$;
revoke all on function public.my_waiter_counters() from public,anon;
grant execute on function public.my_waiter_counters() to authenticated;