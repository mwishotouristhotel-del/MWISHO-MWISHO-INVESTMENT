create table public.hotel_print_devices (
 id uuid primary key default gen_random_uuid(),
 name text not null,
 destination text not null check(destination in ('counter','kitchen','bar')),
 counter_id uuid references public.counters(id),
 agent_user_id uuid not null references auth.users(id),
 windows_printer_name text not null,
 paper_width_mm integer not null default 80 check(paper_width_mm in (58,80)),
 active boolean not null default true,
 created_at timestamptz not null default now()
);
alter table public.hotel_print_devices enable row level security;
alter table public.hotel_print_jobs add column device_id uuid references public.hotel_print_devices(id);
alter table public.hotel_print_jobs add column claimed_at timestamptz;
alter table public.hotel_print_jobs add column attempts integer not null default 0;
alter table public.hotel_print_jobs add column last_error text;
create index hotel_print_jobs_pending on public.hotel_print_jobs(destination,status,created_at);
create or replace function public.claim_hotel_print_job(p_device uuid)
returns table(job_id uuid,order_number bigint,table_label text,counter_name text,destination text,windows_printer_name text,paper_width_mm integer,items jsonb)
language plpgsql security definer set search_path='' as $fn$
declare v_device public.hotel_print_devices%rowtype;v_job uuid;
begin
 select * into v_device from public.hotel_print_devices where id=p_device and active and agent_user_id=auth.uid();
 if not found then raise exception 'Print device not assigned to signed-in agent';end if;
 select j.id into v_job from public.hotel_print_jobs j
 join public.hotel_orders o on o.id=j.order_id
 where j.destination=v_device.destination and (v_device.counter_id is null or o.counter_id=v_device.counter_id)
 and (j.status='pending' or (j.status='printing' and j.claimed_at<now()-interval '3 minutes'))
 and j.attempts<5
 order by j.created_at for update of j skip locked limit 1;
 if v_job is null then return;end if;
 update public.hotel_print_jobs set status='printing',device_id=p_device,claimed_at=now(),attempts=attempts+1 where id=v_job;
 return query select j.id,o.order_number,o.table_label,c.name,j.destination,v_device.windows_printer_name,v_device.paper_width_mm,
 (select coalesce(jsonb_agg(jsonb_build_object('name',p.name,'quantity',i.quantity,'choice',i.preparation_choice,'notes',i.kitchen_notes,'price',i.unit_price)),'[]'::jsonb)
 from public.hotel_order_items i join public.products p on p.id=i.product_id
 where i.order_id=o.id and (j.destination='counter' or i.preparation_area=j.destination))
 from public.hotel_print_jobs j join public.hotel_orders o on o.id=j.order_id
 join public.counters c on c.id=o.counter_id where j.id=v_job;
end $fn$;
revoke all on function public.claim_hotel_print_job(uuid) from public,anon;
grant execute on function public.claim_hotel_print_job(uuid) to authenticated;
create or replace function public.finish_hotel_print_job(p_job uuid,p_success boolean,p_error text default null)
returns void language plpgsql security definer set search_path='' as $fn$
begin
 update public.hotel_print_jobs j set
 status=case when p_success then 'printed' else 'failed' end,
 printed_at=case when p_success then now() else null end,
 last_error=case when p_success then null else left(coalesce(p_error,'Print failed'),500) end
 from public.hotel_print_devices d
 where j.id=p_job and j.device_id=d.id and d.agent_user_id=auth.uid()
 and j.status='printing' and j.claimed_at>now()-interval '3 minutes';
 if not found then raise exception 'Print job not owned by this agent or lease expired';end if;
end $fn$;
revoke all on function public.finish_hotel_print_job(uuid,boolean,text) from public,anon;
grant execute on function public.finish_hotel_print_job(uuid,boolean,text) to authenticated;