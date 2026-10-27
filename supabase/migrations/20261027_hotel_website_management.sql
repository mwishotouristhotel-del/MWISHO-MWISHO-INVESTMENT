-- Additive customer website domain. Does not alter POS objects.
create table if not exists public.hotel_website_content (
  slug text primary key check (slug ~ '^[a-z0-9_-]{2,60}$'),
  title text not null default '',
  subtitle text not null default '',
  description text not null default '',
  image_url text not null default '',
  enabled boolean not null default true,
  display_order integer not null default 0,
  updated_at timestamptz not null default now()
);
create table if not exists public.hotel_website_settings (
  key text primary key check (key ~ '^[a-z0-9_-]{2,60}$'),
  value text not null default '',
  updated_at timestamptz not null default now()
);
create table if not exists public.hotel_website_traffic_daily (
  date date not null,
  page text not null check (length(page) between 1 and 100),
  views bigint not null default 0 check (views >= 0),
  primary key(date,page)
);
create index if not exists hotel_website_traffic_date_idx on public.hotel_website_traffic_daily(date desc);
alter table public.hotel_website_content enable row level security;
alter table public.hotel_website_settings enable row level security;
alter table public.hotel_website_traffic_daily enable row level security;
create or replace function public.hotel_website_is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.staff_roles
    where user_id=auth.uid() and active=true
      and role in ('director_admin','central_manager')
  )
$$;
revoke all on function public.hotel_website_is_admin() from public;
grant execute on function public.hotel_website_is_admin() to authenticated;
create policy "website_admin_manage_content" on public.hotel_website_content
 for all to authenticated using (public.hotel_website_is_admin()) with check (public.hotel_website_is_admin());
create policy "website_admin_manage_settings" on public.hotel_website_settings
 for all to authenticated using (public.hotel_website_is_admin()) with check (public.hotel_website_is_admin());
create policy "website_admin_view_traffic" on public.hotel_website_traffic_daily
 for select to authenticated using (public.hotel_website_is_admin());
insert into public.hotel_website_content(slug,title,subtitle,description,image_url,display_order)
values
 ('hero','Taste Of Class','WELCOME TO MWISHO TOURIST HOTEL','Relax in comfort, enjoy exceptional dining and celebrate life''s finest moments.','',0),
 ('regular-rooms','Regular Rooms','ACCOMMODATION','A relaxed retreat with comfort and convenience.','',10),
 ('vvip-rooms','VVIP Rooms','ENHANCED COMFORT','A more exclusive accommodation experience.','',20),
 ('extended-stay','Extended Stays','SPECIAL OCCASIONS','Ask about arrangements for longer visits.','',30),
 ('restaurant','Enjoy every bite','RESTAURANT','Discover our Regular and VVIP dining experiences.','',40),
 ('bar','Cheers to good times','BAR & LOUNGE','Relax at our bars and enjoy the atmosphere.','',50),
 ('conference','Conferences','BUSINESS','Explore meetings, workshops and conferences.','',60),
 ('night-club','Night Club','ENTERTAINMENT','Discover vibrant evenings and entertainment.','',70),
 ('private-events','Private Events','CELEBRATIONS','Plan your next special gathering.','',80)
on conflict(slug) do nothing;
insert into public.hotel_website_settings(key,value) values
 ('tagline','Taste Of Class'),('contact_phone',''),('contact_email',''),('whatsapp',''),
 ('facebook',''),('instagram',''),('booking_enabled','false')
on conflict(key) do nothing;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('mwisho-website','mwisho-website',true,5242880,array['image/png','image/jpeg','image/webp'])
on conflict(id) do nothing;
create policy "website_admin_upload" on storage.objects for insert to authenticated
 with check (bucket_id='mwisho-website' and public.hotel_website_is_admin());
create policy "website_admin_update" on storage.objects for update to authenticated
 using (bucket_id='mwisho-website' and public.hotel_website_is_admin())
 with check (bucket_id='mwisho-website' and public.hotel_website_is_admin());
create policy "website_admin_delete" on storage.objects for delete to authenticated
 using (bucket_id='mwisho-website' and public.hotel_website_is_admin());
create policy "website_public_images" on storage.objects for select to anon,authenticated
 using (bucket_id='mwisho-website');
-- service_role's edge function increments aggregated views without collecting IPs or identifiers.
create or replace function public.hotel_website_increment_view(p_page text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'not permitted';
  end if;
  if p_page !~ '^/[a-z0-9/_-]{0,95}$' then
    raise exception 'invalid page';
  end if;
  insert into public.hotel_website_traffic_daily(date,page,views)
    values((now() at time zone 'Africa/Nairobi')::date,p_page,1)
  on conflict(date,page) do update
    set views=public.hotel_website_traffic_daily.views+1;
end $$;
revoke all on function public.hotel_website_increment_view(text) from public,anon,authenticated;
grant execute on function public.hotel_website_increment_view(text) to service_role;
