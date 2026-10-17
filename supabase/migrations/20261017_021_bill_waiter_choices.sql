create or replace function public.hotel_bill_waiter_choices(p_bill uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $f$
declare v_result jsonb;
begin
 if not exists(select 1 from public.staff_profiles s join public.staff_roles r on r.user_id=s.user_id and r.active and r.role='cashier' where s.user_id=auth.uid() and s.active and r.department_id=(select id from public.departments where code='HOTEL')) then raise exception 'Cashier only';end if;
 if exists(select 1 from public.hotel_orders o where o.bill_id=p_bill and o.status<>'cancelled' and not exists(select 1 from public.cashier_assignments a where a.counter_id=o.counter_id and a.cashier_id=auth.uid() and a.ends_at is null)) then raise exception 'Counter assignment required';end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',q.waiter_id,'name',q.display_name)),'[]'::jsonb) into v_result from
 (select distinct o.waiter_id,s.display_name from public.hotel_orders o join public.staff_profiles s on s.user_id=o.waiter_id where o.bill_id=p_bill and o.status<>'cancelled') q;
 return v_result;
end $f$;
revoke all on function public.hotel_bill_waiter_choices(uuid) from public,anon;
grant execute on function public.hotel_bill_waiter_choices(uuid) to authenticated;