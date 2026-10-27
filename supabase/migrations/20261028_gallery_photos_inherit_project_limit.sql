-- Gallery photos inherit project-wide Supabase upload ceiling.
-- Gallery videos retain the 10 MiB application/database limit.
alter table public.hotel_website_gallery
 drop constraint if exists hotel_website_gallery_file_size_check;
alter table public.hotel_website_gallery
 add constraint hotel_website_gallery_file_size_check check (
  file_size > 0
  and (media_type='photo' or (media_type='video' and file_size<=10485760))
 );
update storage.buckets
 set file_size_limit=null
 where id='mwisho-gallery';
