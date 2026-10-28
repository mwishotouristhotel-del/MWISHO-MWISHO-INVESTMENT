alter table public.hotel_website_gallery
 add column if not exists thumbnail_url text not null default '',
 add column if not exists thumbnail_path text not null default '';
alter table public.hotel_website_gallery
 add constraint hotel_gallery_thumbnail_https check (thumbnail_url='' or thumbnail_url like 'https://%');
