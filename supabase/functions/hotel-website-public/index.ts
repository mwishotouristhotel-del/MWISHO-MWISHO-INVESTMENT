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
   const [cards,settings,gallery,promotions]=await Promise.all([
    db.from('hotel_website_content').select('slug,title,subtitle,description,image_url,enabled,display_order,placement').eq('enabled',true).order('display_order'),
    db.from('hotel_website_settings').select('key,value').in('key',['tagline','contact_phone','contact_email','whatsapp','facebook','instagram','tiktok','google_maps_url','hotel_latitude','hotel_longitude']),
    db.from('hotel_website_gallery').select('id,title,description,media_type,media_url,thumbnail_url,display_order').eq('is_published',true).order('display_order').order('created_at',{ascending:false}).limit(80),
    db.from('hotel_website_promotions').select('id,kind,title,description,media_type,media_url,action_label,action_url,event_date,popup_enabled,popup_mode,display_order,starts_at,ends_at').eq('is_published',true).order('display_order').limit(40)
   ]);
   if(cards.error||settings.error||gallery.error||promotions.error)return respond({error:'content unavailable'},503);
   const now=Date.now();
   const activePromotions=(promotions.data||[]).filter((x:any)=>(!x.starts_at||Date.parse(x.starts_at)<=now)&&(!x.ends_at||Date.parse(x.ends_at)>now));
   return respond({cards:cards.data,gallery:gallery.data||[],promotions:activePromotions,settings:Object.fromEntries((settings.data||[]).map((x:any)=>[x.key,x.value]))});
  }
  const data=await req.json().catch(()=>null);
  if(!data || typeof data.page!=='string'||!/^\/[a-z0-9/_-]{0,95}$/.test(data.page))return respond({error:'invalid page'},400);
  const {error}=await db.rpc('hotel_website_increment_view',{p_page:data.page});
  if(error)return respond({error:'tracking unavailable'},503);
  return respond({ok:true});
 }catch{return respond({error:'temporarily unavailable'},503)}
});