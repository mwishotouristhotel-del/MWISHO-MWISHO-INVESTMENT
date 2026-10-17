create or replace function public.submit_department_requisition(p_department uuid,p_section uuid,p_purpose text,p_needed_on date,p_items jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;v_item jsonb;v_count integer:=0;
begin
if not exists(select 1 from public.staff_profiles p where p.user_id=auth.uid() and p.active) then raise exception 'Active staff required' using errcode='42501';end if;
if not exists(select 1 from public.staff_roles r where r.user_id=auth.uid() and r.active and (r.role='department_manager' and r.department_id=p_department)) then raise exception 'Not authorized to requisition for this department' using errcode='42501';end if;
if p_section is not null and not exists(select 1 from public.requisition_sections s where s.id=p_section and s.department_id=p_department and s.active) then raise exception 'Invalid section';end if;
if length(trim(coalesce(p_purpose,'')))<5 then raise exception 'Purpose is required';end if;
if jsonb_typeof(p_items)!='array' or jsonb_array_length(p_items)<1 or jsonb_array_length(p_items)>50 then raise exception 'Provide 1 to 50 items';end if;
insert into public.department_requisitions(department_id,section_id,requested_by,purpose,needed_on) values(p_department,p_section,auth.uid(),trim(p_purpose),p_needed_on) returning id into v_id;
for v_item in select value from jsonb_array_elements(p_items) loop
if length(trim(coalesce(v_item->>'name','')))<2 or length(trim(coalesce(v_item->>'unit','')))<1 or coalesce((v_item->>'quantity')::numeric,0)<=0 then raise exception 'Invalid item name, unit or quantity';end if;
insert into public.department_requisition_items(requisition_id,item_name,quantity,unit,notes) values(v_id,trim(v_item->>'name'),(v_item->>'quantity')::numeric,trim(v_item->>'unit'),nullif(trim(coalesce(v_item->>'notes','')),''));
v_count:=v_count+1;
end loop;
return v_id;
end $$;
