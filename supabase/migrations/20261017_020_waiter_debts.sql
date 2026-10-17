create table public.hotel_waiter_debts(
 id uuid primary key default gen_random_uuid(),bill_id uuid not null unique references public.hotel_bills(id),
 waiter_id uuid not null references public.staff_profiles(user_id),original_amount numeric(14,2) not null check(original_amount>0),
 outstanding numeric(14,2) not null check(outstanding>=0),created_by uuid not null references public.staff_profiles(user_id),
 created_at timestamptz not null default now(),status text not null default 'outstanding' check(status in ('outstanding','settled')),
 reason text not null check(length(trim(reason))>=5));
create table public.hotel_waiter_debt_payments(
 id uuid primary key default gen_random_uuid(),debt_id uuid not null references public.hotel_waiter_debts(id),
 amount numeric(14,2) not null check(amount>0),method text not null check(method in ('cash','mpesa')),
 reference text,received_by uuid not null references public.staff_profiles(user_id),paid_at timestamptz not null default now());
alter table public.hotel_waiter_debts enable row level security;
alter table public.hotel_waiter_debt_payments enable row level security;
create or replace function public.hotel_post_waiter_debt(p_bill uuid,p_waiter uuid,p_reason text)
returns uuid language plpgsql security definer set search_path='' as $f$
declare b public.hotel_bills%rowtype;v_total numeric;v_id uuid;
begin
 if not exists(select 1 from public.staff_profiles s join public.staff_roles r on r.user_id=s.user_id and r.active and r.role='cashier' where s.user_id=auth.uid() and s.active and r.department_id=(select id from public.departments where code='HOTEL')) then raise exception 'Cashier access required';end if;
 select * into b from public.hotel_bills where id=p_bill for update;
 if not found or b.status<>'open' or b.cancellation_status='pending' then raise exception 'Bill unavailable';end if;
 if length(trim(coalesce(p_reason,'')))<5 then raise exception 'Debt reason required';end if;
 if not exists(select 1 from public.staff_profiles s join public.staff_roles r on r.user_id=s.user_id and r.active and r.role in ('waiter','head_waiter') and r.department_id=(select id from public.departments where code='HOTEL') where s.user_id=p_waiter and s.active) then raise exception 'Select active Hotel waiter';end if;
 if exists(select 1 from public.hotel_orders o where o.bill_id=p_bill and o.status<>'cancelled' and (o.payment_status<>'unpaid' or not exists(select 1 from public.cashier_assignments a where a.counter_id=o.counter_id and a.cashier_id=auth.uid() and a.ends_at is null))) then raise exception 'Unpaid orders must be assigned to cashier';end if;
 if exists(select 1 from public.hotel_orders o where o.bill_id=p_bill and o.status<>'cancelled' and o.waiter_id<>p_waiter) then raise exception 'Bill has orders from multiple waiters; split bill before assigning debt';end if;
 select sum(total) into v_total from public.hotel_orders where bill_id=p_bill and status<>'cancelled';
 if v_total is null or v_total<=0 then raise exception 'Empty bill';end if;
 insert into public.hotel_waiter_debts(bill_id,waiter_id,original_amount,outstanding,created_by,reason)
 values(p_bill,p_waiter,v_total,v_total,auth.uid(),trim(p_reason)) returning id into v_id;
 update public.hotel_orders set payment_status='paid',paid_at=now(),paid_by=auth.uid(),payment_method='waiter_debt',payment_reference=v_id::text where bill_id=p_bill and status<>'cancelled';
 update public.hotel_bills set status='paid',closed_at=now(),paid_by=auth.uid(),payment_method='waiter_debt',payment_reference=v_id::text where id=p_bill;
 return v_id;
