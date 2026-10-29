-- Ticket tracking and manual M-Pesa verification; independent of POS/food orders.
alter table public.hotel_website_event_ticket_requests
 add column if not exists tracking_number text,
 add column if not exists mpesa_reference text,
 add column if not exists payment_verified_at timestamptz;

-- Random, unguessable public-facing reference. UUID remains the internal ID.
create or replace function public.hotel_ticket_tracking_number()
returns text language sql volatile set search_path = '' as $$
 select 'MWT-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 16));
$$;
alter table public.hotel_website_event_ticket_requests
 alter column tracking_number set default public.hotel_ticket_tracking_number();
update public.hotel_website_event_ticket_requests
 set tracking_number=public.hotel_ticket_tracking_number()
 where tracking_number is null;
alter table public.hotel_website_event_ticket_requests alter column tracking_number set not null;
create unique index if not exists website_ticket_tracking_unique
 on public.hotel_website_event_ticket_requests(tracking_number);
create unique index if not exists website_ticket_mpesa_reference_unique
 on public.hotel_website_event_ticket_requests(upper(mpesa_reference))
 where mpesa_reference is not null;
alter table public.hotel_website_event_ticket_requests
 add constraint ticket_mpesa_reference_valid check(mpesa_reference is null or mpesa_reference ~ '^[A-Z0-9]{8,15}$');
