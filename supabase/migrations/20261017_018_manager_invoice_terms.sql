create or replace function public.hotel_review_invoice(p_request uuid,p_approve boolean,p_note text default null,p_terms text default null)
returns void language plpgsql security definer set search_path='' as $f$
declare v_invoice public.hotel_invoice_requests%rowtype;v_terms text;
begin
 if not exists(select 1 from public.staff_profiles s join public.staff_roles r on r.user_id=s.user_id and r.active where s.user_id=auth.uid() and s.active and
 (r.role in ('director_admin','central_manager') or (r.role='department_manager' and r.department_id=(select id from public.departments where code='HOTEL'))))
 then raise exception 'Manager authorization required';end if;
 select * into v_invoice from public.hotel_invoice_requests where id=p_request for update;
 if not found or v_invoice.status<>'pending' then raise exception 'Invoice request not pending';end if;
 if v_invoice.requested_by=auth.uid() then raise exception 'Cannot approve own request';end if;
 if not exists(select 1 from public.hotel_bills where id=v_invoice.bill_id and status='open' and cancellation_status<>'pending') then raise exception 'Bill unavailable';end if;
 v_terms:=trim(coalesce(p_terms,v_invoice.payment_terms));
 if length(v_terms)<5 or length(v_terms)>1000 then raise exception 'Payment terms must be 5–1000 characters';end if;
 update public.hotel_invoice_requests set status=case when p_approve then 'approved' else 'rejected' end,
 payment_terms=v_terms,reviewed_by=auth.uid(),reviewed_at=now(),review_note=nullif(trim(coalesce(p_note,'')),'') where id=p_request;
end $f$;
revoke all on function public.hotel_review_invoice(uuid,boolean,text,text) from public,anon;
grant execute on function public.hotel_review_invoice(uuid,boolean,text,text) to authenticated;
revoke all on function public.hotel_review_invoice(uuid,boolean,text) from authenticated;