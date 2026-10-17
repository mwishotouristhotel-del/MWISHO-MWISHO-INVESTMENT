alter table public.products add column if not exists preparation_options jsonb not null default '[]'::jsonb;
alter table public.hotel_order_items add column if not exists preparation_choice text;
alter table public.hotel_order_items add column if not exists kitchen_notes text;
create table public.hotel_print_jobs(
 id uuid primary key default gen_random_uuid(),
 order_id uuid not null references public.hotel_orders(id),
 destination text not null check(destination in ('counter','kitchen','bar')),
 status text not null default 'pending' check(status in ('pending','printing','printed','failed')),
 created_at timestamptz not null default now(),
 printed_at timestamptz,
 unique(order_id,destination)
);
alter table public.hotel_print_jobs enable row level security;
create or replace function public.hotel_menu()
returns table(id uuid,name text,price numeric,preparation_area text,preparation_options jsonb)
language sql stable security definer set search_path='' as $$
 select p.id,p.name,p.price,p.preparation_area,p.preparation_options from public.products p
 join public.departments d on d.id=p.department_id
 where d.code='HOTEL' and p.active=true and p.preparation_area is not null
 and exists(select 1 from public.staff_profiles s join public.staff_roles r on r.user_id=s.user_id
 where s.user_id=auth.uid() and s.active and r.active and
 (r.role in ('director_admin','central_manager') or
 (r.department_id=d.id and r.role in ('waiter','head_waiter','cashier','supervisor','department_manager'))))
 order by p.name;
$$;
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
 if exists(select 1 from jsonb_array_elements(p_items) x where
 (x->>'product_id') is null or (x->>'quantity') is null or
 (x->>'quantity') !~ '^[0-9]+([.][0-9]{1,3})?$' or
 (x->>'quantity')::numeric<=0 or (x->>'quantity')::numeric>100 or
 length(coalesce(x->>'notes',''))>500 or length(coalesce(x->>'choice',''))>100)
 then raise exception 'Invalid order item';end if;
 if exists(select 1 from jsonb_array_elements(p_items) x
 join public.products p on p.id=(x->>'product_id')::uuid
 where coalesce(jsonb_array_length(p.preparation_options),0)>0
 and not exists(select 1 from jsonb_array_elements_text(p.preparation_options) option where option=x->>'choice'))
 then raise exception 'Select a valid preparation option';end if;
 select count(*),sum(p.price*(x->>'quantity')::numeric) into v_count,v_total
 from jsonb_array_elements(p_items) x join public.products p on p.id=(x->>'product_id')::uuid
 where p.department_id=v_department and p.active and p.preparation_area in ('kitchen','bar');
 if v_count<>jsonb_array_length(p_items) then raise exception 'Unavailable product';end if;
 insert into public.hotel_orders(counter_id,waiter_id,table_label,total)
 values(p_counter,v_user,trim(p_table),v_total) returning id,order_number into v_order,v_number;
 insert into public.hotel_order_items(order_id,product_id,quantity,unit_price,preparation_area,preparation_choice,kitchen_notes)
 select v_order,p.id,(x->>'quantity')::numeric,p.price,p.preparation_area,nullif(trim(x->>'choice'),''),nullif(trim(x->>'notes'),'')
 from jsonb_array_elements(p_items) x join public.products p on p.id=(x->>'product_id')::uuid;
 insert into public.hotel_tickets(order_id,preparation_area)
 select distinct v_order,preparation_area from public.hotel_order_items where order_id=v_order;
 insert into public.hotel_print_jobs(order_id,destination) values(v_order,'counter');
 insert into public.hotel_print_jobs(order_id,destination)
 select distinct v_order,preparation_area from public.hotel_order_items where order_id=v_order;
 return v_number;
end $$;
create or replace function public.my_hotel_preparation_tickets(p_area text)
returns table(ticket_id uuid,order_number bigint,table_label text,counter_name text,status text,created_at timestamptz,items jsonb)
language plpgsql stable security definer set search_path='' as $$
begin
 if p_area not in ('kitchen','bar') then raise exception 'Invalid preparation area';end if;
 if not exists(select 1 from public.staff_profiles s join public.staff_roles r on r.user_id=s.user_id
 left join public.departments d on d.id=r.department_id
 where s.user_id=auth.uid() and s.active and r.active and
 (r.role in ('director_admin','central_manager') or
 (d.code='HOTEL' and (r.role in ('department_manager','supervisor','head_waiter') or
 (p_area='kitchen' and r.role='kitchen_staff') or (p_area='bar' and r.role='bar_staff')))))
 then raise exception 'Preparation queue access denied';end if;
 return query
 select t.id,o.order_number,o.table_label,c.name,t.status,t.created_at,
 (select coalesce(jsonb_agg(jsonb_build_object('name',p.name,'quantity',i.quantity,'choice',i.preparation_choice,'notes',i.kitchen_notes)),'[]'::jsonb)
 from public.hotel_order_items i join public.products p on p.id=i.product_id
 where i.order_id=o.id and i.preparation_area=t.preparation_area)
 from public.hotel_tickets t join public.hotel_orders o on o.id=t.order_id
 join public.counters c on c.id=o.counter_id
 where t.preparation_area=p_area and o.status<>'cancelled'
 order by case t.status when 'pending' then 0 when 'preparing' then 1 when 'ready' then 2 else 3 end,t.created_at desc limit 100;
end $;