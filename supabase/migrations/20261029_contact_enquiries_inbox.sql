create table if not exists public.hotel_website_contact_enquiries (
 id uuid primary key default gen_random_uuid(),
 customer_name text not null check (char_length(customer_name) between 2 and 120),
 customer_email text not null check (char_length(customer_email) between 5 and 254),
 topic text not null check (topic in ('Accommodation enquiry','Restaurant & Bar','Conference / Event','General enquiry')),
 message text not null check (char_length(message) between 5 and 2000),
 status text not null default 'new' check (status in ('new','in_progress','resolved')),
 staff_notes text not null default '' check (char_length(staff_notes)<=2000),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists hotel_website_contact_queue on public.hotel_website_contact_enquiries(status,created_at desc);
alter table public.hotel_website_contact_enquiries enable row level security;
grant select,update on public.hotel_website_contact_enquiries to authenticated;
create policy "website_contact_enquiries_admin_read" on public.hotel_website_contact_enquiries
 for select to authenticated using ((select public.hotel_website_is_admin()));
create policy "website_contact_enquiries_admin_update" on public.hotel_website_contact_enquiries
 for update to authenticated using ((select public.hotel_website_is_admin()))
 with check ((select public.hotel_website_is_admin()));
-- Public submissions use the server-side endpoint; no public table INSERT permission.
