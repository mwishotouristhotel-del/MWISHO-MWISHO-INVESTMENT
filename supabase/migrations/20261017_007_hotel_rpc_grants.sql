revoke all on function public.hotel_menu() from public, anon;
grant execute on function public.hotel_menu() to authenticated;
revoke all on function public.submit_hotel_order(uuid,text,jsonb) from public, anon;
grant execute on function public.submit_hotel_order(uuid,text,jsonb) to authenticated;
revoke all on function public.my_hotel_preparation_tickets(text) from public, anon;
grant execute on function public.my_hotel_preparation_tickets(text) to authenticated;