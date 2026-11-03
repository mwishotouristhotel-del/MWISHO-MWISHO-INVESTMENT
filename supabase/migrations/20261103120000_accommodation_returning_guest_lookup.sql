-- Return only registration details to authenticated accommodation reception staff.
-- Reuse existing stay records rather than introducing independently stale profiles.
create or replace function public.hotel_accommodation_find_returning_guests(p_query text)
returns table (
 guest_name text, guest_id_number text, guest_phone text, address text,
 nationality text, country_of_residence text, county_of_residence text,
 email text, vehicle_registration text, accessibility_request text,
 last_visit date
)
language plpgsql stable security definer set search_path = '' as $$
declare v_query text := btrim(coalesce(p_query,''));
declare v_digits text := regexp_replace(coalesce(p_query,''),'[^0-9]','','g');
begin
 if auth.uid() is null or not public.hotel_accommodation_can_reception() then
  raise exception 'Reception access required';
 end if;
 if char_length(v_query) < 3 or char_length(v_query) > 100 then return; end if;
 return query
 with candidates as (
  select s.guest_name,s.guest_id_number,s.guest_phone,s.address,
   s.nationality,s.country_of_residence,s.county_of_residence,s.email,
   s.vehicle_registration,s.accessibility_request,s.check_in_date,s.created_at,
   row_number() over(partition by coalesce(
    nullif(lower(btrim(s.guest_id_number)),''),
    nullif(right(regexp_replace(coalesce(s.guest_phone,''),'[^0-9]','','g'),9),''),
    lower(btrim(s.guest_name))) order by s.created_at desc) as rank
  from public.hotel_accommodation_stays s
  where (char_length(v_digits)>=9 and right(regexp_replace(coalesce(s.guest_phone,''),'[^0-9]','','g'),9)=right(v_digits,9))
     or lower(btrim(s.guest_id_number))=lower(v_query)
     or (char_length(v_query)>=3 and position(lower(v_query) in lower(s.guest_name))>0)
 )
 select c.guest_name,c.guest_id_number,c.guest_phone,c.address,
  c.nationality,c.country_of_residence,c.county_of_residence,c.email,
  c.vehicle_registration,c.accessibility_request,c.check_in_date
 from candidates c where c.rank=1 order by c.created_at desc limit 10;
end;$$;
revoke all on function public.hotel_accommodation_find_returning_guests(text) from public,anon,authenticated;
grant execute on function public.hotel_accommodation_find_returning_guests(text) to authenticated;
