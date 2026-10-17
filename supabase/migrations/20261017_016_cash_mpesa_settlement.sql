create or replace function public.hotel_clear_bill(p_bill uuid,p_method text,p_reference text,p_cash_received numeric)
returns jsonb language plpgsql security definer set search_path='' as $f$
declare b public.hotel_bills%rowtype;v_total numeric;v_change numeric;v_result jsonb;
begin
 select * into b from public.hotel_bills where id=p_bill for update;
 if not found or b.status<>'open' or b.cancellation_status='pending' then raise exception 'Bill is closed or pending cancellation';end if;
 if p_method not in ('cash','mpesa') then raise exception 'Unsupported payment method';end if;
 if not exists(select 1 from public.hotel_orders where bill_id=p_bill and status<>'cancelled') then raise exception 'Empty bill';end if;
 if exists(select 1 from public.hotel_orders o where o.bill_id=p_bill and o.status<>'cancelled' and
 (o.payment_status<>'unpaid' or not exists(select 1 from public.cashier_assignments a join public.staff_profiles s on s.user_id=a.cashier_id and s.active
 join public.staff_roles r on r.user_id=s.user_id and r.active and r.role='cashier'
 join public.counters c on c.id=a.counter_id
 where a.counter_id=o.counter_id and a.cashier_id=auth.uid() and a.ends_at is null and r.department_id=c.department_id)))
 then raise exception 'Cashier not assigned to every unpaid order';end if;
 select sum(total) into v_total from public.hotel_orders where bill_id=p_bill and status<>'cancelled';
 if p_method='cash' then
 if p_cash_received is null or p_cash_received<v_total then raise exception 'Cash received is less than bill';end if;
 v_change:=p_cash_received-v_total;
 else
 if p_cash_received is not null or trim(coalesce(p_reference,'')) !~ '^[A-Za-z0-9]{8,15}$' then raise exception 'Valid M-Pesa reference required';end if;
 if exists(select 1 from public.hotel_bills where status='paid' and payment_method='mpesa' and upper(trim(payment_reference))=upper(trim(p_reference))) then raise exception 'M-Pesa reference already used';end if;
 end if;
 v_result:=public.hotel_bill_preview(p_bill);
 update public.hotel_orders set payment_status='paid',paid_at=now(),paid_by=auth.uid(),payment_method=p_method,payment_reference=case when p_method='mpesa' then upper(trim(p_reference)) else null end where bill_id=p_bill and status<>'cancelled';
 update public.hotel_bills set status='paid',closed_at=now(),paid_by=auth.uid(),payment_method=p_method,payment_reference=case when p_method='mpesa' then upper(trim(p_reference)) else null end,cash_received=p_cash_received,change_due=v_change where id=p_bill;
 return v_result||jsonb_build_object('payment_method',p_method,'payment_reference',case when p_method='mpesa' then upper(trim(p_reference)) else null end,'cash_received',p_cash_received,'change_due',v_change,'paid_at',now(),'cashier',(select display_name from public.staff_profiles where user_id=auth.uid()));
end $f$;
revoke all on function public.hotel_clear_bill(uuid,text,text,numeric) from public,anon;
grant execute on function public.hotel_clear_bill(uuid,text,text,numeric) to authenticated;
revoke all on function public.hotel_clear_bill(uuid,text,text) from authenticated;