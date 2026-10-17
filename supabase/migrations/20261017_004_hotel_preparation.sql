-- Hotel preparation staff can view and progress only their own kitchen/bar tickets.
alter table public.staff_roles drop constraint if exists staff_roles_role_check;
alter table public.staff_roles add constraint staff_roles_role_check check(role in ('director_admin','central_manager','accounts','central_storekeeper','department_manager','supervisor','cashier','head_waiter','waiter','order_taker','handover_staff','release_staff','kitchen_staff','bar_staff'));
create or replace function public.my_hotel_preparation_tickets(p_area text)
returns table(ticket_id uuid,order_number bigint,table_label text,counter_name text,status text,created_at timestamptz,items jsonb)
language plpgsql stable security definer set search_path='' as $$
begin
 if p_area not in ('kitchen','bar') then raise exception 'Invalid preparation area';end if;
 if not exists(
 select 1 from public.staff_profiles s join public.staff_roles r on r.user_id=s.user_id
 left join public.departments d on d.id=r.department_id
 where s.user_id=auth.uid() and s.active and r.active and
 (r.role in ('director_admin','central_manager') or
 (d.code='HOTEL' and (r.role in ('department_manager','supervisor','head_waiter') or
 (p_area='kitchen' and r.role='kitchen_staff') or (p_area='bar' and r.role='bar_staff')))))
 then raise exception 'Preparation queue access denied';end if;
 return query
 select t.id,o.order_number,o.table_label,c.name,t.status,t.created_at,
 (select coalesce(jsonb_agg(jsonb_build_object('name',p.name,'quantity',i.quantity)),'[]'::jsonb)
 from public.hotel_order_items i join public.products p on p.id=i.product_id
 where i.order_id=o.id and i.preparation_area=t.preparation_area)
 from public.hotel_tickets t join public.hotel_orders o on o.id=t.order_id
 join public.counters c on c.id=o.counter_id
 where t.preparation_area=p_area and o.status<>'cancelled'
 order by case t.status when 'pending' then 0 when 'preparing' then 1 when 'ready' then 2 else 3 end,t.created_at desc limit 100;
end $$;
revoke all on function public.my_hotel_preparation_tickets(text) from public,anon;
grant execute on function public.my_hotel_preparation_tickets(text) to authenticated;
create or replace function public.progress_hotel_ticket(p_ticket uuid,p_next text)
returns void language plpgsql security definer set search_path='' as $$
declare v_area text;v_status text;
begin
 select preparation_area,status into v_area,v_status from public.hotel_tickets where id=p_ticket for update;
 if v_area is null then raise exception 'Ticket not found';end if;
 if not exists(
 select 1 from public.staff_profiles s join public.staff_roles r on r.user_id=s.user_id
 left join public.departments d on d.id=r.department_id
 where s.user_id=auth.uid() and s.active and r.active and
 (r.role in ('director_admin','central_manager') or
 (d.code='HOTEL' and (r.role in ('department_manager','supervisor') or
 (v_area='kitchen' and r.role='kitchen_staff') or (v_area='bar' and r.role='bar_staff') or
 (p_next='served' and r.role in ('head_waiter','waiter'))))))
 then raise exception 'Not authorized to update this ticket';end if;
 if not ((v_status='pending' and p_next='preparing') or
 (v_status='preparing' and p_next='ready') or
 (v_status='ready' and p_next='served')) then raise exception 'Invalid ticket status transition';end if;
 update public.hotel_tickets set status=p_next where id=p_ticket;
end $$;
revoke all on function public.progress_hotel_ticket(uuid,text) from public,anon;
grant execute on function public.progress_hotel_ticket(uuid,text) to authenticated;
-- A waiter may view ready tickets for handover, but not the entire preparation queue.
create or replace function public.my_waiter_ready_tickets()
returns table(ticket_id uuid,order_number bigint,table_label text,preparation_area text,items jsonb)
language sql stable security definer set search_path='' as $$
 select t.id,o.order_number,o.table_label,t.preparation_area,
 (select coalesce(jsonb_agg(jsonb_build_object('name',p.name,'quantity',i.quantity)),'[]'::jsonb)
 from public.hotel_order_items i join public.products p on p.id=i.product_id
 where i.order_id=o.id and i.preparation_area=t.preparation_area)
 from public.hotel_tickets t join public.hotel_orders o on o.id=t.order_id
 join public.departments d on d.code='HOTEL'
 where o.waiter_id=auth.uid() and t.status='ready' and o.status<>'cancelled'
 and exists(select 1 from public.staff_profiles s join public.staff_roles r on r.user_id=s.user_id
 where s.user_id=auth.uid() and s.active and r.active and r.department_id=d.id and r.role in ('waiter','head_waiter'))
 order by t.created_at;
$$;
revoke all on function public.my_waiter_ready_tickets() from public,anon;
grant execute on function public.my_waiter_ready_tickets() to authenticated;