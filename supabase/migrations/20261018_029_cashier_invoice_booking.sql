create or replace function public.hotel_book_invoice(p_bill uuid,p_organization text)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_bill public.hotel_bills%rowtype;v_snapshot jsonb;v_id uuid;
begin
if not exists(select 1 from public.staff_profiles p join public.staff_roles r on r.user_id=p.user_id where p.user_id=auth.uid() and p.active and r.active and r.role='cashier' and r.department_id=(select id from public.departments where code='HOTEL')) then raise exception 'Hotel cashier authorization required' using errcode='42501';end if;
if length(trim(coalesce(p_organization,'')))<2 or length(trim(p_organization))>180 then raise exception 'Enter organization name';end if;
select * into v_bill from public.hotel_bills where id=p_bill for update;
if not found or v_bill.status<>'open' or v_bill.cancellation_status='pending' then raise exception 'Bill unavailable for invoice booking';end if;
if exists(select 1 from public.hotel_invoice_requests where bill_id=p_bill and status in ('pending','approved')) then raise exception 'Invoice already booked or created';end if;
v_snapshot:=public.hotel_bill_preview(p_bill);
if v_snapshot is null or coalesce((v_snapshot->>'total')::numeric,0)<=0 then raise exception 'Bill has no chargeable amount';end if;
insert into public.hotel_invoice_requests(bill_id,organization_name,kra_pin,proposed_payment_method,payment_terms,requested_by,snapshot)
values(p_bill,trim(p_organization),'','bank_transfer','Pending Admin/Director invoice creation',auth.uid(),v_snapshot) returning id into v_id;
return v_id;
end $$;
revoke all on function public.hotel_book_invoice(uuid,text) from public,anon;
grant execute on function public.hotel_book_invoice(uuid,text) to authenticated;