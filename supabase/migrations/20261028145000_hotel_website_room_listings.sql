-- MWISHO Tourist Hotel: room listing catalogue (not a reservation ledger).
-- Isolated from POS, stock, staff and accommodation bookings.
create table if not exists public.hotel_website_room_listings (
 id uuid primary key default gen_random_uuid(),
 category text not null default 'regular' check (category in ('regular','vvip','extended')),
 name text not null check (char_length(trim(name)) between 2 and 120),
 description text not null default '' check (char_length(description) <= 1500),
 nightly_rate_kes numeric(12,2) not null check (nightly_rate_kes >= 0 and nightly_rate_kes <= 10000000),
 max_guests integer not null default 2 check (max_guests between 1 and 30),
 amenities text[] not null default '{}'::text[],
 image_url text not null default '' check (image_url = '' or (length(image_url) <= 2048 and image_url ~ '^https://')),
 image_storage_path text not null default '',
 is_published boolean not null default false,
 display_order integer not null default 100,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists hotel_website_room_listings_public_order_idx
 on public.hotel_website_room_listings(category,display_order,created_at) where is_published;
alter table public.hotel_website_room_listings enable row level security;
revoke all on public.hotel_website_room_listings from anon,authenticated;
grant select,insert,update,delete on public.hotel_website_room_listings to authenticated;
create policy hotel_room_listings_admin_select on public.hotel_website_room_listings
 for select to authenticated using ((select public.hotel_website_is_admin()));
create policy hotel_room_listings_admin_insert on public.hotel_website_room_listings
 for insert to authenticated with check ((select public.hotel_website_is_admin()));
create policy hotel_room_listings_admin_update on public.hotel_website_room_listings
 for update to authenticated using ((select public.hotel_website_is_admin()))
 with check ((select public.hotel_website_is_admin()));
create policy hotel_room_listings_admin_delete on public.hotel_website_room_listings
 for delete to authenticated using ((select public.hotel_website_is_admin()));
comment on table public.hotel_website_room_listings is
 'Public-catalogue descriptions and indicative nightly rates. Not inventory, bookings, holds, or confirmed availability.';
