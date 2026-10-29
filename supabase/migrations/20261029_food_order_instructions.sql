alter table public.hotel_website_food_orders add column if not exists order_instructions text not null default '';
alter table public.hotel_website_food_orders add constraint website_food_instructions_length check(length(order_instructions)<=1000);
