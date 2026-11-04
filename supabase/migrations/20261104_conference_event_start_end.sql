-- Store expected conference start and end separately; old requests remain readable.
alter table public.hotel_website_conference_quotes
 add column if not exists event_start_time time without time zone,
 add column if not exists event_end_date date,
 add column if not exists event_end_time time without time zone;

alter table public.hotel_website_conference_quotes
 add constraint conference_event_end_after_start
 check (event_start_time is null or event_end_date is null or event_end_time is null or
        (event_end_date + event_end_time) > (event_date + event_start_time));
