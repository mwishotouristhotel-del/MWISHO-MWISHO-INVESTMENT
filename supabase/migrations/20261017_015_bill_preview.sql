create or replace function public.hotel_bill_preview(p_bill uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $f$
declare result jsonb;
begin
 if not exists(select 1 from public.hotel_bills b where b.id=p_bill and b.status='open' and exists(
 select 1 from public.hotel_orders o join public.cashier_assignments a on a.counter_id=o.counter_id and a.cashier_id=auth.uid() and a.ends_at is null where o.bill_id=b.id))
 then raise exception 'Open bill unavailable';end if;
 if exists(select 1 from public.hotel_orders o where o.bill_id=p_bill and o.status<>'cancelled' and not exists(
 select 1 from public.cashier_assignments a where a.counter_id=o.counter_id and a.cashier_id=auth.uid() and a.ends_at is null))
 then raise exception 'Cashier must be assigned to all counters';end if;
 select jsonb_build_object('bill_id',b.id,'table_label',b.table_label,'total',sum(o.total),
 'items',(select coalesce(jsonb_agg(jsonb_build_object('order_number',x.order_number,'waiter',w.display_name,'item',p.name,'quantity',i.quantity,'line_total',i.quantity*i.unit_price,'area',i.preparation_area)),'[]'::jsonb)
 from public.hotel_orders x join public.hotel_order_items i on i.order_id=x.id join public.products p on p.id=i.product_id join public.staff_profiles w on w.user_id=x.waiter_id
 where x.bill_id=b.id and x.status<>'cancelled')) into result
 from public.hotel_bills b join public.hotel_orders o on o.bill_id=b.id and o.status<>'cancelled'
 where b.id=p_bill and b.status='open' group by b.id;
 return result;
end $f$;
revoke all on function public.hotel_bill_preview(uuid) from public,anon;
grant execute on function public.hotel_bill_preview(uuid) to authenticated;