end $f$;
create or replace function public.hotel_repay_waiter_debt(p_debt uuid,p_amount numeric,p_method text,p_reference text default null)
returns numeric language plpgsql security definer set search_path='' as $f$
declare d public.hotel_waiter_debts%rowtype;
begin
 if not exists(select 1 from public.staff_profiles s join public.staff_roles r on r.user_id=s.user_id and r.active and r.role='cashier' where s.user_id=auth.uid() and s.active and r.department_id=(select id from public.departments where code='HOTEL')) then raise exception 'Cashier access required';end if;
 select * into d from public.hotel_waiter_debts where id=p_debt for update;
 if not found or d.status<>'outstanding' then raise exception 'Debt not outstanding';end if;
 if p_amount is null or p_amount<=0 or p_amount>d.outstanding then raise exception 'Invalid repayment amount';end if;
 if p_method not in ('cash','mpesa') then raise exception 'Choose cash or M-Pesa';end if;
 if p_method='mpesa' and trim(coalesce(p_reference,'')) !~ '^[A-Za-z0-9]{8,15}$' then raise exception 'M-Pesa reference required';end if;
 if p_method='mpesa' and (exists(select 1 from public.hotel_waiter_debt_payments where method='mpesa' and upper(reference)=upper(trim(p_reference))) or exists(select 1 from public.hotel_bills where payment_method='mpesa' and upper(payment_reference)=upper(trim(p_reference)))) then raise exception 'M-Pesa reference already used';end if;
 insert into public.hotel_waiter_debt_payments(debt_id,amount,method,reference,received_by) values(p_debt,p_amount,p_method,case when p_method='mpesa' then upper(trim(p_reference)) else null end,auth.uid());
 update public.hotel_waiter_debts set outstanding=outstanding-p_amount,status=case when outstanding-p_amount=0 then 'settled' else 'outstanding' end where id=p_debt;
 return d.outstanding-p_amount;
end $f$;
create unique index hotel_debt_unique_mpesa_reference on public.hotel_waiter_debt_payments(upper(reference)) where method='mpesa';
create or replace function public.hotel_waiter_debt_report(p_month date default null)
returns jsonb language plpgsql stable security definer set search_path='' as $f$
declare v_manager boolean;v_cashier boolean;v_result jsonb;
begin
 select exists(select 1 from public.staff_profiles s join public.staff_roles r on r.user_id=s.user_id and r.active where s.user_id=auth.uid() and s.active and (r.role in ('director_admin','central_manager','accounts') or (r.role='department_manager' and r.department_id=(select id from public.departments where code='HOTEL')))) into v_manager;
 select exists(select 1 from public.staff_profiles s join public.staff_roles r on r.user_id=s.user_id and r.active and r.role='cashier' where s.user_id=auth.uid() and s.active and r.department_id=(select id from public.departments where code='HOTEL')) into v_cashier;
 if not v_manager and not v_cashier then raise exception 'Access denied';end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',d.id,'waiter_id',d.waiter_id,'waiter',s.display_name,'bill_id',d.bill_id,'original_amount',d.original_amount,'outstanding',d.outstanding,'status',d.status,'created_at',d.created_at,'reason',d.reason,'repayments',(select coalesce(jsonb_agg(jsonb_build_object('amount',p.amount,'method',p.method,'paid_at',p.paid_at)),'[]'::jsonb) from public.hotel_waiter_debt_payments p where p.debt_id=d.id)) order by d.created_at desc),'[]'::jsonb) into v_result
 from public.hotel_waiter_debts d join public.staff_profiles s on s.user_id=d.waiter_id
 where (p_month is null or d.created_at < (date_trunc('month',p_month::timestamp)+interval '1 month') and (d.outstanding>0 or exists(select 1 from public.hotel_waiter_debt_payments p where p.debt_id=d.id and date_trunc('month',p.paid_at)=date_trunc('month',p_month::timestamp))));
 return v_result;
end $f$;
revoke all on function public.hotel_post_waiter_debt(uuid,uuid,text),public.hotel_repay_waiter_debt(uuid,numeric,text,text),public.hotel_waiter_debt_report(date) from public,anon;
grant execute on function public.hotel_post_waiter_debt(uuid,uuid,text),public.hotel_repay_waiter_debt(uuid,numeric,text,text),public.hotel_waiter_debt_report(date) to authenticated;