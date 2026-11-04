-- Admin-maintained internal income sources. Existing invoice categories are historical values.
alter table public.hotel_document_settings
 add column if not exists other_income_categories jsonb not null
 default '["House Rent","Equipment Hire","Property Lease","Other Services"]'::jsonb;

alter table public.hotel_document_settings
 add constraint hotel_other_income_categories_array
 check (jsonb_typeof(other_income_categories) = 'array');
