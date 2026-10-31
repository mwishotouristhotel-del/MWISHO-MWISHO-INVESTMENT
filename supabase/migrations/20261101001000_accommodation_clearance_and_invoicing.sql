-- Accommodation bill clearance: cash/card, approved complimentary and accountable invoices.
-- Existing stays/payments remain unchanged. An invoice is a receivable, not a payment.
alter table public.hotel_accommodation_payments drop constraint if exists hotel_accommodation_payments_method_check;
alter table public.hotel_accommodation_payments add constraint hotel_accommodation_payments_method_check
 check (method in ('cash','mpesa','bank','other','card','complimentary'));

create table if not exists public.hotel_accommodation_complimentary_requests (
 id uuid primary key default gen_random_uuid(),
 stay_id uuid not null references public.hotel_accommodation_stays(id),
 amount_kes numeric(12,2) not null check(amount_kes>0),
 reason text not null check(length(trim(reason)) between 5 and 500),
 status text not null default 'pending' check(status in ('pending','approved','rejected')),
 requested_by uuid not null references auth.users(id),
 reviewed_by uuid references auth.users(id),
 reviewed_at timestamptz,
 created_at timestamptz not null default now(),
 unique(stay_id,status) deferrable initially immediate
);
-- A stay can have further requests after one is rejected or approved; only pending is unique.
alter table public.hotel_accommodation_complimentary_requests drop constraint if exists hotel_accommodation_complimentary_requests_stay_id_status_key;
create unique index if not exists hotel_one_pending_complimentary_per_stay
 on public.hotel_accommodation_complimentary_requests(stay_id) where status='pending';

