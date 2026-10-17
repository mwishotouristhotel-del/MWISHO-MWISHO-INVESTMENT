create table if not exists public.requisition_sections(id uuid primary key default gen_random_uuid(),department_id uuid not null references public.departments(id),name text not null,active boolean not null default true,unique(department_id,name));
insert into public.requisition_sections(department_id,name)
select d.id,s.name from public.departments d cross join (values ('Kitchen'),('Bar'),('Restaurant'),('Accommodation Rooms'),('Laundry'),('Conference'),('Public Area'),('Housekeeping'),('Maintenance')) s(name) where d.name='Hotel' on conflict do nothing;
create table if not exists public.department_requisitions(id uuid primary key default gen_random_uuid(),department_id uuid not null references public.departments(id),section_id uuid references public.requisition_sections(id),requested_by uuid not null references auth.users(id),purpose text not null check(length(trim(purpose))>=5),needed_on date,status text not null default 'submitted' check(status in ('submitted','approved','rejected','issued','received')),created_at timestamptz not null default now(),reviewed_by uuid references auth.users(id),reviewed_at timestamptz,review_note text,issued_by uuid references auth.users(id),issued_at timestamptz,received_by uuid references auth.users(id),received_at timestamptz);
create table if not exists public.department_requisition_items(id uuid primary key default gen_random_uuid(),requisition_id uuid not null references public.department_requisitions(id) on delete cascade,item_name text not null check(length(trim(item_name))>=2),quantity numeric(12,2) not null check(quantity>0),unit text not null,notes text,issued_quantity numeric(12,2) not null default 0 check(issued_quantity>=0 and issued_quantity<=quantity));
create index if not exists department_requisitions_created_idx on public.department_requisitions(created_at desc);
alter table public.requisition_sections enable row level security;
alter table public.department_requisitions enable row level security;
alter table public.department_requisition_items enable row level security;
revoke all on public.requisition_sections,public.department_requisitions,public.department_requisition_items from anon,authenticated;
create or replace function public.my_requisition_sections() returns jsonb language plpgsql security definer set search_path='' as $$
begin
if not exists(select 1 from public.staff_profiles p where p.user_id=auth.uid() and p.active) then raise exception 'Active staff required' using errcode='42501';end if;
return coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'department_id',s.department_id,'department',d.name) order by d.name,s.name) from public.requisition_sections s join public.departments d on d.id=s.department_id where s.active), '[]'::jsonb);
end $$;
create or replace function public.submit_department_requisition(p_department uuid,p_section uuid,p_purpose text,p_needed_on date,p_items jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;v_item jsonb;v_count integer:=0;
begin
if not exists(select 1 from public.staff_profiles p where p.user_id=auth.uid() and p.active) then raise exception 'Active staff required' using errcode='42501';end if;
if not exists(select 1 from public.staff_roles r where r.user_id=auth.uid() and r.active and (r.role in ('director_admin','central_manager') or (r.role in ('cashier','department_manager','supervisor','head_waiter','central_storekeeper') and (r.department_id=p_department or r.department_id is null)))) then raise exception 'Not authorized to requisition for this department' using errcode='42501';end if;
if p_section is not null and not exists(select 1 from public.requisition_sections s where s.id=p_section and s.department_id=p_department and s.active) then raise exception 'Invalid section';end if;
if length(trim(coalesce(p_purpose,'')))<5 then raise exception 'Purpose is required';end if;
if jsonb_typeof(p_items)!='array' or jsonb_array_length(p_items)<1 or jsonb_array_length(p_items)>50 then raise exception 'Provide 1 to 50 items';end if;
insert into public.department_requisitions(department_id,section_id,requested_by,purpose,needed_on) values(p_department,p_section,auth.uid(),trim(p_purpose),p_needed_on) returning id into v_id;
for v_item in select value from jsonb_array_elements(p_items) loop
if length(trim(coalesce(v_item->>'name','')))<2 or length(trim(coalesce(v_item->>'unit','')))<1 or coalesce((v_item->>'quantity')::numeric,0)<=0 then raise exception 'Invalid item name, unit or quantity';end if;
insert into public.department_requisition_items(requisition_id,item_name,quantity,unit,notes) values(v_id,trim(v_item->>'name'),(v_item->>'quantity')::numeric,trim(v_item->>'unit'),nullif(trim(coalesce(v_item->>'notes','')),''));
v_count:=v_count+1;
end loop;
return v_id;
end $$;
create or replace function public.my_department_requisitions() returns jsonb language plpgsql security definer set search_path='' as $$
begin
if not exists(select 1 from public.staff_profiles p where p.user_id=auth.uid() and p.active) then raise exception 'Active staff required' using errcode='42501';end if;
return coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc) from (select r.id,r.created_at,r.status,r.purpose,r.needed_on,d.name department,s.name section,p.display_name requested_by_name,coalesce((select jsonb_agg(jsonb_build_object('name',i.item_name,'quantity',i.quantity,'unit',i.unit,'notes',i.notes,'issued_quantity',i.issued_quantity)) from public.department_requisition_items i where i.requisition_id=r.id),'[]'::jsonb) items from public.department_requisitions r join public.departments d on d.id=r.department_id left join public.requisition_sections s on s.id=r.section_id left join public.staff_profiles p on p.user_id=r.requested_by where r.requested_by=auth.uid() or exists(select 1 from public.staff_roles sr where sr.user_id=auth.uid() and sr.active and (sr.role in ('director_admin','central_manager','central_storekeeper') or (sr.role in ('department_manager','supervisor') and sr.department_id=r.department_id))) order by r.created_at desc limit 100)x),'[]'::jsonb);
end $$;
create or replace function public.review_department_requisition(p_id uuid,p_approve boolean,p_note text default null) returns void language plpgsql security definer set search_path='' as $$
declare v public.department_requisitions%rowtype;
begin
select * into v from public.department_requisitions where id=p_id for update;
if not found or v.status!='submitted' then raise exception 'Requisition not awaiting review';end if;
if v.requested_by=auth.uid() then raise exception 'Cannot approve own requisition';end if;
if not exists(select 1 from public.staff_roles r where r.user_id=auth.uid() and r.active and (r.role in ('director_admin','central_manager') or (r.role in ('department_manager','supervisor') and r.department_id=v.department_id))) then raise exception 'Manager approval required' using errcode='42501';end if;
update public.department_requisitions set status=case when p_approve then 'approved' else 'rejected' end,reviewed_by=auth.uid(),reviewed_at=now(),review_note=nullif(trim(coalesce(p_note,'')),'') where id=p_id;
end $$;
revoke all on function public.my_requisition_sections(),public.submit_department_requisition(uuid,uuid,text,date,jsonb),public.my_department_requisitions(),public.review_department_requisition(uuid,boolean,text) from public,anon;
grant execute on function public.my_requisition_sections(),public.submit_department_requisition(uuid,uuid,text,date,jsonb),public.my_department_requisitions(),public.review_department_requisition(uuid,boolean,text) to authenticated;