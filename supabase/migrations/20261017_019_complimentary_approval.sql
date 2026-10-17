create table public.hotel_complimentary_requests(
 id uuid primary key default gen_random_uuid(),bill_id uuid not null references public.hotel_bills(id),
 requested_by uuid not null references public.staff_profiles(user_id),reason text not null check(length(trim(reason)) between 10 and 1000),
 status text not null default 'pending' check(status in ('pending','approved','rejected')),
 requested_at timestamptz not null default now(),reviewed_by uuid references public.staff_profiles(user_id),reviewed_at timestamptz,review_note text);
create unique index hotel_complimentary_pending_bill on public.hotel_complimentary_requests(bill_id) where status='pending';
alter table public.hotel_complimentary_requests enable row level security;
create or replace function public.hotel_request_complimentary(p_bill uuid,p_reason text)
returns uuid language plpgsql security definer set search_path='' as $f$
declare b public.hotel_bills%rowtype;v_id uuid;
begin
 select * into b from public.hotel_bills where id=p_bill for update;
 if not found or b.status<>'open' or b.cancellation_status='pending' then raise exception 'Bill not eligible';end if;
 if length(trim(coalesce(p_reason,'')))<10 then raise exception 'Reason must be at least 10 characters';end if;
 if not exists(select 1 from public.staff_profiles s join public.staff_roles r on r.user_id=s.user_id and r.active and r.role='cashier' where s.user_id=auth.uid() and s.active and r.department_id=(select id from public.departments where code='HOTEL')) then raise exception 'Hotel cashier only';end if;
 if exists(select 1 from public.hotel_orders o where o.bill_id=p_bill and o.payment_status<>'unpaid') then raise exception 'Bill already has paid orders';end if;
 if not exists(select 1 from public.hotel_orders o join public.cashier_assignments a on a.counter_id=o.counter_id and a.cashier_id=auth.uid() and a.ends_at is null where o.bill_id=p_bill and o.status<>'cancelled') then raise exception 'Cashier not assigned';end if;
 if exists(select 1 from public.hotel_orders o where o.bill_id=p_bill and o.status<>'cancelled' and not exists(select 1 from public.cashier_assignments a where a.counter_id=o.counter_id and a.cashier_id=auth.uid() and a.ends_at is null)) then raise exception 'Cashier not assigned to all counters';end if;
 if exists(select 1 from public.hotel_complimentary_requests where bill_id=p_bill and status='pending') then raise exception 'Pending complimentary already exists';end if;
 insert into public.hotel_complimentary_requests(bill_id,requested_by,reason) values(p_bill,auth.uid(),trim(p_reason)) returning id into v_id;
 return v_id;
end $f$;
create or replace function public.hotel_complimentary_queue()
returns jsonb language plpgsql stable security definer set search_path='' as $f$
declare v_manager boolean;v_cashier boolean;v_result jsonb;
begin
 select exists(select 1 from public.staff_profiles s join public.staff_roles r on r.user_id=s.user_id and r.active where s.user_id=auth.uid() and s.active and (r.role in ('director_admin','central_manager') or (r.role='department_manager' and r.department_id=(select id from public.departments where code='HOTEL')))) into v_manager;
 select exists(select 1 from public.staff_profiles s join public.staff_roles r on r.user_id=s.user_id and r.active and r.role='cashier' where s.user_id=auth.uid() and s.active and r.department_id=(select id from public.departments where code='HOTEL')) into v_cashier;
 if not v_manager and not v_cashier then raise exception 'Access denied';end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'bill_id',c.bill_id,'reason',c.reason,'status',c.status,'requested_at',c.requested_at,'reviewed_at',c.reviewed_at,'review_note',c.review_note,'table_label',b.table_label,'total',(select sum(o.total) from public.hotel_orders o where o.bill_id=b.id and o.status<>'cancelled')) order by c.requested_at desc),'[]'::jsonb) into v_result
 from public.hotel_complimentary_requests c join public.hotel_bills b on b.id=c.bill_id where v_manager or c.requested_by=auth.uid();
 return v_result;
end $f$;
create or replace function public.hotel_review_complimentary(p_request uuid,p_approve boolean,p_note text default null)
returns void language plpgsql security definer set search_path='' as $f$
declare c public.hotel_complimentary_requests%rowtype;b public.hotel_bills%rowtype;
begin
 if not exists(select 1 from public.staff_profiles s join public.staff_roles r on r.user_id=s.user_id and r.active where s.user_id=auth.uid() and s.active and (r.role in ('director_admin','central_manager') or (r.role='department_manager' and r.department_id=(select id from public.departments where code='HOTEL')))) then raise exception 'Manager/Director/Admin required';end if;
 select * into c from public.hotel_complimentary_requests where id=p_request for update;
 if not found or c.status<>'pending' or c.requested_by=auth.uid() then raise exception 'Request invalid or self-approval prohibited';end if;
 select * into b from public.hotel_bills where id=c.bill_id for update;
 if b.status<>'open' or b.cancellation_status='pending' then raise exception 'Bill no longer eligible';end if;
 if exists(select 1 from public.hotel_orders where bill_id=b.id and payment_status<>'unpaid') then raise exception 'Paid bill cannot be complimentary';end if;
 if p_approve then
 update public.hotel_orders set payment_status='paid',paid_at=now(),paid_by=auth.uid(),payment_method='complimentary',payment_reference=c.id::text where bill_id=b.id and status<>'cancelled';
 update public.hotel_bills set status='paid',closed_at=now(),paid_by=auth.uid(),payment_method='complimentary',payment_reference=c.id::text where id=b.id;
 end if;
 update public.hotel_complimentary_requests set status=case when p_approve then 'approved' else 'rejected' end,reviewed_by=auth.uid(),reviewed_at=now(),review_note=nullif(trim(coalesce(p_note,'')),'') where id=c.id;
end $f$;
revoke all on function public.hotel_request_complimentary(uuid,text),public.hotel_complimentary_queue(),public.hotel_review_complimentary(uuid,boolean,text) from public,anon;
grant execute on function public.hotel_request_complimentary(uuid,text),public.hotel_complimentary_queue(),public.hotel_review_complimentary(uuid,boolean,text) to authenticated;