// Public read-only website content and aggregate page-view collector.
// Runs in an isolated Edge Function. No POS or customer records are exposed.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.0';
const allowedOrigin='https://mwishotouristhotel-del.github.io';
const headers={'Content-Type':'application/json','Access-Control-Allow-Origin':allowedOrigin,'Access-Control-Allow-Methods':'GET,POST,OPTIONS','Access-Control-Allow-Headers':'content-type','Cache-Control':'no-store','Vary':'Origin'};
const respond=(payload:unknown,status=200)=>new Response(JSON.stringify(payload),{status,headers});
Deno.serve(async(req:Request)=>{
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
 const origin=req.headers.get('origin');
 if(origin && origin!==allowedOrigin)return respond({error:'origin not allowed'},403);
 if(!['GET','POST'].includes(req.method))return respond({error:'method not allowed'},405);
 const url=Deno.env.get('SUPABASE_URL'),key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
 if(!url||!key)return respond({error:'not configured'},503);
 const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 try{
  if(req.method==='GET' && new URL(req.url).searchParams.get('resource')==='food_payment_config'){
   const {data}=await db.from('hotel_website_settings').select('key,value').in('key',['mpesa_till_number','food_order_enabled']);
   const settings=Object.fromEntries((data||[]).map((x:any)=>[x.key,x.value]));
   const till=String(settings.mpesa_till_number||'').trim();
   return respond({enabled:settings.food_order_enabled==='true'&&/^\d{5,15}$/.test(till),till:/^\d{5,15}$/.test(till)?till:''});
  }
  if(req.method==='GET' && new URL(req.url).searchParams.get('resource')==='food_menu'){
   const {data:items,error:menuError}=await db.from('products')
    .select('id,name,price,preparation_options,hotel_image_path')
    .eq('active',true).eq('preparation_area','kitchen').eq('hotel_stock_only',false)
    .gt('price',0).order('name').limit(200);
   if(menuError)return respond({error:'Menu temporarily unavailable'},503);
   return respond({menu:(items||[]).map((x:any)=>({
    id:x.id,name:x.name,price:Number(x.price),
    preparation_options:x.preparation_options||[]
   })),online_orders_enabled:false,payment_verified:false});
  }
  if(req.method==='GET'){
   const [cards,settings,gallery,promotions,rooms,conferencePackages]=await Promise.all([
    db.from('hotel_website_content').select('slug,title,subtitle,description,image_url,enabled,display_order,placement').eq('enabled',true).order('display_order'),
    db.from('hotel_website_settings').select('key,value').in('key',['tagline','contact_phone','contact_email','whatsapp','facebook','instagram','tiktok','google_maps_url','hotel_latitude','hotel_longitude']),
    db.from('hotel_website_gallery').select('id,title,description,media_type,media_url,thumbnail_url,display_order').eq('is_published',true).order('display_order').order('created_at',{ascending:false}).limit(80),
    db.from('hotel_website_promotions').select('id,kind,title,description,media_type,media_url,action_label,action_url,event_date,popup_enabled,popup_mode,display_order,starts_at,ends_at').eq('is_published',true).order('display_order').limit(40),
    db.from('hotel_website_room_listings').select('id,category,name,description,nightly_rate_kes,package_rates,max_guests,amenities,image_url,room_photos,display_order').eq('is_published',true).order('display_order').limit(100),
    db.from('hotel_website_conference_packages').select('id,name,description,price_kes,price_unit,display_order').eq('is_published',true).order('display_order').limit(50)
   ]);
   if(cards.error||settings.error||gallery.error||promotions.error||rooms.error)return respond({error:'content unavailable'},503);
   const now=Date.now();
   const activePromotions=(promotions.data||[]).filter((x:any)=>(!x.starts_at||Date.parse(x.starts_at)<=now)&&(!x.ends_at||Date.parse(x.ends_at)>now));
   return respond({cards:cards.data,rooms:rooms.data||[],conference_packages:conferencePackages.data||[],gallery:gallery.data||[],promotions:activePromotions,settings:Object.fromEntries((settings.data||[]).map((x:any)=>[x.key,x.value]))});
  }
  const data=await req.json().catch(()=>null);
  if(data?.action==='conference_quote_request'){
   const val=(key:string,max=3000)=>String(data[key]||'').trim().slice(0,max+1);
   const organization_name=val('organization_name',150),organization_kra_pin=val('organization_kra_pin',15).toUpperCase();
   const event_date=val('event_date',10),number_of_pax=Number(data.number_of_pax);
   const organization_email=val('organization_email',254),organization_phone=val('organization_phone',30);
   const contact_person=val('contact_person',120),contact_phone=val('contact_phone',30);
   const requirements=val('requirements',3000),package_id=val('package_id',36);
   const emailValid=(v:string)=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)&&v.length<=254;
   const phoneValid=(v:string)=>/^\+?[0-9 ()-]{9,30}$/.test(v);
   const cc_emails=Array.isArray(data.cc_emails)?data.cc_emails.map((x:any)=>String(x).trim().toLowerCase()):[];
   if(organization_name.length<2||organization_name.length>150||!/^[A-Z][0-9]{9}[A-Z]$/.test(organization_kra_pin)||
      !Number.isInteger(number_of_pax)||number_of_pax<1||number_of_pax>10000||
      !/^\d{4}-\d{2}-\d{2}$/.test(event_date)||!Number.isFinite(Date.parse(event_date))||
      event_date<new Date().toLocaleDateString('en-CA',{timeZone:'Africa/Nairobi'})||
      !emailValid(organization_email)||!phoneValid(organization_phone)||
      contact_person.length<2||contact_person.length>120||!phoneValid(contact_phone)||
      requirements.length>3000||cc_emails.length>5||cc_emails.some((x:string)=>!emailValid(x))||
      (!package_id&&requirements.length<10))
     return respond({error:'Complete the required organization, event, contact and package details.'},400);
   let package_name='';
   if(package_id){
    if(!/^[0-9a-f-]{36}$/i.test(package_id))return respond({error:'Invalid conference package.'},400);
    const {data:p,error:e}=await db.from('hotel_website_conference_packages').select('name').eq('id',package_id).eq('is_published',true).maybeSingle();
    if(e||!p)return respond({error:'This conference package is unavailable. Please refresh.'},409);
    package_name=p.name;
   }
   const {count,error:countError}=await db.from('hotel_website_conference_quotes').select('id',{count:'exact',head:true})
      .eq('organization_email',organization_email).gte('created_at',new Date(Date.now()-3600000).toISOString());
   if(countError)return respond({error:'Unable to validate request.'},503);
   if((count||0)>=3)return respond({error:'Too many recent requests. Please contact the hotel.'},429);
   const {data:created,error:e}=await db.from('hotel_website_conference_quotes').insert({
     organization_name,organization_kra_pin,number_of_pax,event_date,
     package_id:package_id||null,package_name,requirements,organization_email,organization_phone,
     contact_person,contact_phone,cc_emails,status:'new'
   }).select('id').single();
   if(e||!created)return respond({error:'Could not submit the quotation request.'},503);
   return respond({ok:true,request_id:created.id,status:'new',message:'Quotation request received for hotel Admin review.'});
  }
  if(data?.action==='submit_food_payment'){
   const {data:settingsRows,error:settingsError}=await db.from('hotel_website_settings')
     .select('key,value').in('key',['mpesa_till_number','food_order_enabled']);
   if(settingsError)return respond({error:'Food ordering temporarily unavailable.'},503);
   const options=Object.fromEntries((settingsRows||[]).map((x:any)=>[x.key,x.value]));
   const till=String(options.mpesa_till_number||'').trim();
   if(options.food_order_enabled!=='true'||!/^\d{5,15}$/.test(till))
      return respond({error:'Food ordering has not been activated by the hotel.'},503);
   const name=String(data.customer_name||'').trim(),phone=String(data.customer_phone||'').trim();
   const reference=String(data.mpesa_reference||'').trim().toUpperCase();
   const date=String(data.arrival_date||''),time=String(data.arrival_time||'');
   const instructions=String(data.order_instructions||'').trim();
   if(instructions.length>1000)return respond({error:'Order instructions must be 1000 characters or fewer.'},400);
   if(name.length<2||name.length>120||!/^\+?[0-9 ]{9,25}$/.test(phone)||
       !/^[A-Z0-9]{8,15}$/.test(reference)||!/\d{4}-\d{2}-\d{2}/.test(date)||
       !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)||
       date<new Date().toLocaleDateString('en-CA',{timeZone:'Africa/Nairobi'}))
      return respond({error:'Check the name, phone, arrival time and M-Pesa code.'},400);
   if(!Array.isArray(data.items)||data.items.length<1||data.items.length>25)
      return respond({error:'Choose valid menu items.'},400);
   const requestItems=data.items.map((item:any)=>({id:String(item?.id||''),qty:Number(item?.qty)}));
   if(requestItems.some((item:any)=>!/^[0-9a-f-]{36}$/i.test(item.id)||
       !Number.isInteger(item.qty)||item.qty<1||item.qty>20))
      return respond({error:'Invalid food quantities.'},400);
   const distinctIds=[...new Set(requestItems.map((item:any)=>item.id))];
   if(distinctIds.length!==requestItems.length)return respond({error:'Duplicate item detected.'},400);
   const {data:products,error:productsError}=await db.from('products')
    .select('id,name,price').in('id',distinctIds).eq('active',true)
    .eq('preparation_area','kitchen').eq('hotel_stock_only',false);
   if(productsError||!products||products.length!==distinctIds.length)
      return respond({error:'Some menu items have changed. Refresh the menu.'},409);
   const byId=new Map(products.map((x:any)=>[x.id,x]));
   const items=requestItems.map((item:any)=>{
    const product:any=byId.get(item.id);
    return {id:item.id,name:product.name,qty:item.qty,unit_price:Number(product.price)};
   });
   if(items.some((x:any)=>!Number.isFinite(x.unit_price)||x.unit_price<=0))
      return respond({error:'Invalid current menu price.'},409);
   const amount=items.reduce((total:number,item:any)=>total+item.qty*item.unit_price,0);
   if(!Number.isFinite(amount)||amount<=0||amount>200000)
      return respond({error:'Invalid order value.'},400);
   const {count:recent,error:throttleError}=await db.from('hotel_website_food_orders')
     .select('id',{count:'exact',head:true}).eq('customer_phone',phone)
     .gte('created_at',new Date(Date.now()-3600000).toISOString());
   if(throttleError)return respond({error:'Could not process your request.'},503);
   if((recent||0)>=3)return respond({error:'Too many recent orders. Contact the hotel.'},429);
   const {data:inserted,error:insertError}=await db.from('hotel_website_food_orders').insert({
    customer_name:name,customer_phone:phone,arrival_date:date,arrival_time:time,
    items,total_kes:amount,till_number:till,mpesa_reference:reference,order_instructions:instructions,
    status:'pending_verification'
   }).select('id').single();
   if(insertError){
    if(insertError.code==='23505')return respond({error:'This M-Pesa code is already submitted.'},409);
    return respond({error:'Unable to submit payment proof. Contact the hotel.'},503);
   }
   return respond({ok:true,order_id:inserted.id,status:'pending_verification',
    amount, message:'Payment proof submitted. The hotel must independently verify the transaction before preparation.'});
  }
  if(data?.action==='room_request'){
   const kind=data.request_kind;
   const iso=(v:unknown)=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(Date.parse(v+'T00:00:00Z'));
   const inDate=String(data.check_in||''),outDate=String(data.check_out||'');
   const nights=(Date.parse(outDate+'T00:00:00Z')-Date.parse(inDate+'T00:00:00Z'))/86400000;
   const today=new Date().toISOString().slice(0,10);
   const name=String(data.customer_name||'').trim(),contact=String(data.customer_contact||'').trim(),note=String(data.note||'').trim();
   const keys=['bed_only','bed_breakfast','half_board','full_board'];
   const guests=Number(data.guests);
   if(!['availability','similar_room'].includes(kind)||!iso(inDate)||!iso(outDate)||inDate<today||nights<1||nights>60||
      !Number.isInteger(guests)||guests<1||guests>30||!keys.includes(data.package_key)||
      name.length<2||name.length>120||contact.length<7||contact.length>180||note.length>500||
      typeof data.room_id!=='string'||!/^[-a-f0-9]{36}$/i.test(data.room_id))
      return respond({error:'Check the room, dates, guest count and contact details.'},400);
   const {data:room,error:roomError}=await db.from('hotel_website_room_listings')
      .select('id,max_guests').eq('id',data.room_id).eq('is_published',true).maybeSingle();
   if(roomError||!room||guests>Number(room.max_guests))return respond({error:'Room cannot accommodate this request.'},400);
   const {count:recentCount,error:throttleError}=await db.from('hotel_website_room_requests')
    .select('id',{count:'exact',head:true})
    .eq('customer_contact',contact)
    .gte('created_at',new Date(Date.now()-3600000).toISOString());
   if(throttleError)return respond({error:'Unable to process requests at the moment.'},503);
   if((recentCount||0)>=3)return respond({error:'Too many recent requests. Please contact the hotel directly.'},429);
   const {error:insertError}=await db.from('hotel_website_room_requests').insert({
    room_id:room.id,request_kind:kind,check_in:inDate,check_out:outDate,guests,
    package_key:data.package_key,customer_name:name,customer_contact:contact,note,status:'pending'
   });
   if(insertError)return respond({error:'Unable to submit request. Please contact the hotel directly.'},503);
   return respond({ok:true,status:'pending',message:'Request received. Hotel staff must verify room availability before any booking is confirmed.'});
  }
  if(!data || typeof data.page!=='string'||!/^\/[a-z0-9/_-]{0,95}$/.test(data.page))return respond({error:'invalid page'},400);
  const {error}=await db.rpc('hotel_website_increment_view',{p_page:data.page});
  if(error)return respond({error:'tracking unavailable'},503);
  return respond({ok:true});
 }catch{return respond({error:'temporarily unavailable'},503)}
});