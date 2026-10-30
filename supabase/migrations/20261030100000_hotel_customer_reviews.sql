-- Customer-submitted testimonials. Only hotel administrators can moderate entries.
create table if not exists public.hotel_website_reviews (
 id uuid primary key default gen_random_uuid(),
 customer_name text not null check (char_length(customer_name) between 2 and 100),
 rating integer not null check (rating between 1 and 5),
 review_text text not null check (char_length(review_text) between 10 and 1200),
 visit_type text not null check (visit_type in ('Accommodation','Restaurant & Bar','Conference & Events','General Experience')),
 status text not null default 'pending' check (status in ('pending','approved','rejected')),
 created_at timestamptz not null default now(),
 reviewed_at timestamptz,
 reviewed_by uuid references auth.users(id)
);
create index if not exists hotel_website_reviews_published_idx on public.hotel_website_reviews(created_at desc) where status='approved';
create index if not exists hotel_website_reviews_moderation_idx on public.hotel_website_reviews(status,created_at desc);
alter table public.hotel_website_reviews enable row level security;
create policy "hotel_reviews_admin_select" on public.hotel_website_reviews for select to authenticated using ((select public.hotel_website_is_admin()));
create policy "hotel_reviews_admin_update" on public.hotel_website_reviews for update to authenticated using ((select public.hotel_website_is_admin())) with check ((select public.hotel_website_is_admin()));
grant select,update on public.hotel_website_reviews to authenticated;
-- Public submissions and public approved reads are mediated by the website Edge Function.
