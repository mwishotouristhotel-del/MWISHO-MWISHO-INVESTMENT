-- Event ticket payment instructions are independently configurable from food orders.
insert into public.hotel_website_settings(key,value) values
 ('event_ticket_payment_method','till'),
 ('event_ticket_till_number','9311663'),
 ('event_ticket_paybill_number',''),
 ('event_ticket_paybill_account','')
on conflict(key) do nothing;
