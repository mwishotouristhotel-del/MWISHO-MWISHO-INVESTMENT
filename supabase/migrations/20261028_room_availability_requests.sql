-- Separate website accommodation enquiry queue; does NOT claim room availability.
create table if not exists public.hotel_website_room_requests (
 id uuid primary key default gen_random_uuid(),
 room_id uuid not null references public.hotel_website_room_listings(id),
 request_kind text not null check(request_kind in ('availability','similar_room')),
 check_in date not null,
 check_out date not null,
 guests integer not null check(guests between 1 and 30),
 package_key text not null default 'bed_only' check(package_key in ('bed_only','bed_breakfast','half_board','full_board')),
 customer_name text not null check(length(customer_name) between 2 and 120),
 customer_contact text not null check(length(customer_contact) between 7 and 180),
 note text not null default '' check(length(note)<=500),
 status text not null default 'pending' check(status in ('pending','available','unavailable','alternative_suggested','closed')),
 recommendation text not null default '' check(length(recommendation)<=1000),
 assigned_staff_id uuid,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint request_date_range check(check_out>check_in and check_out<=check_in+60)
);
create index if not exists hotel_website_room_requests_status_idx on public.hotel_website_room_requests(status,created_at desc);
alter table public.hotel_website_room_requests enable row level security;
grant select,update on public.hotel_website_room_requests to authenticated;
create policy "room_requests_admin_read" on public.hotel_website_room_requests for select to authenticated using ((select public.hotel_website_is_admin()));
create policy "room_requests_admin_update" on public.hotel_website_room_requests for update to authenticated using ((select public.hotel_website_is_admin())) with check ((select public.hotel_website_is_admin()));
-- Requests can only be inserted by the server-side Edge Function after validation.
-- No anonymous SELECT/UPDATE privilege, so customer contact details stay private.
