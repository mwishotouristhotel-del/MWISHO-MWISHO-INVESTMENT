-- Admin-controlled hotel issuer PIN for printed invoices; no historic PIN is assumed.
alter table public.hotel_document_settings
 add column if not exists issuer_kra_pin text not null default '' check(length(issuer_kra_pin)<=30);
