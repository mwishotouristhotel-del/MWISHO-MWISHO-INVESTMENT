-- Room inspection records are separate from check-in, checkout and room readiness.
create table if not exists public.hotel_accommodation_inspection_items (
 id uuid primary key default gen_random_uuid(),
 label text not null unique check (length(trim(label)) between 2 and 120),
 sort_order integer not null default 100,
 active boolean not null default true,
 created_at timestamptz not null default now()
);

insert into public.hotel_accommodation_inspection_items(label,sort_order)
select v.label,v.sort_order from (values
 ('Tissue',10),('Bathing soap',20),('Shower gel',30),('Drinking water',40),
 ('Hot shower',50),('Water in the room',60),('Room cleaned',70),
 ('Beddings changed and well spread',80),('Window clean and dusted',90),
 ('Tables dusted',100),('Key available',110),('TV working',120),
 ('Sockets working',130),('All lights working',140)
) v(label,sort_order) on conflict(label) do nothing;

create table if not exists public.hotel_accommodation_room_inspections (
 id uuid primary key default gen_random_uuid(),
 room_id uuid not null references public.hotel_accommodation_rooms(id),
 inspected_by uuid not null references public.staff_profiles(user_id),
 inspected_at timestamptz not null default now(),
 result text not null check(result in ('passed','needs_attention')),
 checks jsonb not null check(jsonb_typeof(checks)='array'),
 notes text not null default '' check(length(notes)<=2000)
);
create index if not exists accommodation_inspections_room_recent
 on public.hotel_accommodation_room_inspections(room_id,inspected_at desc);

alter table public.hotel_accommodation_inspection_items enable row level security;
alter table public.hotel_accommodation_room_inspections enable row level security;
revoke all on public.hotel_accommodation_inspection_items,public.hotel_accommodation_room_inspections from anon,authenticated;
grant select on public.hotel_accommodation_inspection_items,public.hotel_accommodation_room_inspections to authenticated;
create policy accommodation_inspection_items_staff_read on public.hotel_accommodation_inspection_items
 for select to authenticated using ((select public.hotel_accommodation_can_housekeeping()));
create policy accommodation_room_inspections_staff_read on public.hotel_accommodation_room_inspections
 for select to authenticated using ((select public.hotel_accommodation_can_housekeeping()));

create or replace function public.hotel_accommodation_manage_inspection_item(
 p_item uuid default null,p_label text default null,p_active boolean default true
) returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;v_label text;
begin
 if auth.uid() is null or not public.hotel_accommodation_can_manage_all() then
  raise exception 'Accommodation management access required' using errcode='42501';
 end if;
 v_label:=nullif(trim(coalesce(p_label,'')),'');
 if p_item is null then
  if length(coalesce(v_label,'')) not between 2 and 120 then raise exception 'Enter a checklist item between 2 and 120 characters'; end if;
  insert into public.hotel_accommodation_inspection_items(label,sort_order,active)
   values(v_label,(select coalesce(max(sort_order),0)+10 from public.hotel_accommodation_inspection_items),true)
   returning id into v_id;
 else
  if v_label is not null and length(v_label) not between 2 and 120 then raise exception 'Invalid checklist item name'; end if;
  update public.hotel_accommodation_inspection_items set label=coalesce(v_label,label),active=coalesce(p_active,active)
   where id=p_item returning id into v_id;
  if v_id is null then raise exception 'Checklist item not found'; end if;
 end if;
 return v_id;
end $$;

create or replace function public.hotel_accommodation_save_room_inspection(
 p_room uuid,p_checks jsonb,p_notes text default ''
) returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;v_active integer;v_snapshot jsonb;v_passed boolean;
begin
 if auth.uid() is null or not public.hotel_accommodation_can_housekeeping() then
  raise exception 'Housekeeping access required' using errcode='42501';
 end if;
 if not exists(select 1 from public.hotel_accommodation_rooms where id=p_room and active) then
  raise exception 'Active room not found';
 end if;
 if jsonb_typeof(p_checks) is distinct from 'array' then raise exception 'Inspection checks must be a list'; end if;
 select count(*) into v_active from public.hotel_accommodation_inspection_items where active;
 if v_active=0 or jsonb_array_length(p_checks)<>v_active then
  raise exception 'Answer every active checklist item';
 end if;
 if exists(select 1 from jsonb_array_elements(p_checks) x
  left join public.hotel_accommodation_inspection_items i on i.id=(x->>'item_id')::uuid
  where i.id is null or not i.active or jsonb_typeof(x->'passed') is distinct from 'boolean')
  or exists(select 1 from jsonb_array_elements(p_checks) x group by x->>'item_id' having count(*)>1)
 then raise exception 'Invalid, duplicate or unanswered checklist item'; end if;
 select jsonb_agg(jsonb_build_object('item_id',i.id,'label',i.label,'passed',(x->>'passed')::boolean)
  order by i.sort_order,i.label),bool_and((x->>'passed')::boolean)
  into v_snapshot,v_passed
  from jsonb_array_elements(p_checks) x
  join public.hotel_accommodation_inspection_items i on i.id=(x->>'item_id')::uuid;
 if length(coalesce(p_notes,''))>2000 then raise exception 'Notes must be within 2000 characters'; end if;
 insert into public.hotel_accommodation_room_inspections(room_id,inspected_by,result,checks,notes)
  values(p_room,auth.uid(),case when v_passed then 'passed' else 'needs_attention' end,v_snapshot,coalesce(p_notes,''))
  returning id into v_id;
 return v_id;
end $$;

revoke all on function public.hotel_accommodation_manage_inspection_item(uuid,text,boolean) from public,anon;
revoke all on function public.hotel_accommodation_save_room_inspection(uuid,jsonb,text) from public,anon;
grant execute on function public.hotel_accommodation_manage_inspection_item(uuid,text,boolean) to authenticated;
grant execute on function public.hotel_accommodation_save_room_inspection(uuid,jsonb,text) to authenticated;
