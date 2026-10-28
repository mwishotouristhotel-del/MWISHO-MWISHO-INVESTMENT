-- Add only the missing homepage About image content card. Existing POS tables untouched.
insert into public.hotel_website_content
 (slug,title,subtitle,description,image_url,enabled,display_order,placement)
values
 ('about-hotel','Stay • Dine • Celebrate','A complete hospitality experience',
  'Homepage About section photo','',true,5,'hero')
on conflict (slug) do nothing;