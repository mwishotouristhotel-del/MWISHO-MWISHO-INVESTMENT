-- Isolated transactional notifications for website requests; no POS tables touched.
alter table public.hotel_website_food_orders add column if not exists customer_email text;
alter table public.hotel_website_food_orders
 add constraint hotel_food_email_valid check(customer_email is null or customer_email ~* '^[^ @]+@[^ @]+\.[^ @]+$');
create table if not exists public.hotel_notification_settings (
 id integer primary key default 1 check(id=1),
 sms_enabled boolean not null default false,
 email_enabled boolean not null default false,
 afrinet_partner_id text not null default '4429',
 afrinet_sender_id text not null default 'MwishoHotel',
 afrinet_api_secret_id uuid,
 gmail_sender_name text not null default 'MWISHO TOURIST HOTEL',
 gmail_address text not null default '',
 gmail_app_secret_id uuid,
 updated_at timestamptz not null default now()
);
insert into public.hotel_notification_settings(id) values(1) on conflict do nothing;
alter table public.hotel_notification_settings enable row level security;

create table if not exists public.hotel_notification_outbox (
 id uuid primary key default gen_random_uuid(),
 source_kind text not null check(source_kind in ('room','food','ticket','conference')),
 source_id uuid not null,
 event_key text not null,
 channel text not null check(channel in ('sms','email')),
 recipient text not null,
 customer_name text not null default '',
 subject text not null,
 message text not null,
 status text not null default 'pending' check(status in ('pending','sending','sent','failed')),
 attempts integer not null default 0,
 provider_message_id text,
 last_error text,
 sent_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(source_kind,source_id,event_key,channel)
);
create index if not exists hotel_notification_outbox_pending on public.hotel_notification_outbox(status,created_at);
alter table public.hotel_notification_outbox enable row level security;
grant select on public.hotel_notification_outbox to authenticated;
create policy "hotel_notification_admin_read" on public.hotel_notification_outbox
 for select to authenticated using ((select public.hotel_website_is_admin()));

-- Admin-only settings functions. Vault secrets are never returned to the browser.
create or replace function public.hotel_notification_admin_settings()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v public.hotel_notification_settings%rowtype;
begin
 if not public.hotel_website_is_admin() then raise exception 'Admin access required'; end if;
 select * into v from public.hotel_notification_settings where id=1;
 return jsonb_build_object('sms_enabled',v.sms_enabled,'email_enabled',v.email_enabled,
  'afrinet_partner_id',v.afrinet_partner_id,'afrinet_sender_id',v.afrinet_sender_id,
  'afrinet_key_saved',v.afrinet_api_secret_id is not null,
  'gmail_sender_name',v.gmail_sender_name,'gmail_address',v.gmail_address,
  'gmail_password_saved',v.gmail_app_secret_id is not null);
end $$;
revoke all on function public.hotel_notification_admin_settings() from public,anon;
grant execute on function public.hotel_notification_admin_settings() to authenticated;

create or replace function public.hotel_notification_save_settings(
 p_sms_enabled boolean,p_email_enabled boolean,p_partner_id text,p_sender_id text,
 p_gmail_name text,p_gmail_address text,p_afrinet_key text default null,p_gmail_password text default null)
returns void language plpgsql security definer set search_path='' as $$
declare v public.hotel_notification_settings%rowtype; a uuid; g uuid;
begin
 if not public.hotel_website_is_admin() then raise exception 'Admin access required'; end if;
 if p_partner_id !~ '^[0-9]{1,12}$' or p_sender_id !~ '^[A-Za-z0-9_-]{3,20}$'
  then raise exception 'Invalid Afrinet partner or sender ID'; end if;
 if p_gmail_address<>'' and p_gmail_address !~* '^[A-Z0-9._%+-]+@gmail\.com$'
  then raise exception 'Enter a valid Gmail sender address'; end if;
 select * into v from public.hotel_notification_settings where id=1 for update;
 a:=v.afrinet_api_secret_id;g:=v.gmail_app_secret_id;
 if nullif(btrim(coalesce(p_afrinet_key,'')),'') is not null then
  if a is null then a:=vault.create_secret(btrim(p_afrinet_key),'mwisho_afrinet_api_key','MWISHO transactional Afrinet key');
  else perform vault.update_secret(a,btrim(p_afrinet_key)); end if;
 end if;
 if nullif(regexp_replace(coalesce(p_gmail_password,''),'\s','','g'),'') is not null then
  if g is null then g:=vault.create_secret(regexp_replace(p_gmail_password,'\s','','g'),'mwisho_gmail_app_password','MWISHO Gmail SMTP app password');
  else perform vault.update_secret(g,regexp_replace(p_gmail_password,'\s','','g')); end if;
 end if;
 if p_sms_enabled and a is null then raise exception 'Enter the Afrinet API key before enabling SMS'; end if;
 if p_email_enabled and (g is null or p_gmail_address='' or btrim(p_gmail_name)='')
  then raise exception 'Gmail address, sender name and App Password are required'; end if;
 update public.hotel_notification_settings set sms_enabled=p_sms_enabled,email_enabled=p_email_enabled,
  afrinet_partner_id=btrim(p_partner_id),afrinet_sender_id=btrim(p_sender_id),
  afrinet_api_secret_id=a,gmail_sender_name=btrim(p_gmail_name),gmail_address=lower(btrim(p_gmail_address)),
  gmail_app_secret_id=g,updated_at=now() where id=1;
