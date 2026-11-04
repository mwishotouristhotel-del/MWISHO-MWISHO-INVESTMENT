-- Manual quotation intake is separate from public website submissions.
create sequence if not exists public.hotel_walkin_quotation_number_seq;
create table if not exists public.hotel_walkin_quotations(
 id uuid primary key default gen_random_uuid(),
 reference text not null unique,
 organization_name text not null check(length(btrim(organization_name)) between 2 and 150),
 contact_person text not null check(length(btrim(contact_person)) between 2 and 120),
 contact_phone text not null default '',
 organization_email text not null default '',
 event_date date not null,
 event_start_time time,
 event_end_date date,
 event_end_time time,
 requirements text not null default '',
 items jsonb not null check(jsonb_typeof(items)='array'),
 vat_rate numeric(5,2) not null default 0 check(vat_rate between 0 and 100),
 total_kes numeric(14,2) not null check(total_kes>0),
 status text not null default 'prepared' check(status in ('prepared','approved','booked','cancelled')),
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.hotel_walkin_quotations enable row level security;
grant select on public.hotel_walkin_quotations to authenticated;
create policy walkin_quotes_admin_read on public.hotel_walkin_quotations for select to authenticated using(public.hotel_website_is_admin());

create or replace function public.hotel_walkin_quote_create(p_name text,p_contact text,p_phone text,p_email text,p_event_date date,p_start_time time,p_end_date date,p_end_time time,p_requirements text,p_items jsonb,p_vat numeric)
returns text language plpgsql security definer set search_path=public as $$
declare v_item jsonb;v_total numeric:=0;v_qty numeric;v_days numeric;v_price numeric;v_ref text;
begin
 if auth.uid() is null or not public.hotel_website_is_admin() then raise exception 'Admin access required';end if;
 if length(btrim(coalesce(p_name,''))) not between 2 and 150 or length(btrim(coalesce(p_contact,''))) not between 2 and 120 then raise exception 'Enter customer and contact names';end if;
 if p_event_date is null or (p_end_date is not null and p_end_date<p_event_date) or (p_end_date=p_event_date and p_end_time is not null and p_start_time is not null and p_end_time<=p_start_time) then raise exception 'Enter a valid event date and time range';end if;
 if p_vat is null or p_vat<0 or p_vat>100 then raise exception 'Invalid VAT rate';end if;
 if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)<1 or jsonb_array_length(p_items)>50 then raise exception 'Enter 1 to 50 quotation items';end if;
 for v_item in select value from jsonb_array_elements(p_items) loop
  v_qty:=(v_item->>'pax')::numeric;v_days:=(v_item->>'days')::numeric;v_price:=(v_item->>'unitPrice')::numeric;
  if length(btrim(coalesce(v_item->>'description',''))) not between 2 and 300 or v_qty<=0 or v_days<=0 or v_price<0 or v_qty>100000 or v_days>3650 or v_price>100000000 then raise exception 'Invalid quotation item';end if;
  v_total:=v_total+round(v_qty*v_days*v_price,2);
 end loop;
 v_total:=round(v_total*(1+p_vat/100),2);
 if v_total<=0 or v_total>999999999999.99 then raise exception 'Quotation total must be positive';end if;
 v_ref:='MTH'||to_char(current_date,'YYYY')||'-Q'||lpad(nextval('public.hotel_walkin_quotation_number_seq')::text,5,'0');
 insert into public.hotel_walkin_quotations(reference,organization_name,contact_person,contact_phone,organization_email,event_date,event_start_time,event_end_date,event_end_time,requirements,items,vat_rate,total_kes,created_by)
 values(v_ref,btrim(p_name),btrim(p_contact),coalesce(p_phone,''),coalesce(p_email,''),p_event_date,p_start_time,p_end_date,p_end_time,coalesce(p_requirements,''),p_items,p_vat,v_total,auth.uid());
 return v_ref;
end;$$;
create or replace function public.hotel_walkin_quote_status(p_id uuid,p_status text)
returns void language plpgsql security definer set search_path=public as $$
declare v_current text;
begin
 if auth.uid() is null or not public.hotel_website_is_admin() then raise exception 'Admin access required';end if;
 select status into v_current from public.hotel_walkin_quotations where id=p_id for update;
 if not found then raise exception 'Quotation not found';end if;
 if not ((v_current='prepared' and p_status in ('approved','cancelled')) or (v_current='approved' and p_status in ('booked','cancelled'))) then raise exception 'Invalid quotation status transition';end if;
 update public.hotel_walkin_quotations set status=p_status,updated_at=now() where id=p_id;
end;$$;
revoke all on function public.hotel_walkin_quote_create(text,text,text,text,date,time,date,time,text,jsonb,numeric) from public,anon;
revoke all on function public.hotel_walkin_quote_status(uuid,text) from public,anon;
grant execute on function public.hotel_walkin_quote_create(text,text,text,text,date,time,date,time,text,jsonb,numeric) to authenticated;
grant execute on function public.hotel_walkin_quote_status(uuid,text) to authenticated;

alter table public.hotel_website_conference_quotes drop constraint hotel_website_conference_quotes_status_check;
alter table public.hotel_website_conference_quotes add constraint hotel_website_conference_quotes_status_check
 check(status in ('new','assigned','preparing','quoted','approved','booked','closed'));
