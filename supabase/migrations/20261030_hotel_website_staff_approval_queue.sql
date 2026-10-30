-- Staff may propose customer-facing website changes, never publish them directly.
-- Existing website and POS tables and their RLS policies are left unchanged.
create table if not exists public.hotel_website_staff_permissions (
  staff_id uuid not null references public.staff_profiles(user_id) on delete cascade,
  area text not null check (area in ('service_cards','website_settings','rooms','gallery','promotions','events','conference','restaurant','reviews','contact')),
  granted_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  primary key(staff_id,area)
);
create table if not exists public.hotel_website_staff_submissions (
  id uuid primary key default gen_random_uuid(),
  submitted_by uuid not null default auth.uid() references public.staff_profiles(user_id),
  area text not null check (area in ('service_cards','website_settings','rooms','gallery','promotions','events','conference','restaurant','reviews','contact')),
  title text not null check (length(trim(title)) between 3 and 150),
  details text not null check (length(trim(details)) between 5 and 6000),
  proposed_url text not null default '' check (proposed_url='' or (length(proposed_url)<=2048 and proposed_url like 'https://%')),
  status text not null default 'pending' check (status in ('pending','changes_requested','rejected','approved','published')),
  admin_comment text not null default '',
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists website_staff_submissions_queue_idx on public.hotel_website_staff_submissions(status,created_at desc);
create index if not exists website_staff_submissions_owner_idx on public.hotel_website_staff_submissions(submitted_by,created_at desc);
alter table public.hotel_website_staff_permissions enable row level security;
alter table public.hotel_website_staff_submissions enable row level security;
grant select,insert,delete on public.hotel_website_staff_permissions to authenticated;
grant select,insert,update on public.hotel_website_staff_submissions to authenticated;

create policy website_staff_permissions_read on public.hotel_website_staff_permissions for select to authenticated
 using (staff_id=(select auth.uid()) or (select public.hotel_website_is_admin()));
create policy website_staff_permissions_admin_insert on public.hotel_website_staff_permissions for insert to authenticated
 with check ((select public.hotel_website_is_admin()) and granted_by=(select auth.uid()));
create policy website_staff_permissions_admin_delete on public.hotel_website_staff_permissions for delete to authenticated
 using ((select public.hotel_website_is_admin()));
create policy website_staff_submissions_read on public.hotel_website_staff_submissions for select to authenticated
 using (submitted_by=(select auth.uid()) or (select public.hotel_website_is_admin()));
create policy website_staff_submissions_create on public.hotel_website_staff_submissions for insert to authenticated
 with check (submitted_by=(select auth.uid()) and status='pending' and admin_comment='' and reviewed_by is null and reviewed_at is null and published_at is null
 and exists (select 1 from public.hotel_website_staff_permissions p where p.staff_id=(select auth.uid()) and p.area=hotel_website_staff_submissions.area));
-- Staff cannot modify a submitted record or approve it, including via direct API calls.
-- All review transitions are handled by the restricted RPC below.

create or replace function public.hotel_website_review_staff_submission(p_id uuid,p_action text,p_comment text default '')
returns void language plpgsql security definer set search_path='' as $$
declare v_status text;
begin
 if auth.uid() is null or not public.hotel_website_is_admin() then raise exception 'Website administrator required'; end if;
 if p_action not in ('approved','rejected','changes_requested','published') then raise exception 'Invalid review action'; end if;
 if p_action in ('rejected','changes_requested') and length(trim(coalesce(p_comment,'')))<3 then raise exception 'Please explain the changes required'; end if;
 select status into v_status from public.hotel_website_staff_submissions where id=p_id for update;
 if not found then raise exception 'Submission not found'; end if;
 if (v_status <> 'pending' and p_action <> 'published') or (p_action='published' and v_status<>'approved') then
   raise exception 'Invalid review transition';
 end if;
 update public.hotel_website_staff_submissions set status=p_action,admin_comment=left(coalesce(p_comment,''),2000),
  reviewed_by=auth.uid(),reviewed_at=now(),published_at=case when p_action='published' then now() else null end,updated_at=now()
 where id=p_id;
end $$;
revoke all on function public.hotel_website_review_staff_submission(uuid,text,text) from public,anon;
grant execute on function public.hotel_website_review_staff_submission(uuid,text,text) to authenticated;

create or replace function public.hotel_website_resubmit_staff_submission(p_id uuid,p_title text,p_details text,p_url text default '')
returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Sign in required'; end if;
 if length(trim(coalesce(p_title,''))) not between 3 and 150 or length(trim(coalesce(p_details,''))) not between 5 and 6000
 or (coalesce(p_url,'')<>'' and (length(p_url)>2048 or p_url not like 'https://%')) then raise exception 'Invalid draft'; end if;
 update public.hotel_website_staff_submissions set title=trim(p_title),details=trim(p_details),proposed_url=coalesce(p_url,''),status='pending',
  admin_comment='',reviewed_by=null,reviewed_at=null,updated_at=now()
 where id=p_id and submitted_by=auth.uid() and status='changes_requested'
 and exists (select 1 from public.hotel_website_staff_permissions p where p.staff_id=auth.uid() and p.area=public.hotel_website_staff_submissions.area);
 if not found then raise exception 'Changes cannot be resubmitted'; end if;
end $$;
revoke all on function public.hotel_website_resubmit_staff_submission(uuid,text,text,text) from public,anon;
grant execute on function public.hotel_website_resubmit_staff_submission(uuid,text,text,text) to authenticated;
