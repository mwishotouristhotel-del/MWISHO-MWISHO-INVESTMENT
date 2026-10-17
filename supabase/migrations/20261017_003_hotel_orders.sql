-- Hotel ordering: preparation and payment are independent states.
alter table public.products add column if not exists preparation_area text check(preparation_area in ('kitchen','bar'));
create table public.hotel_orders(
 id uuid primary key default gen_random_uuid(),
 order_number bigint generated always as identity unique,
 counter_id uuid not null references public.counters(id),
 waiter_id uuid not null references public.staff_profiles(user_id),
 table_label text not null,
 status text not null default 'submitted' check(status in ('submitted','cancelled','completed')),
 payment_status text not null default 'unpaid' check(payment_status in ('unpaid','paid')),
 total numeric(14,2) not null check(total>=0),
 created_at timestamptz not null default now(),
 paid_at timestamptz,
 paid_by uuid references public.staff_profiles(user_id),
 payment_method text,
 payment_reference text,
 check ((payment_status='unpaid' and paid_at is null and paid_by is null) or (payment_status='paid' and paid_at is not null and paid_by is not null))
);
create table public.hotel_order_items(
 id uuid primary key default gen_random_uuid(),
 order_id uuid not null references public.hotel_orders(id),
 product_id uuid not null references public.products(id),
 quantity numeric(12,3) not null check(quantity>0),
 unit_price numeric(14,2) not null check(unit_price>=0),
 preparation_area text not null check(preparation_area in ('kitchen','bar'))
);
create table public.hotel_tickets(
 id uuid primary key default gen_random_uuid(),
 order_id uuid not null references public.hotel_orders(id),
 preparation_area text not null check(preparation_area in ('kitchen','bar')),
 status text not null default 'pending' check(status in ('pending','preparing','ready','served')),
 created_at timestamptz not null default now(),
 unique(order_id,preparation_area)
);
create index hotel_orders_counter_date on public.hotel_orders(counter_id,created_at desc);
create index hotel_tickets_area_status on public.hotel_tickets(preparation_area,status);
alter table public.hotel_orders enable row level security;
alter table public.hotel_order_items enable row level security;
alter table public.hotel_tickets enable row level security;
create or replace function public.hotel_menu()
returns table(id uuid,name text,price numeric,preparation_area text)
language sql stable security definer set search_path='' as $$
 select p.id,p.name,p.price,p.preparation_area from public.products p
 join public.departments d on d.id=p.department_id
 where d.code='HOTEL' and p.active=true and p.preparation_area is not null
 and exists(select 1 from public.staff_profiles s join public.staff_roles r on r.user_id=s.user_id
 where s.user_id=auth.uid() and s.active and r.active and
 (r.role in ('director_admin','central_manager') or
 (r.department_id=d.id and r.role in ('waiter','head_waiter','cashier','supervisor','department_manager'))))
 order by p.name;
