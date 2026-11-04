-- Private, signed-off conference quotation documents. Existing requests are unaffected.
alter table public.hotel_website_conference_quotes
 add column if not exists quote_pdf_path text,
 add column if not exists quote_download_token uuid unique,
 add column if not exists quote_link_expires_at timestamptz,
 add column if not exists quote_published_at timestamptz,
 add column if not exists quote_published_by uuid;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('mwisho-conference-quotes','mwisho-conference-quotes',false,10485760,array['application/pdf'])
on conflict(id) do nothing;

create policy "conference_quote_assigned_pdf_upload" on storage.objects for insert to authenticated
with check (bucket_id='mwisho-conference-quotes' and
 (public.hotel_website_is_admin() or exists (
  select 1 from public.hotel_website_conference_quotes q
  where q.id::text=split_part(name,'/',1) and q.assigned_to=auth.uid()
  and exists(select 1 from public.staff_profiles p where p.user_id=auth.uid() and p.active=true)
 )));
