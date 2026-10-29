alter table public.hotel_website_conference_quotes
 add column if not exists number_of_days integer not null default 1;
alter table public.hotel_website_conference_quotes
 add constraint hotel_website_conference_quotes_days_valid
 check (number_of_days between 1 and 365);