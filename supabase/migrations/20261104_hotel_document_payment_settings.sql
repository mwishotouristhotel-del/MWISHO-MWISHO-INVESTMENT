-- One Admin-managed source for terms and approved payment accounts on documents.
create table if not exists public.hotel_document_settings(
 id integer primary key default 1 check(id=1),
 terms_text text not null default '' check(length(terms_text)<=5000),
 updated_at timestamptz not null default now()
);
insert into public.hotel_document_settings(id) values(1) on conflict do nothing;
alter table public.hotel_document_settings enable row level security;
grant select,insert,update on public.hotel_document_settings to authenticated;
create policy "hotel_document_settings_staff_read" on public.hotel_document_settings for select to authenticated
 using (public.hotel_website_is_admin() or exists(select 1 from public.staff_profiles p where p.user_id=auth.uid() and p.active=true));
create policy "hotel_document_settings_admin_insert" on public.hotel_document_settings for insert to authenticated
 with check (public.hotel_website_is_admin());
create policy "hotel_document_settings_admin_update" on public.hotel_document_settings for update to authenticated
 using (public.hotel_website_is_admin()) with check (public.hotel_website_is_admin());

create table if not exists public.hotel_document_payment_accounts(
 id uuid primary key default gen_random_uuid(),
 label text not null check(length(btrim(label)) between 2 and 100),
 account_type text not null check(account_type in ('bank','mpesa_till','mpesa_paybill','other')),
 details text not null check(length(btrim(details)) between 3 and 800),
 is_active boolean not null default true,
 show_on_invoice boolean not null default false,
 show_on_quotation boolean not null default false,
 display_order integer not null default 0,
 updated_at timestamptz not null default now()
);
alter table public.hotel_document_payment_accounts enable row level security;
grant select,insert,update,delete on public.hotel_document_payment_accounts to authenticated;
create policy "hotel_payment_accounts_staff_read" on public.hotel_document_payment_accounts for select to authenticated
 using (public.hotel_website_is_admin() or exists(select 1 from public.staff_profiles p where p.user_id=auth.uid() and p.active=true));
create policy "hotel_payment_accounts_admin_insert" on public.hotel_document_payment_accounts for insert to authenticated
 with check (public.hotel_website_is_admin());
create policy "hotel_payment_accounts_admin_update" on public.hotel_document_payment_accounts for update to authenticated
 using (public.hotel_website_is_admin()) with check (public.hotel_website_is_admin());
create policy "hotel_payment_accounts_admin_delete" on public.hotel_document_payment_accounts for delete to authenticated
 using (public.hotel_website_is_admin());
