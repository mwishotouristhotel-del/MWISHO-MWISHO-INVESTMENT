-- Internal invoices: independent of POS, accommodation, and website orders.
create sequence if not exists public.hotel_other_income_invoice_number_seq;
create table if not exists public.hotel_other_income_invoices (
 id uuid primary key default gen_random_uuid(),
 invoice_number text not null unique,
 category text not null check(length(btrim(category)) between 2 and 100),
 bill_to text not null check(length(btrim(bill_to)) between 2 and 180),
 contact text not null default '',
 address text not null default '',
 kra_pin text not null default '',
 invoice_date date not null default current_date,
 due_date date,
 description text not null default '',
 status text not null default 'unpaid' check(status in ('unpaid','partial','paid')),
 total_kes numeric(14,2) not null check(total_kes>0),
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now()
);
create table if not exists public.hotel_other_income_invoice_items (
 id bigint generated always as identity primary key,
 invoice_id uuid not null references public.hotel_other_income_invoices(id),
 description text not null check(length(btrim(description)) between 2 and 300),
 quantity numeric(12,3) not null check(quantity>0),
 unit_price_kes numeric(14,2) not null check(unit_price_kes>=0),
 amount_kes numeric(14,2) not null check(amount_kes>=0)
);
create table if not exists public.hotel_other_income_payments (
 id uuid primary key default gen_random_uuid(),
 invoice_id uuid not null references public.hotel_other_income_invoices(id),
 amount_kes numeric(14,2) not null check(amount_kes>0),
 method text not null check(method in ('cash','mpesa','bank','pdq','other')),
 payment_reference text not null default '',
 payment_date date not null default current_date,
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now()
);
alter table public.hotel_other_income_invoices enable row level security;
alter table public.hotel_other_income_invoice_items enable row level security;
alter table public.hotel_other_income_payments enable row level security;
grant select on public.hotel_other_income_invoices,public.hotel_other_income_invoice_items,public.hotel_other_income_payments to authenticated;
create policy other_income_invoice_admin_read on public.hotel_other_income_invoices for select to authenticated using (public.hotel_website_is_admin());
create policy other_income_items_admin_read on public.hotel_other_income_invoice_items for select to authenticated using (public.hotel_website_is_admin());
create policy other_income_payments_admin_read on public.hotel_other_income_payments for select to authenticated using (public.hotel_website_is_admin());

create or replace function public.hotel_other_income_create_invoice(p_category text,p_bill_to text,p_contact text,p_address text,p_kra_pin text,p_date date,p_due_date date,p_description text,p_items jsonb)
returns text language plpgsql security definer set search_path=public as $$
declare v_id uuid;v_number text;v_item jsonb;v_total numeric(14,2):=0;v_quantity numeric;v_price numeric;v_count integer:=0;
begin
 if auth.uid() is null or not public.hotel_website_is_admin() then raise exception 'Admin access required';end if;
 if length(btrim(coalesce(p_category,''))) not between 2 and 100 or length(btrim(coalesce(p_bill_to,''))) not between 2 and 180 then raise exception 'Enter category and bill-to name';end if;
 if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)<1 or jsonb_array_length(p_items)>50 then raise exception 'Enter 1 to 50 invoice items';end if;
 for v_item in select value from jsonb_array_elements(p_items) loop
  v_quantity:=(v_item->>'quantity')::numeric;v_price:=(v_item->>'unit_price_kes')::numeric;
  if length(btrim(coalesce(v_item->>'description',''))) not between 2 and 300 or v_quantity<=0 or v_price<0 or v_quantity>100000 or v_price>100000000 then raise exception 'Invalid invoice item';end if;
  v_total:=v_total+round(v_quantity*v_price,2);v_count:=v_count+1;
 end loop;
 if v_total<=0 or v_total>999999999999.99 then raise exception 'Invoice total must be positive';end if;
 if p_due_date is not null and p_due_date<coalesce(p_date,current_date) then raise exception 'Due date cannot precede invoice date';end if;
 v_number:='MTH-OI-'||to_char(coalesce(p_date,current_date),'YYYY')||'-'||lpad(nextval('public.hotel_other_income_invoice_number_seq')::text,5,'0');
 insert into public.hotel_other_income_invoices(invoice_number,category,bill_to,contact,address,kra_pin,invoice_date,due_date,description,total_kes,created_by)
 values(v_number,btrim(p_category),btrim(p_bill_to),coalesce(p_contact,''),coalesce(p_address,''),coalesce(p_kra_pin,''),coalesce(p_date,current_date),p_due_date,coalesce(p_description,''),v_total,auth.uid()) returning id into v_id;
 for v_item in select value from jsonb_array_elements(p_items) loop
  v_quantity:=(v_item->>'quantity')::numeric;v_price:=(v_item->>'unit_price_kes')::numeric;
  insert into public.hotel_other_income_invoice_items(invoice_id,description,quantity,unit_price_kes,amount_kes) values(v_id,btrim(v_item->>'description'),v_quantity,v_price,round(v_quantity*v_price,2));
 end loop;
 return v_number;
end;$$;

create or replace function public.hotel_other_income_record_payment(p_invoice_id uuid,p_amount numeric,p_method text,p_reference text,p_date date)
returns void language plpgsql security definer set search_path=public as $$
declare v_invoice public.hotel_other_income_invoices%rowtype;v_paid numeric;v_new_paid numeric;
begin
 if auth.uid() is null or not public.hotel_website_is_admin() then raise exception 'Admin access required';end if;
 select * into v_invoice from public.hotel_other_income_invoices where id=p_invoice_id for update;
 if not found then raise exception 'Invoice not found';end if;
 select coalesce(sum(amount_kes),0) into v_paid from public.hotel_other_income_payments where invoice_id=p_invoice_id;
 if p_amount is null or p_amount<=0 or p_amount>v_invoice.total_kes-v_paid then raise exception 'Payment must be positive and not exceed the outstanding balance';end if;
 if p_method not in ('cash','mpesa','bank','pdq','other') then raise exception 'Invalid payment method';end if;
 if p_method in ('mpesa','bank','pdq') and length(btrim(coalesce(p_reference,'')))<3 then raise exception 'Payment reference required';end if;
 insert into public.hotel_other_income_payments(invoice_id,amount_kes,method,payment_reference,payment_date,created_by)
 values(p_invoice_id,p_amount,p_method,coalesce(p_reference,''),coalesce(p_date,current_date),auth.uid());
 v_new_paid:=v_paid+p_amount;
 update public.hotel_other_income_invoices set status=case when v_new_paid>=total_kes then 'paid' else 'partial' end where id=p_invoice_id;
end;$$;
revoke all on function public.hotel_other_income_create_invoice(text,text,text,text,text,date,date,text,jsonb) from public,anon;
revoke all on function public.hotel_other_income_record_payment(uuid,numeric,text,text,date) from public,anon;
grant execute on function public.hotel_other_income_create_invoice(text,text,text,text,text,date,date,text,jsonb) to authenticated;
grant execute on function public.hotel_other_income_record_payment(uuid,numeric,text,text,date) to authenticated;
