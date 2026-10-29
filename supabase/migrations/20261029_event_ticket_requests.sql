alter table public.hotel_website_promotions
 add column if not exists ticket_booking_enabled boolean not null default false,
 add column if not exists ticket_price_kes numeric(12,2),
 add column if not exists ticket_capacity integer;
alter table public.hotel_website_promotions
 add constraint ticket_price_valid check(ticket_price_kes is null or ticket_price_kes>=0),
 add constraint ticket_capacity_valid check(ticket_capacity is null or ticket_capacity between 1 and 100000);
create table if not exists public.hotel_website_event_ticket_requests(
 id uuid primary key default gen_random_uuid(),
 event_id uuid not null references public.hotel_website_promotions(id) on delete restrict,
 event_title text not null,
 customer_name text not null check(length(customer_name) between 2 and 120),
 customer_phone text not null check(length(customer_phone) between 9 and 30),
 customer_email text not null check(length(customer_email) between 5 and 254),
 quantity integer not null check(quantity between 1 and 20),
 unit_price_kes numeric(12,2),
 total_kes numeric(12,2),
 status text not null default 'pending_review' check(status in ('pending_review','confirmed','rejected','cancelled')),
 notes text not null default '' check(length(notes)<=1000),
 created_at timestamptz not null default now(),
 reviewed_at timestamptz,
 reviewed_by uuid
);
create index if not exists website_ticket_requests_event_status on public.hotel_website_event_ticket_requests(event_id,status);
alter table public.hotel_website_event_ticket_requests enable row level security;
grant select,update on public.hotel_website_event_ticket_requests to authenticated;
create policy "website_ticket_admin_select" on public.hotel_website_event_ticket_requests
 for select to authenticated using ((select public.hotel_website_is_admin()));
create policy "website_ticket_admin_update" on public.hotel_website_event_ticket_requests
 for update to authenticated using ((select public.hotel_website_is_admin()))
 with check ((select public.hotel_website_is_admin()));
-- Customer requests go through validated Edge Function; no public table INSERT grant.
