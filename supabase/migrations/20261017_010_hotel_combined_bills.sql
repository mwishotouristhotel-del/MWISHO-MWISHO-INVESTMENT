create table public.hotel_bills(
 id uuid primary key default gen_random_uuid(),
 table_label text not null,
 table_key text not null,
 status text not null default 'open' check(status in ('open','paid','void')),
 created_at timestamptz not null default now(),
 closed_at timestamptz,
 paid_by uuid references public.staff_profiles(user_id),
 payment_method text,
 payment_reference text
);
create unique index hotel_one_open_bill_per_table on public.hotel_bills(table_key) where status='open';
alter table public.hotel_bills enable row level security;
alter table public.hotel_orders add column bill_id uuid references public.hotel_bills(id);
create index hotel_orders_bill on public.hotel_orders(bill_id);
create or replace function public.hotel_attach_open_bill()
returns trigger language plpgsql security definer set search_path='' as $fn$
declare v_key text;v_id uuid;
begin
 v_key:=lower(regexp_replace(trim(new.table_label),'\s+',' ','g'));
 perform pg_advisory_xact_lock(hashtext('hotel-bill:'||v_key));
 select id into v_id from public.hotel_bills where table_key=v_key and status='open' for update;
 if v_id is null then
 insert into public.hotel_bills(table_label,table_key) values(trim(new.table_label),v_key) returning id into v_id;
 end if;
 new.bill_id:=v_id;
 return new;
end $fn$;
create trigger hotel_attach_bill_before_order before insert on public.hotel_orders
for each row execute function public.hotel_attach_open_bill();
insert into public.hotel_bills(table_label,table_key,status,created_at)
select o.table_label,'legacy:'||o.id::text,'paid',o.created_at from public.hotel_orders o where o.bill_id is null;
update public.hotel_orders o set bill_id=b.id from public.hotel_bills b where b.table_key='legacy:'||o.id::text and o.bill_id is null;
create or replace function public.my_hotel_open_bills()
returns table(bill_id uuid,table_label text,orders_count bigint,total numeric,order_numbers text,waiters text)
language sql stable security definer set search_path='' as $fn$
 select b.id,b.table_label,count(o.id),sum(o.total),string_agg(o.order_number::text,', ' order by o.order_number),
 string_agg(distinct p.display_name,', ')
 from public.hotel_bills b join public.hotel_orders o on o.bill_id=b.id
 join public.counters c on c.id=o.counter_id
 join public.cashier_assignments a on a.counter_id=c.id and a.cashier_id=auth.uid() and a.ends_at is null
 join public.staff_profiles s on s.user_id=auth.uid() and s.active
 join public.staff_roles r on r.user_id=s.user_id and r.active and r.role='cashier' and r.department_id=c.department_id
 join public.staff_profiles p on p.user_id=o.waiter_id
 where b.status='open' and o.status<>'cancelled' and o.payment_status='unpaid'
 and not exists(select 1 from public.hotel_orders x where x.bill_id=b.id and x.status<>'cancelled' and x.payment_status='unpaid'
 and not exists(select 1 from public.cashier_assignments ax where ax.counter_id=x.counter_id and ax.cashier_id=auth.uid() and ax.ends_at is null))
 group by b.id,b.table_label order by min(b.created_at);
$fn$;
revoke all on function public.my_hotel_open_bills() from public,anon;
grant execute on function public.my_hotel_open_bills() to authenticated;
create or replace function public.hotel_clear_bill(p_bill uuid,p_method text,p_reference text)
returns jsonb language plpgsql security definer set search_path='' as $fn$
declare v_bill public.hotel_bills%rowtype;v_total numeric;v_receipt jsonb;
begin
 select * into v_bill from public.hotel_bills where id=p_bill for update;
 if not found or v_bill.status<>'open' then raise exception 'Bill already closed or not found';end if;
 if p_method not in ('cash','mpesa','card','bank') or (p_method<>'cash' and length(trim(coalesce(p_reference,'')))<3) then raise exception 'Invalid payment details';end if;
 if not exists(select 1 from public.hotel_orders where bill_id=p_bill and status<>'cancelled') then raise exception 'Empty bill';end if;
 if exists(select 1 from public.hotel_orders o where o.bill_id=p_bill and o.status<>'cancelled' and
 (o.payment_status<>'unpaid' or not exists(
 select 1 from public.cashier_assignments a join public.staff_profiles s on s.user_id=a.cashier_id
 join public.staff_roles r on r.user_id=s.user_id and r.active and r.role='cashier'
 where a.counter_id=o.counter_id and a.cashier_id=auth.uid() and a.ends_at is null and s.active
 and r.department_id=(select department_id from public.counters where id=o.counter_id))))
 then raise exception 'All bill orders must be unpaid and assigned to this cashier';end if;
 select sum(total) into v_total from public.hotel_orders where bill_id=p_bill and status<>'cancelled';
 update public.hotel_orders set payment_status='paid',paid_at=now(),paid_by=auth.uid(),payment_method=p_method,payment_reference=nullif(trim(p_reference),'') where bill_id=p_bill and status<>'cancelled';
 update public.hotel_bills set status='paid',closed_at=now(),paid_by=auth.uid(),payment_method=p_method,payment_reference=nullif(trim(p_reference),'') where id=p_bill;
 select jsonb_build_object('bill_id',b.id,'table_label',b.table_label,'total',v_total,'payment_method',b.payment_method,'paid_at',b.closed_at,'cashier',cashier.display_name,
 'items',(select coalesce(jsonb_agg(jsonb_build_object('order_number',o.order_number,'waiter',w.display_name,'item',p.name,'quantity',i.quantity,'unit_price',i.unit_price,'line_total',i.quantity*i.unit_price,'area',i.preparation_area) order by o.order_number,p.name),'[]'::jsonb)
 from public.hotel_orders o join public.hotel_order_items i on i.order_id=o.id join public.products p on p.id=i.product_id join public.staff_profiles w on w.user_id=o.waiter_id where o.bill_id=b.id and o.status<>'cancelled')) into v_receipt
 from public.hotel_bills b join public.staff_profiles cashier on cashier.user_id=b.paid_by where b.id=p_bill;
 return v_receipt;
end $fn$;
revoke all on function public.hotel_clear_bill(uuid,text,text) from public,anon;
grant execute on function public.hotel_clear_bill(uuid,text,text) to authenticated;