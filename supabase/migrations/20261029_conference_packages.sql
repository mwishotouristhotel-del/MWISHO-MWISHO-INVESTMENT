create table if not exists public.hotel_website_conference_packages(
 id uuid primary key default gen_random_uuid(),
 name text not null unique check(length(name) between 2 and 100),
 description text not null default '' check(length(description)<=800),
 price_kes numeric(12,2) check(price_kes is null or price_kes>=0),
 price_unit text not null default '' check(length(price_unit)<=40),
 is_published boolean not null default true,
 display_order integer not null default 0,
 updated_at timestamptz not null default now()
);
alter table public.hotel_website_conference_packages enable row level security;
grant select,insert,update,delete on public.hotel_website_conference_packages to authenticated;
create policy "conference_admin_read" on public.hotel_website_conference_packages for select to authenticated using ((select public.hotel_website_is_admin()));
create policy "conference_admin_insert" on public.hotel_website_conference_packages for insert to authenticated with check ((select public.hotel_website_is_admin()));
create policy "conference_admin_update" on public.hotel_website_conference_packages for update to authenticated using ((select public.hotel_website_is_admin())) with check ((select public.hotel_website_is_admin()));
create policy "conference_admin_delete" on public.hotel_website_conference_packages for delete to authenticated using ((select public.hotel_website_is_admin()));
insert into public.hotel_website_conference_packages(name,description,display_order)
values
('Full Day Conference','Conference facilities for full-day meetings and workshops.',10),
('Half Day Conference','Meeting and conference facilities for half-day sessions.',20),
('Hall Hire — Non-Residential','Hire the conference hall without accommodation.',30),
('LCD Projector Hire','Projector hire for presentations and meetings.',40),
('Buffet Lunch / Dinner','Buffet catering available for conference guests.',50),
('Mineral Water','Bottled mineral water for meetings and events.',60)
on conflict(name) do nothing;