end $$;
revoke all on function public.hotel_notification_save_settings(boolean,boolean,text,text,text,text,text,text) from public,anon;
grant execute on function public.hotel_notification_save_settings(boolean,boolean,text,text,text,text,text,text) to authenticated;

create or replace function public.hotel_notification_delivery_settings()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v public.hotel_notification_settings%rowtype;a text;g text;
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'Service role required'; end if;
 select * into v from public.hotel_notification_settings where id=1;
 if v.afrinet_api_secret_id is not null then select decrypted_secret into a from vault.decrypted_secrets where id=v.afrinet_api_secret_id; end if;
 if v.gmail_app_secret_id is not null then select decrypted_secret into g from vault.decrypted_secrets where id=v.gmail_app_secret_id; end if;
 return jsonb_build_object('sms_enabled',v.sms_enabled,'email_enabled',v.email_enabled,
  'partner_id',v.afrinet_partner_id,'sender_id',v.afrinet_sender_id,'api_key',a,
  'gmail_name',v.gmail_sender_name,'gmail_address',v.gmail_address,'gmail_password',g);
end $$;
revoke all on function public.hotel_notification_delivery_settings() from public,anon,authenticated;
grant execute on function public.hotel_notification_delivery_settings() to service_role;

-- Status changes enqueue at most one notification per channel and event.
create or replace function public.hotel_website_enqueue_notification()
returns trigger language plpgsql security definer set search_path='' as $$
declare v public.hotel_notification_settings%rowtype; kind text; evt text; sid uuid;
 n text;phone text;email text;subject text;msg text;reference text;
begin
 begin
  if TG_OP='UPDATE' and new.status is not distinct from old.status then return new; end if;
  select * into v from public.hotel_notification_settings where id=1;
  if not coalesce(v.sms_enabled,false) and not coalesce(v.email_enabled,false) then return new; end if;
  sid:=new.id;evt:=new.status;
  case TG_TABLE_NAME
   when 'hotel_website_room_requests' then
    kind:='room';n:=new.customer_name;reference:=left(new.id::text,8);phone:=new.customer_contact;email:=new.customer_contact;
   when 'hotel_website_food_orders' then
    kind:='food';n:=new.customer_name;reference:=left(new.id::text,8);phone:=new.customer_phone;email:=coalesce(new.customer_email,'');
   when 'hotel_website_event_ticket_requests' then
    kind:='ticket';n:=new.customer_name;reference:=new.tracking_number;phone:=new.customer_phone;email:=new.customer_email;
   when 'hotel_website_conference_quotes' then
    kind:='conference';n:=new.contact_person;reference:=left(new.id::text,8);phone:=new.contact_phone;email:=new.organization_email;
   else return new;
  end case;
  subject:='MWISHO Tourist Hotel — '||initcap(kind)||' Update';
  msg:='Hello '||n||', your '||kind||' request ('||reference||') status is: '||replace(evt,'_',' ')||'. This is not payment confirmation unless explicitly verified by the hotel. Contact 0745396385 for assistance.';
  if v.sms_enabled and regexp_replace(coalesce(phone,''),'\D','','g') ~ '^(254|0)?[17][0-9]{8}$' then
   insert into public.hotel_notification_outbox(source_kind,source_id,event_key,channel,recipient,customer_name,subject,message)
    values(kind,sid,evt,'sms',phone,n,subject,msg) on conflict do nothing;
  end if;
  if v.email_enabled and coalesce(email,'') ~* '^[^ @]+@[^ @]+\.[^ @]+$' then
   insert into public.hotel_notification_outbox(source_kind,source_id,event_key,channel,recipient,customer_name,subject,message)
    values(kind,sid,evt,'email',lower(email),n,subject,msg) on conflict do nothing;
  end if;
 exception when others then
  raise warning 'MWISHO notification enqueue failed: %',SQLERRM;
 end;
 return new;
end $$;
revoke all on function public.hotel_website_enqueue_notification() from public,anon,authenticated;
do $$ declare t text; begin
 foreach t in array array['hotel_website_room_requests','hotel_website_food_orders','hotel_website_event_ticket_requests','hotel_website_conference_quotes'] loop
  execute format('drop trigger if exists hotel_notification_event on public.%I',t);
  execute format('create trigger hotel_notification_event after insert or update of status on public.%I for each row execute function public.hotel_website_enqueue_notification()',t);
 end loop;
end $$;
