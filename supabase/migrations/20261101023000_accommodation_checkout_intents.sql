-- Check-out can release the room while a complimentary decision or a
-- company invoice is still pending. Neither option is a cash receipt.
alter table public.hotel_accommodation_stays
 add column if not exists invoice_organization_name text;

alter table public.hotel_accommodation_complimentary_requests
 add column if not exists stated_approver_name text,
 add column if not exists stated_approver_designation text;

-- A receptionist's typed approver identity is an audit note, not approval.
-- The existing management review RPC still performs the authorization.
create or replace function public.hotel_accommodation_checkout_complimentary(
 p_stay uuid,p_amount numeric,p_reason text,p_approver_name text,p_approver_designation text
) returns uuid language plpgsql security definer set search_path='' as $$
declare v_stay public.hotel_accommodation_stays;v_paid numeric;v_id uuid;
begin
 v_stay:=public.hotel_accommodation_assert_stay_scope(p_stay);
 if v_stay.status<>'checked_in' then raise exception 'Guest is not checked in'; end if;
 if length(btrim(coalesce(p_reason,'')))<5 then raise exception 'Provide the complimentary reason'; end if;
 if length(btrim(coalesce(p_approver_name,'')))<2
  or length(btrim(coalesce(p_approver_designation,'')))<2 then
  raise exception 'Enter the stated approver name and designation';
 end if;
 if length(p_approver_name)>120 or length(p_approver_designation)>120 then
  raise exception 'Approver details are too long';
 end if;
 select coalesce(sum(amount_kes),0) into v_paid
 from public.hotel_accommodation_payments where stay_id=p_stay;
 if p_amount is null or p_amount<=0 or p_amount<>v_stay.total_kes-v_paid then
  raise exception 'Complimentary request must cover the outstanding checkout balance';
 end if;
 insert into public.hotel_accommodation_complimentary_requests
  (stay_id,amount_kes,reason,stated_approver_name,stated_approver_designation,requested_by)
 values (p_stay,p_amount,btrim(p_reason),btrim(p_approver_name),
  btrim(p_approver_designation),auth.uid()) returning id into v_id;
 update public.hotel_accommodation_stays
 set status='checked_out',actual_check_out_date=(now() at time zone 'Africa/Nairobi')::date,
  checked_out_by=auth.uid() where id=p_stay;
 update public.hotel_accommodation_rooms
 set housekeeping_status='dirty',updated_at=now() where id=v_stay.room_id;
 return v_id;
end;$$;

create or replace function public.hotel_accommodation_checkout_invoice(
 p_stay uuid,p_organization text
) returns void language plpgsql security definer set search_path='' as $$
declare v_stay public.hotel_accommodation_stays;v_paid numeric;
begin
 v_stay:=public.hotel_accommodation_assert_stay_scope(p_stay);
 if v_stay.status<>'checked_in' then raise exception 'Guest is not checked in'; end if;
 if length(btrim(coalesce(p_organization,'')))<2 or length(p_organization)>180 then
  raise exception 'Enter the invoiced organization name';
 end if;
 select coalesce(sum(amount_kes),0) into v_paid
 from public.hotel_accommodation_payments where stay_id=p_stay;
 if v_stay.total_kes-v_paid<=0 then raise exception 'This stay has no outstanding balance to invoice'; end if;
 update public.hotel_accommodation_stays
 set status='checked_out',actual_check_out_date=(now() at time zone 'Africa/Nairobi')::date,
  checked_out_by=auth.uid(),invoice_organization_name=btrim(p_organization)
 where id=p_stay;
 update public.hotel_accommodation_rooms
 set housekeeping_status='dirty',updated_at=now() where id=v_stay.room_id;
end;$$;

-- Prevent accidentally combining rooms under the wrong organization's bill.
create or replace function public.hotel_accommodation_guard_invoice_organization()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_expected text;v_actual text;
begin
 select invoice_organization_name into v_expected
 from public.hotel_accommodation_stays where id=new.stay_id;
 select organization_name into v_actual
 from public.hotel_accommodation_invoices where id=new.invoice_id;
 if v_expected is not null and lower(btrim(v_expected))<>lower(btrim(v_actual)) then
  raise exception 'Room was marked for a different invoice organization';
 end if;
 return new;
end;$$;
drop trigger if exists hotel_invoice_organization_guard on public.hotel_accommodation_invoice_items;
create trigger hotel_invoice_organization_guard before insert
on public.hotel_accommodation_invoice_items for each row
execute function public.hotel_accommodation_guard_invoice_organization();

-- Management may approve or reject after the guest has physically departed.
-- A recorded complimentary payment still requires a different authorized reviewer.
create or replace function public.hotel_accommodation_review_complimentary(p_request uuid,p_approve boolean)
returns void language plpgsql security definer set search_path='' as $$
declare v_request public.hotel_accommodation_complimentary_requests;
 v_stay public.hotel_accommodation_stays;v_paid numeric;
begin
 if auth.uid() is null or not public.hotel_accommodation_can_manage_all() then
  raise exception 'Management approval required';
 end if;
 select * into v_request from public.hotel_accommodation_complimentary_requests
 where id=p_request for update;
 if v_request.id is null or v_request.status<>'pending' then raise exception 'Request is not pending'; end if;
 if v_request.requested_by=auth.uid() then raise exception 'A requester cannot approve their own complimentary clearance'; end if;
 select * into v_stay from public.hotel_accommodation_stays where id=v_request.stay_id for update;
 if p_approve then
  if v_stay.status not in ('checked_in','checked_out') then raise exception 'Stay cannot be cleared'; end if;
  select coalesce(sum(amount_kes),0) into v_paid from public.hotel_accommodation_payments where stay_id=v_stay.id;
  if v_request.amount_kes>v_stay.total_kes-v_paid then raise exception 'Outstanding balance changed'; end if;
  insert into public.hotel_accommodation_payments(stay_id,amount_kes,method,reference,received_by)
  values(v_stay.id,v_request.amount_kes,'complimentary','Approved complimentary '||p_request::text,auth.uid());
 end if;
 update public.hotel_accommodation_complimentary_requests
 set status=case when p_approve then 'approved' else 'rejected' end,
  reviewed_by=auth.uid(),reviewed_at=now() where id=p_request;
end;$$;

revoke all on function public.hotel_accommodation_checkout_complimentary(uuid,numeric,text,text,text) from public,anon;
revoke all on function public.hotel_accommodation_checkout_invoice(uuid,text) from public,anon;
revoke all on function public.hotel_accommodation_guard_invoice_organization() from public,anon,authenticated;
grant execute on function public.hotel_accommodation_checkout_complimentary(uuid,numeric,text,text,text) to authenticated;
grant execute on function public.hotel_accommodation_checkout_invoice(uuid,text) to authenticated;
