-- Link rotation preserves the receipt snapshot and receipt number while
-- allowing a fresh 30-day sharing period from the date of rotation.
alter table public.hotel_accommodation_receipts
 add column if not exists link_refreshed_at timestamptz;

alter table public.hotel_accommodation_receipts
 drop constraint if exists hotel_receipt_expiry_range;

alter table public.hotel_accommodation_receipts
 add constraint hotel_receipt_expiry_range
 check (
  expires_at > coalesce(link_refreshed_at,created_at)
  and expires_at <= coalesce(link_refreshed_at,created_at) + interval '30 days 5 minutes'
  and (link_refreshed_at is null or link_refreshed_at >= created_at)
 );
