-- Additive media collection for website room listings (no POS changes).
alter table public.hotel_website_room_listings
 add column if not exists room_photos jsonb not null default '[]'::jsonb;
alter table public.hotel_website_room_listings
 add constraint hotel_room_photos_valid check (
 jsonb_typeof(room_photos)='array'
 and jsonb_array_length(room_photos)<=5
 and not jsonb_path_exists(room_photos, '$[*] ? (@.url.type() != "string" || @.path.type() != "string")')
);
comment on column public.hotel_website_room_listings.room_photos is 'Up to 5 ordered public room images, each {url,path}; first is cover image.';
