-- Conference quotation intake and assigned staff; completely separate from POS.
insert into public.hotel_website_conference_packages(name,description,display_order) values
 ('Breakfast Meeting','Breakfast meeting arrangements with refreshments. Request details and a tailored quotation.',70),
 ('Events Ground','Outdoor events ground hire for gatherings and celebrations. Request details and a tailored quotation.',80)
on conflict(name) do nothing;
update public.hotel_website_conference_packages set description='Includes buffet lunch with soft drinks; 10 AM and 4 PM tea; two 500 ml drinking-water bottles; writing materials; flipcharts; marker pens; sweets and mints; and Wi-Fi.',updated_at=now()
where name='Full Day Conference';
update public.hotel_website_conference_packages set description='Includes buffet lunch with soft drinks, 10 AM tea, one 500 ml drinking-water bottle, writing materials, flipcharts, marker pens, sweets and mints, and Wi-Fi. Excludes 4 PM tea and snack.',updated_at=now()
where name='Half Day Conference';
create table if not exists public.hotel_website_conference_quotes(
 id uuid primary key default gen_random_uuid(),
 organization_name text not null check(length(organization_name) between 2 and 150),
 organization_kra_pin text not null check(organization_kra_pin ~ '^[A-Z][0-9]{9}[A-Z]$'),
 number_of_pax integer not null check(number_of_pax between 1 and 10000),
 event_date date not null,
 package_id uuid references public.hotel_website_conference_packages(id) on delete set null,
 package_name text not null default '',
 requirements text not null default '' check(length(requirements)<=3000),
 organization_email text not null check(length(organization_email)<=254),
 organization_phone text not null check(length(organization_phone)<=30),
 contact_person text not null check(length(contact_person) between 2 and 120),
 contact_phone text not null check(length(contact_phone)<=30),
 cc_emails text[] not null default '{}',
 status text not null default 'new' check(status in ('new','assigned','preparing','quoted','closed')),
 assigned_to uuid references public.staff_profiles(user_id) on delete set null,
 assigned_by uuid,
 assigned_at timestamptz,
 admin_notes text not null default '' check(length(admin_notes)<=3000),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint quote_requirements_present check (package_id is not null or length(btrim(requirements))>=10),
 constraint quote_cc_limit check(cardinality(cc_emails)<=5)
);
create index if not exists conference_quote_status_idx on public.hotel_website_conference_quotes(status,created_at desc);
create index if not exists conference_quote_assigned_idx on public.hotel_website_conference_quotes(assigned_to);
alter table public.hotel_website_conference_quotes enable row level security;
grant select,update on public.hotel_website_conference_quotes to authenticated;
create policy "conference_quote_admin_read" on public.hotel_website_conference_quotes for select to authenticated using ((select public.hotel_website_is_admin()));
create policy "conference_quote_admin_update" on public.hotel_website_conference_quotes for update to authenticated using ((select public.hotel_website_is_admin())) with check ((select public.hotel_website_is_admin()));
-- Separately authorized staff can view their own assigned quote, not others.
create policy "conference_quote_assigned_read" on public.hotel_website_conference_quotes for select to authenticated using (assigned_to=auth.uid() and exists(select 1 from public.staff_profiles p where p.user_id=auth.uid() and p.active=true));
-- No public direct table writes. Public API validates and inserts via service role.
