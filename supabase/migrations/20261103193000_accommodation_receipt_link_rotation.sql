-- Bearer URLs stay stable for their original 30-day period. Store only an
-- encrypted copy of the token; the existing token_hash remains the lookup key.
-- Older receipts have no recoverable token and are intentionally not rotated.
alter table public.hotel_accommodation_receipts
 add column if not exists token_cipher text;
