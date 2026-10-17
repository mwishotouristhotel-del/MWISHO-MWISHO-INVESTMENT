alter table public.hotel_bills add column cancellation_status text not null default 'none' check(cancellation_status in ('none','pending','rejected','approved'));
create table public.hotel_bill_cancellations(
 id uuid primary key default gen_random_uuid(),
 bill_id uuid not null references public.hotel_bills(id),
 requested_by uuid not null references public.staff_profiles(user_id),
 reason text not null check(length(trim(reason)) between 10 and 500),
 requested_at timestamptz not null default now(),
 status text not null default 'pending' check(status in ('pending','approved','rejected')),
 reviewed_by uuid references public.staff_profiles(user_id),
 reviewed_at timestamptz,
 review_note text,
 check ((status='pending' and reviewed_by is null and reviewed_at is null) or (status<>'pending' and reviewed_by is not null and reviewed_at is not null))
);
create unique index hotel_one_pending_cancel_per_bill on public.hotel_bill_cancellations(bill_id) where status='pending';
alter table public.hotel_bill_cancellations enable row level security;
create or replace function public.hotel_request_bill_cancellation(p_bill uuid,p_reason text)
returns uuid language plpgsql security definer set search_path='' as $fn$
declare v_bill public.hotel_bills%rowtype;v_id uuid;
begin
 select * into v_bill from public.hotel_bills where id=p_bill for update;
 if not found or v_bill.status<>'open' or v_bill.cancellation_status='pending' then raise exception 'Bill is closed or already awaiting cancellation';end if;
 if length(trim(coalesce(p_reason,''))) not between 10 and 500 then raise exception 'Enter a cancellation reason (10-500 characters)';end if;
 if not exists(select 1 from public.hotel_orders where bill_id=p_bill and status<>'cancelled') then raise exception 'Bill has no active orders';end if;
 if exists(select 1 from public.hotel_orders o where o.bill_id=p_bill and o.status<>'cancelled' and
 (o.payment_status<>'unpaid' or not exists(select 1 from public.cashier_assignments a
 join public.staff_profiles s on s.user_id=a.cashier_id and s.active
 join public.staff_roles r on r.user_id=s.user_id and r.active and r.role='cashier' and r.department_id=(select department_id from public.counters where id=o.counter_id)
 where a.counter_id=o.counter_id and a.cashier_id=auth.uid() and a.ends_at is null)))
 then raise exception 'All orders must be unpaid and assigned to requesting cashier';end if;
 insert into public.hotel_bill_cancellations(bill_id,requested_by,reason) values(p_bill,auth.uid(),trim(p_reason)) returning id into v_id;
 update public.hotel_bills set cancellation_status='pending' where id=p_bill;
 return v_id;
end $fn$;
revoke all on function public.hotel_request_bill_cancellation(uuid,text) from public,anon;
grant execute on function public.hotel_request_bill_cancellation(uuid,text) to authenticated;
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
 join public.departments d on d.id=r.department_id
 where me.user_id=auth.uid() and me.active and (r.role in ('director_admin','central_manager') or (d.code='HOTEL' and r.role in ('supervisor','department_manager'))))
 order by req.requested_at;
$fn$;
revoke all on function public.hotel_pending_bill_cancellations() from public,anon;
grant execute on function public.hotel_pending_bill_cancellations() to authenticated;
create or replace function public.hotel_review_bill_cancellation(p_request uuid,p_approve boolean,p_note text)
returns void language plpgsql security definer set search_path='' as $fn$
declare v_request public.hotel_bill_cancellations%rowtype;v_hotel uuid;
begin
 select * into v_request from public.hotel_bill_cancellations where id=p_request for update;
 if not found or v_request.status<>'pending' then raise exception 'Cancellation request already reviewed';end if;
 select id into v_hotel from public.departments where code='HOTEL';
 if not exists(select 1 from public.staff_profiles me join public.staff_roles r on r.user_id=me.user_id and r.active where me.user_id=auth.uid() and me.active and
 (r.role in ('director_admin','central_manager') or (r.department_id=v_hotel and r.role in ('supervisor','department_manager'))))
 then raise exception 'Supervisor or manager authorization required';end if;
 if v_request.requested_by=auth.uid() then raise exception 'Requester cannot approve own cancellation';end if;
 perform 1 from public.hotel_bills where id=v_request.bill_id and status='open' and cancellation_status='pending' for update;
 if not found then raise exception 'Bill is no longer pending cancellation';end if;
 if p_approve and exists(select 1 from public.hotel_orders where bill_id=v_request.bill_id and payment_status='paid') then raise exception 'Paid bill cannot be cancelled';end if;
 update public.hotel_bill_cancellations set status=case when p_approve then 'approved' else 'rejected' end,reviewed_by=auth.uid(),reviewed_at=now(),review_note=nullif(trim(p_note),'') where id=p_request;
 update public.hotel_bills set cancellation_status=case when p_approve then 'approved' else 'rejected' end,
 status=case when p_approve then 'void' else 'open' end,closed_at=case when p_approve then now() else null end where id=v_request.bill_id;
 if p_approve then update public.hotel_orders set status='cancelled' where bill_id=v_request.bill_id and payment_status='unpaid';end if;
end $fn$;
revoke all on function public.hotel_review_bill_cancellation(uuid,boolean,text) from public,anon;
grant execute on function public.hotel_review_bill_cancellation(uuid,boolean,text) to authenticated;
create or replace function public.hotel_prevent_payment_during_cancel()
returns trigger language plpgsql set search_path='' as $fn$
begin
 if new.payment_status='paid' and old.payment_status='unpaid' and exists(select 1 from public.hotel_bills b where b.id=new.bill_id and b.cancellation_status='pending') then raise exception 'Bill pending cancellation verification';end if;
 return new;
end $fn$;
create trigger hotel_no_payment_during_cancel before update of payment_status on public.hotel_orders for each row execute function public.hotel_prevent_payment_during_cancel();