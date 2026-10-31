-- Keep signed guest-registration details on the stay record so PDF reprints
-- after check-in show the details entered by reception.
alter table public.hotel_accommodation_stays
 add column if not exists address text,
 add column if not exists arrival_time time without time zone,
 add column if not exists reason_for_visit text,
 add column if not exists accessibility_request text,
 add column if not exists remarks text;

-- Preserve the existing package validation, room locking, pricing, payment,
-- and reception-category guard while accepting the new optional form fields.
create or replace function public.hotel_accommodation_checkin_package(
 p_room uuid,p_listing uuid,p_package text,p_guests integer,p_guest jsonb,
 p_check_in date,p_check_out date,p_initial_payment numeric default 0,
 p_method text default 'cash',p_reference text default null
) returns uuid language plpgsql security definer set search_path='' as $$
declare
 v_room public.hotel_accommodation_rooms%rowtype;
 v_listing public.hotel_website_room_listings%rowtype;
 v_rate_details jsonb;
 v_rate numeric;
 v_total numeric;
 v_stay uuid;
begin
 if auth.uid() is null or not public.hotel_accommodation_can_reception() then
  raise exception 'Reception access required';
 end if;
 if p_check_in is null or p_check_out is null or p_check_out<=p_check_in or p_check_out>p_check_in+365 then
  raise exception 'Invalid accommodation date range';
 end if;
 select * into v_room from public.hotel_accommodation_rooms where id=p_room for update;
 if v_room.id is null or not v_room.active or v_room.housekeeping_status<>'ready' then
  raise exception 'Room is not available';
 end if;
 if exists(select 1 from public.hotel_accommodation_stays where room_id=p_room and status='checked_in') then
  raise exception 'Room is occupied';
 end if;
 if p_listing is null then
  if p_package is distinct from 'bed_only' or p_guests is distinct from 1 then
   raise exception 'Choose a website room type to use a meal package or multiple guests';
  end if;
  v_rate:=v_room.nightly_rate_kes;
 else
  select * into v_listing from public.hotel_website_room_listings where id=p_listing;
  if v_listing.id is null or v_listing.category<>v_room.category then
   raise exception 'Selected room type does not match the numbered room';
  end if;
  if p_guests is null or p_guests<1 or p_guests>v_listing.max_guests then
   raise exception 'Guest count exceeds room capacity';
  end if;
  if p_package not in ('bed_only','bed_breakfast','half_board','full_board') then
   raise exception 'Invalid accommodation package';
  end if;
  v_rate_details:=v_listing.package_rates->p_package;
  if v_rate_details is null then raise exception 'This room package is not configured'; end if;
  v_rate:=(v_rate_details->>'base_rate_kes')::numeric +
    (p_guests-1)*(v_rate_details->>'extra_guest_kes')::numeric;
 end if;
 v_total:=(p_check_out-p_check_in)*v_rate;
 if v_rate<0 or p_initial_payment is null or p_initial_payment<0 or p_initial_payment>v_total then
  raise exception 'Invalid accommodation charge or initial payment';
 end if;
 insert into public.hotel_accommodation_stays(room_id,listing_id,package_key,guest_count,
  guest_name,guest_id_number,guest_phone,nationality,country_of_residence,
  county_of_residence,email,vehicle_registration,address,arrival_time,
  reason_for_visit,accessibility_request,remarks,check_in_date,expected_check_out_date,
  nightly_rate_kes,created_by)
 values(p_room,p_listing,p_package,p_guests,
  nullif(trim(p_guest->>'guest_name'),''),nullif(trim(p_guest->>'guest_id_number'),''),
  nullif(trim(p_guest->>'guest_phone'),''),nullif(trim(p_guest->>'nationality'),''),
  nullif(trim(p_guest->>'country_of_residence'),''),nullif(trim(p_guest->>'county_of_residence'),''),
  nullif(trim(p_guest->>'email'),''),nullif(trim(p_guest->>'vehicle_registration'),''),
  nullif(trim(p_guest->>'address'),''),nullif(trim(p_guest->>'arrival_time'),'')::time,
  nullif(trim(p_guest->>'reason_for_visit'),''),nullif(trim(p_guest->>'accessibility_request'),''),
  nullif(trim(p_guest->>'remarks'),''),p_check_in,p_check_out,v_rate,auth.uid())
 returning id into v_stay;
 if p_initial_payment>0 then
  insert into public.hotel_accommodation_payments(stay_id,amount_kes,method,reference,received_by)
   values(v_stay,p_initial_payment,p_method,p_reference,auth.uid());
 end if;
 return v_stay;
end;
$$;
revoke all on function public.hotel_accommodation_checkin_package(uuid,uuid,text,integer,jsonb,date,date,numeric,text,text)
 from public,anon;
grant execute on function public.hotel_accommodation_checkin_package(uuid,uuid,text,integer,jsonb,date,date,numeric,text,text)
 to authenticated;
