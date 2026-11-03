-- Reporting is read-only and uses existing accommodation/settlement records.
-- Do not expose guest IDs, phone numbers or payment credentials in exports.
create or replace function public.hotel_accommodation_daily_reception_report(p_start date,p_end date)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_count integer; v_report jsonb;
begin
 if not public.hotel_accommodation_can_reception() then raise exception 'Reception access required'; end if;
 if p_start is null or p_end is null or p_end<p_start or p_end>p_start+366 then
  raise exception 'Choose a reporting period of at most 367 days'; end if;
 select count(*) into v_count
 from public.hotel_accommodation_stays s join public.hotel_accommodation_rooms r on r.id=s.room_id
 where (public.hotel_accommodation_can_manage_all() or r.category=public.hotel_accommodation_reception_section())
  and (s.check_in_date<=p_end and s.expected_check_out_date>p_start
   or exists(select 1 from public.hotel_accommodation_payments p where p.stay_id=s.id
    and (p.received_at at time zone 'Africa/Nairobi')::date between p_start and p_end)
   or exists(select 1 from public.hotel_accommodation_invoice_items ii
    join public.hotel_accommodation_invoices i on i.id=ii.invoice_id
    where ii.stay_id=s.id and i.invoice_date between p_start and p_end));
 if v_count>5000 then raise exception 'Report exceeds 5000 stays. Choose a shorter date range'; end if;

 with scoped as materialized (
  select s.*,r.room_number,r.category as section from public.hotel_accommodation_stays s
  join public.hotel_accommodation_rooms r on r.id=s.room_id
  where (public.hotel_accommodation_can_manage_all() or r.category=public.hotel_accommodation_reception_section())
   and (s.check_in_date<=p_end and s.expected_check_out_date>p_start
    or exists(select 1 from public.hotel_accommodation_payments p where p.stay_id=s.id
     and (p.received_at at time zone 'Africa/Nairobi')::date between p_start and p_end)
    or exists(select 1 from public.hotel_accommodation_invoice_items ii
     join public.hotel_accommodation_invoices i on i.id=ii.invoice_id
     where ii.stay_id=s.id and i.invoice_date between p_start and p_end))
 )
 select jsonb_build_object(
  'stays',coalesce((select jsonb_agg(jsonb_build_object(
   'id',s.id,'guest_name',s.guest_name,'room_number',s.room_number,'section',s.section,
   'check_in_date',s.check_in_date,'expected_check_out_date',s.expected_check_out_date,
   'actual_check_out_date',s.actual_check_out_date,'status',s.status,
   'total_kes',s.total_kes,'nightly_rate_kes',s.nightly_rate_kes,
   'invoice_organization_name',s.invoice_organization_name
  ) order by s.check_in_date,s.room_number) from scoped s),'[]'::jsonb),
  'payments',coalesce((select jsonb_agg(jsonb_build_object(
   'id',p.id,'stay_id',p.stay_id,'amount_kes',p.amount_kes,
   'method',p.method,'reference',p.reference,'received_at',p.received_at
  ) order by p.received_at,p.id)
   from public.hotel_accommodation_payments p join scoped s on s.id=p.stay_id),'[]'::jsonb),
  'invoices',coalesce((select jsonb_agg(jsonb_build_object(
   'stay_id',ii.stay_id,'invoice_number',i.invoice_number,
   'invoice_date',i.invoice_date,'amount_kes',ii.amount_kes
  ) order by i.invoice_date,i.id)
   from public.hotel_accommodation_invoice_items ii join public.hotel_accommodation_invoices i on i.id=ii.invoice_id
   join scoped s on s.id=ii.stay_id),'[]'::jsonb)
 ) into v_report;
 return v_report;
end;$$;
revoke all on function public.hotel_accommodation_daily_reception_report(date,date) from public,anon;
grant execute on function public.hotel_accommodation_daily_reception_report(date,date) to authenticated;