$$;
revoke all on function public.hotel_menu() from public,anon;
grant execute on function public.hotel_menu() to authenticated;
create or replace function public.submit_hotel_order(p_counter uuid,p_table text,p_items jsonb)
returns bigint language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid();v_department uuid;v_order uuid;v_number bigint;v_total numeric(14,2);v_count int;
begin
 select c.department_id into v_department from public.counters c join public.departments d on d.id=c.department_id
 where c.id=p_counter and c.active and d.code='HOTEL' and c.counter_type in ('bar','restaurant');
 if v_department is null then raise exception 'Invalid hotel counter';end if;
 if not exists(select 1 from public.staff_profiles s join public.staff_roles r on r.user_id=s.user_id
 where s.user_id=v_user and s.active and r.active and (r.role in ('director_admin','central_manager') or
 (r.department_id=v_department and r.role in ('waiter','head_waiter'))))
 then raise exception 'Not authorized to submit hotel orders';end if;
 if length(trim(coalesce(p_table,''))) not between 1 and 80 then raise exception 'Table or guest reference required';end if;
 if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) not between 1 and 50 then raise exception 'Provide 1 to 50 items';end if;
 if exists(select 1 from jsonb_array_elements(p_items) x
 where (x->>'product_id') is null or (x->>'quantity') is null or
 (x->>'quantity') !~ '^[0-9]+([.][0-9]{1,3})?$' or
 (x->>'quantity')::numeric<=0 or (x->>'quantity')::numeric>100)
 then raise exception 'Invalid order item';end if;
 select count(*),sum(p.price*(x->>'quantity')::numeric) into v_count,v_total
 from jsonb_array_elements(p_items) x join public.products p on p.id=(x->>'product_id')::uuid
 where p.department_id=v_department and p.active and p.preparation_area in ('kitchen','bar');
 if v_count<>jsonb_array_length(p_items) then raise exception 'Unavailable product';end if;
 insert into public.hotel_orders(counter_id,waiter_id,table_label,total)
 values(p_counter,v_user,trim(p_table),v_total) returning id,order_number into v_order,v_number;
 insert into public.hotel_order_items(order_id,product_id,quantity,unit_price,preparation_area)
 select v_order,p.id,(x->>'quantity')::numeric,p.price,p.preparation_area
 from jsonb_array_elements(p_items) x join public.products p on p.id=(x->>'product_id')::uuid;
 insert into public.hotel_tickets(order_id,preparation_area)
 select distinct v_order,preparation_area from public.hotel_order_items where order_id=v_order;
 return v_number;
end $$;
revoke all on function public.submit_hotel_order(uuid,text,jsonb) from public,anon;
grant execute on function public.submit_hotel_order(uuid,text,jsonb) to authenticated;
create or replace function public.my_cashier_hotel_orders()
returns table(id uuid,order_number bigint,counter_name text,table_label text,total numeric,payment_status text,created_at timestamptz)
language sql stable security definer set search_path='' as $$
 select o.id,o.order_number,c.name,o.table_label,o.total,o.payment_status,o.created_at
 from public.hotel_orders o join public.counters c on c.id=o.counter_id
 join public.cashier_assignments a on a.counter_id=o.counter_id and a.cashier_id=auth.uid() and a.ends_at is null
 join public.staff_profiles s on s.user_id=auth.uid() and s.active
 join public.staff_roles r on r.user_id=s.user_id and r.active and r.role='cashier'
 where o.status<>'cancelled' and (r.department_id=c.department_id or r.department_id is null)
 order by o.created_at desc limit 100;
$$;
revoke all on function public.my_cashier_hotel_orders() from public,anon;
grant execute on function public.my_cashier_hotel_orders() to authenticated;
create or replace function public.confirm_hotel_payment(p_order uuid,p_method text,p_reference text)
returns void language plpgsql security definer set search_path='' as $$
declare v_counter uuid;v_department uuid;
begin
 select o.counter_id,c.department_id into v_counter,v_department from public.hotel_orders o join public.counters c on c.id=o.counter_id
 where o.id=p_order and o.status<>'cancelled' and o.payment_status='unpaid' for update of o;
 if v_counter is null then raise exception 'Order not found or already paid';end if;
 if not exists(select 1 from public.cashier_assignments a join public.staff_profiles s on s.user_id=a.cashier_id
 join public.staff_roles r on r.user_id=s.user_id
 where a.counter_id=v_counter and a.cashier_id=auth.uid() and a.ends_at is null and s.active
 and r.active and r.role='cashier' and (r.department_id=v_department or r.department_id is null))
 then raise exception 'Not the assigned cashier for this counter';end if;
 if p_method not in ('cash','mpesa','card','bank') then raise exception 'Unsupported payment method';end if;
 if p_method<>'cash' and length(trim(coalesce(p_reference,'')))<3 then raise exception 'Payment reference required';end if;
 update public.hotel_orders set payment_status='paid',paid_at=now(),paid_by=auth.uid(),
 payment_method=p_method,payment_reference=nullif(trim(p_reference),'') where id=p_order;
end $$;
revoke all on function public.confirm_hotel_payment(uuid,text,text) from public,anon;
grant execute on function public.confirm_hotel_payment(uuid,text,text) to authenticated;
-- No client table policies: mutations and reads occur only through role-checked RPCs.
