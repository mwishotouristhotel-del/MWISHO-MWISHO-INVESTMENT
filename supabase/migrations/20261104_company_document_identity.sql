-- Admin-managed issuer identity used by the hotel invoice and quotation PDFs.
-- Existing document terms, payment accounts and legacy issuer PIN remain intact.
alter table public.hotel_document_settings
  add column if not exists company_details jsonb not null default '{}'::jsonb;

alter table public.hotel_document_settings
  add constraint hotel_document_company_details_object
  check (jsonb_typeof(company_details) = 'object');
