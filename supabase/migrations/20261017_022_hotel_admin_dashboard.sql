create or replace function public.hotel_admin_dashboard()
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_start timestamptz;v_end timestamptz;v_result jsonb;
begin
 if auth.uid() is null or not exists(select 1 from public.staff_roles r where r.user_id=auth.uid() and r.active=true and r.role in ('director_admin','central_manager','department_manager','supervisor') and (r.role in ('director_admin','central_manager') or exists(select 1 from public.departments d where d.id=r.department_id and d.name='Hotel'))) then
 raise exception 'Manager authorization required' using errcode='42501';
 end if;
 v_start:=date_trunc('day',now() at time zone 'Africa/Nairobi') at time zone 'Africa/Nairobi';
 v_end:=v_start+interval '1 day';
 select jsonb_build_object(
 'sales_today',coalesce((select sum(o.total) from public.hotel_orders o where o.paid_at>=v_start and o.paid_at<v_end and o.payment_method in ('cash','mpesa')),0),
 'cash_today',coalesce((select sum(o.total) from public.hotel_orders o where o.paid_at>=v_start and o.paid_at<v_end and o.payment_method='cash'),0),
 'mpesa_today',coalesce((select sum(o.total) from public.hotel_orders o where o.paid_at>=v_start and o.paid_at<v_end and o.payment_method='mpesa'),0),
 'orders_today',(select count(*) from public.hotel_orders o where o.created_at>=v_start and o.created_at<v_end),
 'paid_bills_today',(select count(*) from public.hotel_bills b where b.closed_at>=v_start and b.closed_at<v_end and b.status='paid' and b.payment_method in ('cash','mpesa')),
 'open_bills',(select count(*) from public.hotel_bills b where b.status='open'),
 'open_bill_value',coalesce((select sum(o.total) from public.hotel_orders o join public.hotel_bills b on b.id=o.bill_id where b.status='open'),0),
 'complimentary_today',coalesce((select sum(o.total) from public.hotel_orders o where o.paid_at>=v_start and o.paid_at<v_end and o.payment_method='complimentary'),0),
 'waiter_debts_outstanding',coalesce((select sum(d.outstanding) from public.hotel_waiter_debts d),0),
 'pending_invoices',(select count(*) from public.hotel_invoice_requests i where i.status='pending'),
 'pending_complimentary',(select count(*) from public.hotel_complimentary_requests c where c.status='pending'),
 'recent_orders',coalesce((select jsonb_agg(x) from (select o.order_number,o.table_label,o.total,o.status,o.payment_status,o.created_at from public.hotel_orders o order by o.created_at desc limit 8)x),'[]'::jsonb),
 'bookings_available',false
 ) into v_result;
 return v_result;
end $$;
revoke all on function public.hotel_admin_dashboard() from public,anon;
grant execute on function public.hotel_admin_dashboard() to authenticated;