-- Receipt documents contain guest personal information. Keep the snapshots and
-- bearer-token digests out of the public Data API; only the Edge Function's
-- service role may access them.
create table if not exists public.hotel_accommodation_receipts (
 id uuid primary key default gen_random_uuid(),
 stay_id uuid not null references public.hotel_accommodation_stays(id),
 token_hash text not null unique check (char_length(token_hash)=64),
 snapshot jsonb not null,
 etims_url text,
 expires_at timestamptz not null,
 revoked_at timestamptz,
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 constraint hotel_receipt_expiry_range check (expires_at>created_at and expires_at<=created_at+interval '30 days 5 minutes')
);
create index if not exists hotel_accommodation_receipts_stay on public.hotel_accommodation_receipts(stay_id,created_at desc);
alter table public.hotel_accommodation_receipts enable row level security;
revoke all on public.hotel_accommodation_receipts from public,anon,authenticated;

create table if not exists public.hotel_accommodation_receipt_delivery (
 id uuid primary key default gen_random_uuid(),
 receipt_id uuid not null references public.hotel_accommodation_receipts(id),
 channel text not null check(channel in ('sms','email')),
 recipient text not null,
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now()
);
create index if not exists hotel_receipt_delivery_recent on public.hotel_accommodation_receipt_delivery(receipt_id,channel,created_at desc);
alter table public.hotel_accommodation_receipt_delivery enable row level security;
revoke all on public.hotel_accommodation_receipt_delivery from public,anon,authenticated;

alter table public.hotel_notification_outbox
 drop constraint if exists hotel_notification_outbox_source_kind_check;
alter table public.hotel_notification_outbox
 add constraint hotel_notification_outbox_source_kind_check
 check (source_kind in ('room','food','ticket','conference','accommodation_receipt'));
