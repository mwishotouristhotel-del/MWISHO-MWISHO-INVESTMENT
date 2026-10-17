create or replace function public.review_department_requisition(p_id uuid,p_approve boolean,p_note text default null) returns void language plpgsql security definer set search_path='' as $$
declare v public.department_requisitions%rowtype;
begin
select * into v from public.department_requisitions where id=p_id for update;
if not found or v.status!='submitted' then raise exception 'Requisition not awaiting review';end if;
if v.requested_by=auth.uid() then raise exception 'Cannot approve own requisition';end if;
if not exists(select 1 from public.staff_roles r where r.user_id=auth.uid() and r.active and (r.role='central_manager')) then raise exception 'Manager approval required' using errcode='42501';end if;
update public.department_requisitions set status=case when p_approve then 'approved' else 'rejected' end,reviewed_by=auth.uid(),reviewed_at=now(),review_note=nullif(trim(coalesce(p_note,'')),'') where id=p_id;
end $$;
