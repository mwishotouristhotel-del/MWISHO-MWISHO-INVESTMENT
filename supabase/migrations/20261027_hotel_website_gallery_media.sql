-- Hotel public gallery, isolated from POS stock, orders and bills.
create table if not exists public.hotel_website_gallery (
  id uuid primary key default gen_random_uuid(),
  title text not null default '' check (length(title)<=120),
  description text not null default '' check (length(description)<=500),
  media_type text not null check(media_type in ('photo','video')),
  object_path text not null unique,
  media_url text not null check(media_url like 'https://%'),
  mime_type text not null check(mime_type in ('image/jpeg','image/png','image/webp','video/mp4','video/webm')),
  file_size bigint not null check(file_size>0 and file_size<=10485760),
  is_published boolean not null default false,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists hotel_website_gallery_published_idx
  on public.hotel_website_gallery(is_published,display_order,created_at);
alter table public.hotel_website_gallery enable row level security;
grant select,insert,update,delete on public.hotel_website_gallery to authenticated;
create policy "hotel_gallery_admin_select" on public.hotel_website_gallery for select to authenticated
 using ((select public.hotel_website_is_admin()));
create policy "hotel_gallery_admin_insert" on public.hotel_website_gallery for insert to authenticated
 with check ((select public.hotel_website_is_admin()));
create policy "hotel_gallery_admin_update" on public.hotel_website_gallery for update to authenticated
 using ((select public.hotel_website_is_admin())) with check ((select public.hotel_website_is_admin()));
create policy "hotel_gallery_admin_delete" on public.hotel_website_gallery for delete to authenticated
 using ((select public.hotel_website_is_admin()));
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('mwisho-gallery','mwisho-gallery',true,10485760,
 array['image/jpeg','image/png','image/webp','video/mp4','video/webm'])
on conflict(id) do update set public=true,file_size_limit=10485760,
 allowed_mime_types=excluded.allowed_mime_types;
create policy "mwisho_gallery_admin_upload" on storage.objects for insert to authenticated
 with check(bucket_id='mwisho-gallery' and (select public.hotel_website_is_admin()));
create policy "mwisho_gallery_admin_remove" on storage.objects for delete to authenticated
 using(bucket_id='mwisho-gallery' and (select public.hotel_website_is_admin()));
create policy "mwisho_gallery_admin_read" on storage.objects for select to authenticated
 using(bucket_id='mwisho-gallery' and (select public.hotel_website_is_admin()));
-- Bucket media is public by design; publication of gallery entries is controlled by the public API.
