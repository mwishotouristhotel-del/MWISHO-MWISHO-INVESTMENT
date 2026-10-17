create or replace function public.hotel_prevent_new_order_during_cancel()
returns trigger language plpgsql set search_path='' as $fn$
begin
 if exists(select 1 from public.hotel_bills where id=new.bill_id and cancellation_status='pending') then raise exception 'Cannot add order while cancellation awaits verification';end if;
 return new;
end $fn$;
create trigger hotel_no_new_order_during_cancel before insert on public.hotel_orders for each row execute function public.hotel_prevent_new_order_during_cancel();
create or replace function public.hotel_pending_bill_cancellations()
returns table(request_id uuid,bill_id uuid,table_label text,total numeric,reason text,cashier_name text,requested_at timestamptz,items jsonb)
language sql stable security definer set search_path='' as $fn$
 select req.id,b.id,b.table_label,
 (select coalesce(sum(o.total),0) from public.hotel_orders o where o.bill_id=b.id and o.status<>'cancelled'),
 req.reason,requester.display_name,req.requested_at,
 (select coalesce(jsonb_agg(jsonb_build_object('order',o.order_number,'item',p.name,'quantity',i.quantity,'amount',i.quantity*i.unit_price)),'[]'::jsonb)
 from public.hotel_orders o join public.hotel_order_items i on i.order_id=o.id join public.products p on p.id=i.product_id where o.bill_id=b.id and o.status<>'cancelled')
 from public.hotel_bill_cancellations req join public.hotel_bills b on b.id=req.bill_id
 join public.staff_profiles requester on requester.user_id=req.requested_by
 where req.status='pending' and exists(select 1 from public.staff_profiles me join public.staff_roles r on r.user_id=me.user_id and r.active
 left join public.departments d on d.id=r.department_id
 where me.user_id=auth.uid() and me.active and (r.role in ('director_admin','central_manager') or (d.code='HOTEL' and r.role in ('supervisor','department_manager'))))
 order by req.requested_at;
$fn$;
revoke all on function public.hotel_pending_bill_cancellations() from public,anon;
grant execute on function public.hotel_pending_bill_cancellations() to authenticated;