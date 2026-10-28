-- Separate guest preorders; NEVER feed unpaid orders to existing POS/kitchen tables.
create table if not exists public.hotel_website_food_preorders(
 id uuid primary key default gen_random_uuid(),
 customer_name text not null check(length(customer_name) between 2 and 120),
 phone text not null check(length(phone) between 7 and 25),
 arrival_at timestamptz not null,
 items jsonb not null check(jsonb_typeof(items)='array' and jsonb_array_length(items) between 1 and 30),
 total_kes numeric(12,2) not null check(total_kes>0),
 mpesa_reference text not null check(mpesa_reference ~ '^[A-Z0-9]{8,15}$'),
 status text not null default 'pending_verification' check(status in ('pending_verification','verified','rejected','cancelled')),
 verified_by uuid,
 verified_at timestamptz,
 verification_note text not null default '',
 created_at timestamptz not null default now(),
 constraint verified_only_by_staff check(status <> 'verified' or (verified_by is not null and verified_at is not null))
);
create unique index if not exists food_preorders_mpesa_reference_unique on public.hotel_website_food_preorders(mpesa_reference);
create index if not exists food_preorders_review_idx on public.hotel_website_food_preorders(status,created_at desc);
alter table public.hotel_website_food_preorders enable row level security;
grant select on public.hotel_website_food_preorders to authenticated;
create policy "food_orders_authorized_read" on public.hotel_website_food_preorders for select to authenticated using(
 (select public.hotel_website_is_admin()) or exists(
 select 1 from public.staff_roles sr where sr.user_id=(select auth.uid()) and sr.active=true and sr.role='cashier'
 ));
-- No public insert/update; guest submission uses validated server route, staff status via RPC.
create or replace function public.review_website_food_preorder(p_id uuid,p_approved boolean,p_note text default '')
returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not exists(
 select 1 from public.staff_roles s where s.user_id=auth.uid() and s.active=true
 and s.role in ('director_admin','central_manager','cashier')) then
  raise exception 'Not authorized to review payment';
 end if;
 if length(coalesce(p_note,''))>500 then raise exception 'Note too long'; end if;
 update public.hotel_website_food_preorders
 set status=case when p_approved then 'verified' else 'rejected' end,
 verified_by=case when p_approved then auth.uid() else null end,
 verified_at=case when p_approved then now() else null end,
 verification_note=coalesce(p_note,'')
 where id=p_id and status='pending_verification';
 if not found then raise exception 'Order missing or already reviewed'; end if;
end $$;
revoke all on function public.review_website_food_preorder(uuid,boolean,text) from public,anon;
grant execute on function public.review_website_food_preorder(uuid,boolean,text) to authenticated;
