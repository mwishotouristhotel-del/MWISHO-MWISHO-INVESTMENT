import {createClient} from 'npm:@supabase/supabase-js@2.57.4';
import nodemailer from 'npm:nodemailer@6.9.16';

const response=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});
const normalizePhone=(value:string)=>{
 const v=value.replace(/\D/g,'');
 if(/^254[17]\d{8}$/.test(v))return v;
 if(/^0[17]\d{8}$/.test(v))return '254'+v.slice(1);
 if(/^[17]\d{8}$/.test(v))return '254'+v;
 throw Error('Invalid Kenyan mobile number');
};
const providerCode=(result:any)=>{
 const first=Array.isArray(result?.responses)?result.responses[0]:result;
 const raw=first?.['response-code']??first?.['respose-code']??first?.code;
 return raw==null?null:Number(raw);
};

Deno.serve(async req=>{
 if(req.method!=='POST')return response({error:'POST required'},405);
 const url=Deno.env.get('SUPABASE_URL'),key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
 if(!url||!key)return response({error:'Not configured'},503);
 const token=(req.headers.get('authorization')||'').replace(/^Bearer\s+/i,'');
 const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 if(token!==key){
  const {data:{user},error}=await db.auth.getUser(token);
  if(error||!user)return response({error:'Unauthorized'},401);
  const {data:staff}=await db.from('staff_roles').select('role').eq('user_id',user.id).eq('active',true).in('role',['director_admin','central_manager']).limit(1);
  if(!staff?.length)return response({error:'Admin access required'},403);
 }
 const body=await req.json().catch(()=>({}));
 if(body?.action==='retry'&&token!==key){
  const id=String(body.id||'');
  if(!/^[0-9a-f-]{36}$/i.test(id))return response({error:'Invalid notification ID'},400);
  const {error}=await db.from('hotel_notification_outbox').update({status:'pending',last_error:null,updated_at:new Date().toISOString()}).eq('id',id).eq('status','failed');
  if(error)return response({error:'Cannot retry notification'},503);
 }
 const {data:settings,error:settingsError}=await db.rpc('hotel_notification_delivery_settings');
 if(settingsError)return response({error:'Notification configuration unavailable'},503);
 const {data:jobs,error:queueError}=await db.from('hotel_notification_outbox').select('*').eq('status','pending').order('created_at').limit(10);
 if(queueError)return response({error:'Notification queue unavailable'},503);
 let sent=0,failed=0;
 for(const job of jobs||[]){
  const active=job.channel==='sms'?settings.sms_enabled:settings.email_enabled;
  if(!active)continue;
  const {data:claimed,error:claimError}=await db.from('hotel_notification_outbox')
   .update({status:'sending',attempts:Number(job.attempts||0)+1,updated_at:new Date().toISOString()})
   .eq('id',job.id).eq('status','pending').select('id').maybeSingle();
  if(claimError||!claimed)continue;
  try{
   let providerId='';
   if(job.channel==='sms'){
    if(!settings.api_key)throw Error('Afrinet API key missing');
    const res=await fetch('https://bulksms.afrinettelecom.co.ke/api/services/sendsms/',{
     method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({
      apikey:settings.api_key,partnerID:settings.partner_id,mobile:normalizePhone(job.recipient),
      message:String(job.message).slice(0,480),shortcode:settings.sender_id,pass_type:'plain'
     }),signal:AbortSignal.timeout(18000)});
    const result=await res.json().catch(()=>null),code=providerCode(result);
    if(!res.ok||(code!==null&&code!==200))throw Error('Afrinet rejected SMS: '+String(result?.responses?.[0]?.['response-description']||res.status));
    providerId=String(result?.responses?.[0]?.messageid||'');
   }else{
    if(!settings.gmail_address||!settings.gmail_password)throw Error('Gmail sender not configured');
    const smtp=nodemailer.createTransport({host:'smtp.gmail.com',port:465,secure:true,
     auth:{user:settings.gmail_address,pass:settings.gmail_password},connectionTimeout:12000,socketTimeout:18000});
    const info=await smtp.sendMail({from:{name:String(settings.gmail_name||'MWISHO TOURIST HOTEL'),address:settings.gmail_address},
     to:job.recipient,subject:job.subject,text:job.message});
    providerId=String(info?.messageId||'');
   }
   await db.from('hotel_notification_outbox').update({status:'sent',sent_at:new Date().toISOString(),provider_message_id:providerId,last_error:null,updated_at:new Date().toISOString()}).eq('id',job.id);
   sent++;
  }catch(e){
   await db.from('hotel_notification_outbox').update({status:'failed',last_error:String(e instanceof Error?e.message:e).slice(0,300),updated_at:new Date().toISOString()}).eq('id',job.id);
   failed++;
  }
 }
 return response({ok:true,sent,failed});
});
