-- Additive website-only card placement. No hotel POS schema or functions changed.
alter table public.hotel_website_content
 add column if not exists placement text not null default 'events';
alter table public.hotel_website_content
 add constraint hotel_website_content_placement_check
 check (placement in ('hero','rooms','dining','events'));
update public.hotel_website_content set placement=case
 when slug='hero' then 'hero'
 when slug in ('regular-rooms','vvip-rooms','extended-stay') then 'rooms'
 when slug in ('restaurant','bar') then 'dining'
 else 'events' end
 where slug in ('hero','regular-rooms','vvip-rooms','extended-stay','restaurant','bar','conference','night-club','private-events');
