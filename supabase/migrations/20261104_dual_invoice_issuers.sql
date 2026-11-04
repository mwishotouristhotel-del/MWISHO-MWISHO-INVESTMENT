-- Keep legacy invoices under the hotel issuer and preserve their payment workflows.
alter table public.hotel_other_income_invoices
 add column if not exists issuer_entity text not null default 'hotel'
 check (issuer_entity in ('hotel','investment'));

alter table public.hotel_document_settings
 add column if not exists investment_company_details jsonb not null default '{}'::jsonb
 check (jsonb_typeof(investment_company_details)='object');

-- Separate RPC retains the validated, transactional legacy create routine.
-- Updating the issuer in the same transaction avoids partially issued invoices.
create or replace function public.hotel_other_income_create_invoice_for_entity(
 p_issuer text,p_category text,p_bill_to text,p_contact text,p_address text,
 p_kra_pin text,p_date date,p_due_date date,p_description text,p_items jsonb
)
returns text language plpgsql security definer set search_path=public as $$
declare v_number text;
begin
 if auth.uid() is null or not public.hotel_website_is_admin() then raise exception 'Admin access required';end if;
 if p_issuer is null or p_issuer not in ('hotel','investment') then raise exception 'Select a valid invoice issuer';end if;
 v_number:=public.hotel_other_income_create_invoice(p_category,p_bill_to,p_contact,p_address,p_kra_pin,p_date,p_due_date,p_description,p_items);
 update public.hotel_other_income_invoices set issuer_entity=p_issuer where invoice_number=v_number;
 return v_number;
end;$$;

revoke all on function public.hotel_other_income_create_invoice_for_entity(text,text,text,text,text,text,date,date,text,jsonb) from public,anon;
grant execute on function public.hotel_other_income_create_invoice_for_entity(text,text,text,text,text,text,date,date,text,jsonb) to authenticated;
