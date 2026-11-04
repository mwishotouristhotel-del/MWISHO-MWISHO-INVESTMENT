-- Retain cancelled invoices and their reasons without affecting any POS or accommodation records.
alter table public.hotel_other_income_invoices
 add column if not exists cancellation_reason text,
 add column if not exists cancelled_at timestamptz,
 add column if not exists cancelled_by uuid references auth.users(id);

alter table public.hotel_other_income_invoices
 drop constraint if exists hotel_other_income_invoices_status_check;
alter table public.hotel_other_income_invoices
 add constraint hotel_other_income_invoices_status_check
 check (status in ('unpaid','partial','paid','cancelled'));

create or replace function public.hotel_other_income_cancel_invoice(p_invoice_id uuid,p_reason text)
returns void language plpgsql security definer set search_path=public as $$
declare v_invoice public.hotel_other_income_invoices%rowtype;
begin
 if auth.uid() is null or not public.hotel_website_is_admin() then raise exception 'Admin access required'; end if;
 if length(btrim(coalesce(p_reason,''))) not between 8 and 500 then raise exception 'Cancellation reason must contain 8 to 500 characters'; end if;
 select * into v_invoice from public.hotel_other_income_invoices where id=p_invoice_id for update;
 if not found then raise exception 'Invoice not found'; end if;
 if v_invoice.status<>'unpaid' or exists (select 1 from public.hotel_other_income_payments where invoice_id=p_invoice_id)
 then raise exception 'Only unpaid invoices without recorded payments can be cancelled'; end if;
 update public.hotel_other_income_invoices set status='cancelled',cancellation_reason=btrim(p_reason),cancelled_at=now(),cancelled_by=auth.uid()
 where id=p_invoice_id;
end;$$;

-- Existing payment entry point must reject cancelled documents, including direct RPC callers.
create or replace function public.hotel_other_income_record_payment(p_invoice_id uuid,p_amount numeric,p_method text,p_reference text,p_date date)
returns void language plpgsql security definer set search_path=public as $$
declare v_invoice public.hotel_other_income_invoices%rowtype;v_paid numeric;v_new_paid numeric;
begin
 if auth.uid() is null or not public.hotel_website_is_admin() then raise exception 'Admin access required';end if;
 select * into v_invoice from public.hotel_other_income_invoices where id=p_invoice_id for update;
 if not found then raise exception 'Invoice not found';end if;
 if v_invoice.status='cancelled' then raise exception 'Cancelled invoices cannot receive payments';end if;
 select coalesce(sum(amount_kes),0) into v_paid from public.hotel_other_income_payments where invoice_id=p_invoice_id;
 if p_amount is null or p_amount<=0 or p_amount>v_invoice.total_kes-v_paid then raise exception 'Payment must be positive and not exceed the outstanding balance';end if;
 if p_method not in ('cash','mpesa','bank','pdq','other') then raise exception 'Invalid payment method';end if;
 if p_method in ('mpesa','bank','pdq') and length(btrim(coalesce(p_reference,'')))<3 then raise exception 'Payment reference required';end if;
 insert into public.hotel_other_income_payments(invoice_id,amount_kes,method,payment_reference,payment_date,created_by)
 values(p_invoice_id,p_amount,p_method,coalesce(p_reference,''),coalesce(p_date,current_date),auth.uid());
 v_new_paid:=v_paid+p_amount;
 update public.hotel_other_income_invoices set status=case when v_new_paid>=total_kes then 'paid' else 'partial' end where id=p_invoice_id;
end;$$;

revoke all on function public.hotel_other_income_cancel_invoice(uuid,text) from public,anon;
grant execute on function public.hotel_other_income_cancel_invoice(uuid,text) to authenticated;
