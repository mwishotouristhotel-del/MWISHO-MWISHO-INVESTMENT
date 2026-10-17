create or replace function public.hotel_create_booked_invoice(p_request uuid,p_kra_pin text,p_po text,p_payment_method text,p_terms text)
returns void language plpgsql security definer set search_path='' as $$
declare v public.hotel_invoice_requests%rowtype;
begin
if not exists(select 1 from public.staff_profiles s join public.staff_roles r on r.user_id=s.user_id where s.user_id=auth.uid() and s.active and r.active and r.role in ('director_admin','central_manager')) then raise exception 'Only Admin/Director can create invoices' using errcode='42501';end if;
select * into v from public.hotel_invoice_requests where id=p_request for update;
if not found or v.status<>'pending' then raise exception 'Invoice booking not pending';end if;
if not exists(select 1 from public.hotel_bills b where b.id=v.bill_id and b.status='open' and b.cancellation_status<>'pending') then raise exception 'Original bill is no longer open';end if;
if length(trim(coalesce(p_terms,'')))<5 then raise exception 'Enter payment terms';end if;
if p_payment_method not in ('cash','mpesa','bank_transfer','other') then raise exception 'Invalid payment method';end if;
if p_kra_pin is not null and length(trim(p_kra_pin))>0 and length(trim(p_kra_pin))<5 then raise exception 'Invalid KRA PIN';end if;
update public.hotel_invoice_requests set kra_pin=upper(trim(coalesce(p_kra_pin,''))),purchase_order_number=nullif(trim(coalesce(p_po,'')),''),proposed_payment_method=p_payment_method,payment_terms=trim(p_terms),status='approved',reviewed_by=auth.uid(),reviewed_at=now() where id=p_request;
end $$;
revoke all on function public.hotel_create_booked_invoice(uuid,text,text,text,text) from public,anon;
grant execute on function public.hotel_create_booked_invoice(uuid,text,text,text,text) to authenticated;
revoke execute on function public.hotel_request_invoice(uuid,text,text,text,text,text) from authenticated;
revoke execute on function public.hotel_review_invoice(uuid,boolean,text),public.hotel_review_invoice(uuid,boolean,text,text) from authenticated;
