-- Standalone website food-order payment proof queue. No mutation of POS orders.
create table if not exists public.hotel_website_food_orders (
 id uuid primary key default gen_random_uuid(),
 customer_name text not null check(length(customer_name) between 2 and 120),
 customer_phone text not null check(length(customer_phone) between 9 and 25),
 arrival_date date not null,
 arrival_time time not null,
 items jsonb not null check(jsonb_typeof(items)='array' and jsonb_array_length(items) between 1 and 25),
 total_kes numeric(12,2) not null check(total_kes>0),
 till_number text not null check(length(till_number) between 5 and 15),
 mpesa_reference text not null check(mpesa_reference ~ '^[A-Z0-9]{8,15}$'),
 status text not null default 'pending_verification'
  check(status in ('pending_verification','rejected','approved_for_kitchen','completed')),
 reviewed_by uuid,
 reviewed_at timestamptz,
 review_notes text not null default '',
 created_at timestamptz not null default now()
);
create unique index if not exists hotel_website_food_order_unique_code on public.hotel_website_food_orders (upper(mpesa_reference));
create index if not exists hotel_website_food_order_queue on public.hotel_website_food_orders (status,created_at);
alter table public.hotel_website_food_orders enable row level security;
grant select,update on public.hotel_website_food_orders to authenticated;
-- Director/Admin review only initially; later staff can be assigned explicitly.
create policy "website_food_admin_read" on public.hotel_website_food_orders
 for select to authenticated using ((select public.hotel_website_is_admin()));
create policy "website_food_admin_update" on public.hotel_website_food_orders
 for update to authenticated using ((select public.hotel_website_is_admin()))
 with check ((select public.hotel_website_is_admin()));
-- No anonymous insert access: public submissions use server-only Edge Function validation.
