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
   const [cards,settings]=await Promise.all([
    db.from('hotel_website_content').select('slug,title,subtitle,description,image_url,enabled,display_order,placement').eq('enabled',true).order('display_order'),
    db.from('hotel_website_settings').select('key,value').in('key',['tagline','contact_phone','contact_email','whatsapp','facebook','instagram','tiktok'])
   ]);
   if(cards.error||settings.error)return respond({error:'content unavailable'},503);
   return respond({cards:cards.data,settings:Object.fromEntries((settings.data||[]).map((x:any)=>[x.key,x.value]))});
  }
  const data=await req.json().catch(()=>null);
  if(!data || typeof data.page!=='string'||!/^\/[a-z0-9/_-]{0,95}$/.test(data.page))return respond({error:'invalid page'},400);
  const {error}=await db.rpc('hotel_website_increment_view',{p_page:data.page});
  if(error)return respond({error:'tracking unavailable'},503);
  return respond({ok:true});
 }catch{return respond({error:'temporarily unavailable'},503)}
});