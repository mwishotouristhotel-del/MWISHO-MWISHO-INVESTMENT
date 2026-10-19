-- Optional catalogue pictures; existing product and pricing functions remain unchanged.
create table if not exists public.hotel_product_images (
  product_id uuid primary key references public.products(id) on delete cascade,
  image_path text not null,
  updated_at timestamptz not null default now()
);
alter table public.hotel_product_images enable row level security;
create policy "hotel product image read" on public.hotel_product_images for select to authenticated using (true);
grant select on public.hotel_product_images to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('hotel-menu-photos','hotel-menu-photos',true,2097152,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=true,file_size_limit=2097152,allowed_mime_types=excluded.allowed_mime_types;

create policy "hotel manager photo uploads" on storage.objects for insert to authenticated
with check (bucket_id='hotel-menu-photos' and (storage.foldername(name))[1]=auth.uid()::text
  and exists(select 1 from public.staff_profiles s join public.staff_roles r on r.user_id=s.user_id
    left join public.departments d on d.id=r.department_id
    where s.user_id=auth.uid() and s.active and r.active
    and (r.role in ('director_admin','central_manager') or (d.code='HOTEL' and r.role='department_manager'))));
create policy "hotel menu photos public read" on storage.objects for select to public
using (bucket_id='hotel-menu-photos');

create or replace function public.hotel_set_menu_photo(p_product_id uuid,p_image_path text)
returns void language plpgsql security definer set search_path to '' as $fn$
declare v_dept uuid;
begin
  select id into v_dept from public.departments where code='HOTEL';
  if not exists(select 1 from public.staff_profiles s join public.staff_roles r on r.user_id=s.user_id
    where s.user_id=auth.uid() and s.active and r.active
    and (r.role in ('director_admin','central_manager') or (r.department_id=v_dept and r.role='department_manager')))
  then raise exception 'Hotel manager authorization required'; end if;
  if not exists(select 1 from public.products where id=p_product_id and department_id=v_dept)
  then raise exception 'Hotel menu product not found'; end if;
  if p_image_path is null or length(p_image_path)>500
    or split_part(p_image_path,'/',1)<>auth.uid()::text
    or p_image_path !~* '[.](jpe?g|png|webp)$'
  then raise exception 'Invalid photo path'; end if;
  insert into public.hotel_product_images(product_id,image_path)
  values (p_product_id,p_image_path)
  on conflict(product_id) do update set image_path=excluded.image_path,updated_at=now();
end;
$fn$;
revoke all on function public.hotel_set_menu_photo(uuid,text) from public;
grant execute on function public.hotel_set_menu_photo(uuid,text) to authenticated;