create table if not exists public.hotel_accommodation_invoices (
 id uuid primary key default gen_random_uuid(),
 invoice_number text not null unique default ('MTH-AC-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,12))),
 organization_name text not null check(length(trim(organization_name)) between 2 and 180),
 organization_address text,
 kra_pin text,
 payment_terms text not null default 'Due on receipt',
 invoice_date date not null default (now() at time zone 'Africa/Nairobi')::date,
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now()
);
create table if not exists public.hotel_accommodation_invoice_items (
 id uuid primary key default gen_random_uuid(),
 invoice_id uuid not null references public.hotel_accommodation_invoices(id),
 stay_id uuid not null unique references public.hotel_accommodation_stays(id),
 amount_kes numeric(12,2) not null check(amount_kes>0)
);

alter table public.hotel_accommodation_complimentary_requests enable row level security;
alter table public.hotel_accommodation_invoices enable row level security;
alter table public.hotel_accommodation_invoice_items enable row level security;
revoke all on public.hotel_accommodation_complimentary_requests,public.hotel_accommodation_invoices,public.hotel_accommodation_invoice_items from anon,authenticated;
grant select on public.hotel_accommodation_complimentary_requests,public.hotel_accommodation_invoices,public.hotel_accommodation_invoice_items to authenticated;

create policy accommodation_complimentary_read on public.hotel_accommodation_complimentary_requests
 for select to authenticated using (public.hotel_accommodation_can_manage_all() or
 exists(select 1 from public.hotel_accommodation_stays s join public.hotel_accommodation_rooms r on r.id=s.room_id
 where s.id=stay_id and r.category=public.hotel_accommodation_reception_section()));
create policy accommodation_invoice_read on public.hotel_accommodation_invoices
 for select to authenticated using (public.hotel_accommodation_can_manage_all() or
 exists(select 1 from public.hotel_accommodation_invoice_items i join public.hotel_accommodation_stays s on s.id=i.stay_id
 join public.hotel_accommodation_rooms r on r.id=s.room_id where i.invoice_id=hotel_accommodation_invoices.id
 and r.category=public.hotel_accommodation_reception_section()));
create policy accommodation_invoice_items_read on public.hotel_accommodation_invoice_items
 for select to authenticated using (public.hotel_accommodation_can_manage_all() or
 exists(select 1 from public.hotel_accommodation_stays s join public.hotel_accommodation_rooms r on r.id=s.room_id
 where s.id=stay_id and r.category=public.hotel_accommodation_reception_section()));

-- Re-validate section for every privileged operation: SECURITY DEFINER does not inherit RLS.
create or replace function public.hotel_accommodation_assert_stay_scope(p_stay uuid)
returns public.hotel_accommodation_stays language plpgsql stable security definer set search_path='' as $$
declare v_stay public.hotel_accommodation_stays;v_category text;
begin
 if auth.uid() is null or not public.hotel_accommodation_can_reception() then raise exception 'Reception access required'; end if;
 select s,r.category into v_stay,v_category from public.hotel_accommodation_stays s
 join public.hotel_accommodation_rooms r on r.id=s.room_id where s.id=p_stay;
 if v_stay.id is null or (not public.hotel_accommodation_can_manage_all()
  and v_category is distinct from public.hotel_accommodation_reception_section()) then
  raise exception 'Stay is not accessible to this reception';
 end if;
 return v_stay;
end;$$;

create or replace function public.hotel_accommodation_request_complimentary(p_stay uuid,p_amount numeric,p_reason text)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_stay public.hotel_accommodation_stays;v_paid numeric;v_id uuid;
begin
 v_stay:=public.hotel_accommodation_assert_stay_scope(p_stay);
 if v_stay.status<>'checked_in' then raise exception 'Stay must be active'; end if;
 select coalesce(sum(amount_kes),0) into v_paid from public.hotel_accommodation_payments where stay_id=p_stay;
 if p_amount is null or p_amount<=0 or p_amount>v_stay.total_kes-v_paid then raise exception 'Invalid complimentary amount'; end if;
 insert into public.hotel_accommodation_complimentary_requests(stay_id,amount_kes,reason,requested_by)
 values(p_stay,p_amount,trim(p_reason),auth.uid()) returning id into v_id;
 return v_id;
end;$$;

create or replace function public.hotel_accommodation_guard_complimentary_payment()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_request public.hotel_accommodation_complimentary_requests;
begin
 if new.method<>'complimentary' then return new; end if;
 if not public.hotel_accommodation_can_manage_all()
  or new.reference !~* '^Approved complimentary [0-9a-f-]{36}$' then
  raise exception 'Complimentary payment requires management approval'; end if;
 select * into v_request from public.hotel_accommodation_complimentary_requests
 where id=substring(new.reference from 24)::uuid for update;
 if v_request.id is null or v_request.status<>'pending' or v_request.stay_id<>new.stay_id
  or v_request.amount_kes<>new.amount_kes or v_request.requested_by=auth.uid() then
  raise exception 'No valid pending complimentary approval'; end if;
 return new;
end;$$;
drop trigger if exists hotel_complimentary_payment_guard on public.hotel_accommodation_payments;
create trigger hotel_complimentary_payment_guard before insert on public.hotel_accommodation_payments
 for each row execute function public.hotel_accommodation_guard_complimentary_payment();

create or replace function public.hotel_accommodation_review_complimentary(p_request uuid,p_approve boolean)
returns void language plpgsql security definer set search_path='' as $$
declare v_request public.hotel_accommodation_complimentary_requests;v_stay public.hotel_accommodation_stays;v_paid numeric;
begin
 if auth.uid() is null or not public.hotel_accommodation_can_manage_all() then raise exception 'Management approval required'; end if;
 select * into v_request from public.hotel_accommodation_complimentary_requests where id=p_request for update;
 if v_request.id is null or v_request.status<>'pending' then raise exception 'Request is not pending'; end if;
 if v_request.requested_by=auth.uid() then raise exception 'A requester cannot approve their own complimentary clearance'; end if;
 select * into v_stay from public.hotel_accommodation_stays where id=v_request.stay_id for update;
 if p_approve then
  if v_stay.status<>'checked_in' then raise exception 'Stay is no longer active'; end if;
  select coalesce(sum(amount_kes),0) into v_paid from public.hotel_accommodation_payments where stay_id=v_stay.id;
  if v_request.amount_kes>v_stay.total_kes-v_paid then raise exception 'Outstanding balance changed'; end if;
  insert into public.hotel_accommodation_payments(stay_id,amount_kes,method,reference,received_by)
  values(v_stay.id,v_request.amount_kes,'complimentary','Approved complimentary '||p_request::text,auth.uid());
 end if;
 update public.hotel_accommodation_complimentary_requests
 set status=case when p_approve then 'approved' else 'rejected' end,reviewed_by=auth.uid(),reviewed_at=now()
 where id=p_request;
end;$$;

-- Never allow a receptionist to forge a complimentary payment through the generic RPC.
create or replace function public.hotel_accommodation_record_payment(
 p_stay uuid,p_amount numeric,p_method text,p_reference text default null
) returns void language plpgsql security definer set search_path='' as $$
declare v_stay public.hotel_accommodation_stays;v_paid numeric;
begin
 v_stay:=public.hotel_accommodation_assert_stay_scope(p_stay);
 if v_stay.status<>'checked_in' then raise exception 'Stay is not active'; end if;
 if p_method not in ('cash','mpesa','card','bank','other') or p_method is null then
  raise exception 'Use the approval or invoice workflow for this method'; end if;
 if p_method in ('mpesa','card') and length(trim(coalesce(p_reference,'')))<5 then
  raise exception 'A payment reference is required'; end if;
 select coalesce(sum(amount_kes),0) into v_paid from public.hotel_accommodation_payments where stay_id=p_stay;
 if p_amount is null or p_amount<=0 or v_paid+p_amount>v_stay.total_kes then raise exception 'Payment exceeds outstanding balance'; end if;
 insert into public.hotel_accommodation_payments(stay_id,amount_kes,method,reference,received_by)
 values(p_stay,p_amount,p_method,nullif(trim(p_reference),''),auth.uid());
end;$$;

-- Multiple checked-out rooms may be grouped in a single invoice; each room may be invoiced once.
-- A receptionist may combine only rooms in their own section; management may combine sections.
create or replace function public.hotel_accommodation_create_invoice(
 p_organization text,p_address text,p_kra_pin text,p_terms text,p_stays uuid[]
) returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;v_stay uuid;v_data public.hotel_accommodation_stays;v_paid numeric;v_count integer:=0;
begin
 if auth.uid() is null or not public.hotel_accommodation_can_reception() then raise exception 'Reception access required'; end if;
 if length(trim(coalesce(p_organization,'')))<2 or coalesce(array_length(p_stays,1),0)<1
  or coalesce(array_length(p_stays,1),0)>30 then raise exception 'Organization and 1-30 rooms are required'; end if;
 if (select count(distinct x) from unnest(p_stays) x)<>array_length(p_stays,1) then raise exception 'Duplicate room selection'; end if;
 -- Lock stays in stable order to avoid double invoicing.
 perform 1 from public.hotel_accommodation_stays where id=any(p_stays) order by id for update;
 insert into public.hotel_accommodation_invoices(organization_name,organization_address,kra_pin,payment_terms,created_by)
 values(trim(p_organization),nullif(trim(p_address),''),nullif(trim(p_kra_pin),''),
 coalesce(nullif(trim(p_terms),''),'Due on receipt'),auth.uid()) returning id into v_id;
 foreach v_stay in array p_stays loop
  v_data:=public.hotel_accommodation_assert_stay_scope(v_stay);
  if v_data.status<>'checked_out' then raise exception 'Only checked-out rooms can be invoiced'; end if;
  select coalesce(sum(amount_kes),0) into v_paid from public.hotel_accommodation_payments where stay_id=v_stay;
  if v_data.total_kes-v_paid<=0 then raise exception 'Room has no outstanding amount to invoice'; end if;
  insert into public.hotel_accommodation_invoice_items(invoice_id,stay_id,amount_kes)
  values(v_id,v_stay,v_data.total_kes-v_paid);
  v_count:=v_count+1;
 end loop;
 if v_count<>array_length(p_stays,1) then raise exception 'Invoice selection incomplete'; end if;
 return v_id;
end;$$;

revoke all on function public.hotel_accommodation_assert_stay_scope(uuid) from public,anon;
revoke all on function public.hotel_accommodation_guard_complimentary_payment() from public,anon,authenticated;
revoke all on function public.hotel_accommodation_request_complimentary(uuid,numeric,text) from public,anon;
revoke all on function public.hotel_accommodation_review_complimentary(uuid,boolean) from public,anon;
revoke all on function public.hotel_accommodation_create_invoice(text,text,text,text,uuid[]) from public,anon;
grant execute on function public.hotel_accommodation_request_complimentary(uuid,numeric,text) to authenticated;
grant execute on function public.hotel_accommodation_review_complimentary(uuid,boolean) to authenticated;
grant execute on function public.hotel_accommodation_create_invoice(text,text,text,text,uuid[]) to authenticated;

-- A complimentary approval clears a balance but does not bring cash into the hotel.
create or replace function public.hotel_accommodation_section_sales(p_start date,p_end date)
returns table(section text,stay_count bigint,charged_kes numeric,paid_kes numeric,balance_kes numeric)
language plpgsql stable security definer set search_path='' as $$
begin
 if not public.hotel_accommodation_can_reception() then raise exception 'Reception access required'; end if;
 if p_start is null or p_end is null or p_end<p_start or p_end>p_start+366 then
  raise exception 'Invalid report date range'; end if;
 return query
 with scoped as (
  select r.category,s.id,s.total_kes from public.hotel_accommodation_stays s
  join public.hotel_accommodation_rooms r on r.id=s.room_id
  where s.check_in_date between p_start and p_end
   and (public.hotel_accommodation_can_manage_all()
     or r.category=public.hotel_accommodation_reception_section())
 ), receipts as (
  select x.id,coalesce(sum(p.amount_kes),0) cleared,
   coalesce(sum(p.amount_kes) filter(where p.method<>'complimentary'),0) received
  from scoped x left join public.hotel_accommodation_payments p on p.stay_id=x.id group by x.id
 )
 select x.category,count(*)::bigint,coalesce(sum(x.total_kes),0),
  coalesce(sum(y.received),0),coalesce(sum(greatest(0,x.total_kes-y.cleared)),0)
 from scoped x join receipts y on y.id=x.id group by x.category order by x.category;
end;$$;
