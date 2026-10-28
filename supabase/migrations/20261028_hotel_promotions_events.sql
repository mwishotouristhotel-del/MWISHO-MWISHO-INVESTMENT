-- Dedicated hotel customer-site promotions; no changes to POS operational tables.
create table if not exists public.hotel_website_promotions (
 id uuid primary key default gen_random_uuid(),
 kind text not null check(kind in ('advertisement','event')),
 title text not null check(length(title) between 1 and 150),
 description text not null default '' check(length(description)<=1000),
 media_type text not null check(media_type in ('image','video')),
 media_url text not null check(media_url like 'https://%'),
 media_path text not null,
 action_label text not null default '' check(length(action_label)<=40),
 action_url text not null default '' check(action_url='' or action_url like 'https://%'),
 event_date timestamptz,
 starts_at timestamptz,
 ends_at timestamptz,
 popup_enabled boolean not null default false,
 popup_mode text not null default 'manual' check(popup_mode in ('five_seconds','manual')),
 is_published boolean not null default false,
 display_order integer not null default 0,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint promotion_dates_order check(ends_at is null or starts_at is null or ends_at>starts_at)
);
create index if not exists hotel_website_promotions_visibility_idx on public.hotel_website_promotions(is_published,display_order,starts_at,ends_at);
alter table public.hotel_website_promotions enable row level security;
grant select,insert,update,delete on public.hotel_website_promotions to authenticated;
create policy "hotel_promotions_admin_read" on public.hotel_website_promotions for select to authenticated using ((select public.hotel_website_is_admin()));
create policy "hotel_promotions_admin_insert" on public.hotel_website_promotions for insert to authenticated with check ((select public.hotel_website_is_admin()));
create policy "hotel_promotions_admin_update" on public.hotel_website_promotions for update to authenticated using ((select public.hotel_website_is_admin())) with check ((select public.hotel_website_is_admin()));
create policy "hotel_promotions_admin_delete" on public.hotel_website_promotions for delete to authenticated using ((select public.hotel_website_is_admin()));
-- Existing dedicated gallery bucket supports image and short video uploads; no new storage exposure.
