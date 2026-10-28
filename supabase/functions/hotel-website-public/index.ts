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
  if(req.method==='GET'){
   const [cards,settings,gallery,promotions,rooms]=await Promise.all([
    db.from('hotel_website_content').select('slug,title,subtitle,description,image_url,enabled,display_order,placement').eq('enabled',true).order('display_order'),
    db.from('hotel_website_settings').select('key,value').in('key',['tagline','contact_phone','contact_email','whatsapp','facebook','instagram','tiktok','google_maps_url','hotel_latitude','hotel_longitude']),
    db.from('hotel_website_gallery').select('id,title,description,media_type,media_url,thumbnail_url,display_order').eq('is_published',true).order('display_order').order('created_at',{ascending:false}).limit(80),
    db.from('hotel_website_promotions').select('id,kind,title,description,media_type,media_url,action_label,action_url,event_date,popup_enabled,popup_mode,display_order,starts_at,ends_at').eq('is_published',true).order('display_order').limit(40),
    db.from('hotel_website_room_listings').select('id,category,name,description,nightly_rate_kes,package_rates,max_guests,amenities,image_url,room_photos,display_order').eq('is_published',true).order('display_order').limit(100)
   ]);
   if(cards.error||settings.error||gallery.error||promotions.error||rooms.error)return respond({error:'content unavailable'},503);
   const now=Date.now();
   const activePromotions=(promotions.data||[]).filter((x:any)=>(!x.starts_at||Date.parse(x.starts_at)<=now)&&(!x.ends_at||Date.parse(x.ends_at)>now));
   return respond({cards:cards.data,rooms:rooms.data||[],gallery:gallery.data||[],promotions:activePromotions,settings:Object.fromEntries((settings.data||[]).map((x:any)=>[x.key,x.value]))});
  }
  const data=await req.json().catch(()=>null);
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