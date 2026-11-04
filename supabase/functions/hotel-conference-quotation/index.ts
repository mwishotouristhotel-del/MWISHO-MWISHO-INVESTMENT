import {createClient} from 'npm:@supabase/supabase-js@2.57.4';

const bucket='mwisho-conference-quotes';
const origin='https://mwishotouristhotel-del.github.io';
const headers={'content-type':'application/json','cache-control':'no-store','access-control-allow-origin':origin,
 'access-control-allow-methods':'GET,POST,OPTIONS','access-control-allow-headers':'authorization,apikey,content-type'};
const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers});
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
 const url=Deno.env.get('SUPABASE_URL'),key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
 if(!url||!key)return json({error:'Service unavailable'},503);
 const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 if(req.method==='GET'){
  const token=new URL(req.url).searchParams.get('token')||'';
  if(!uuid.test(token))return json({error:'Invalid quotation link'},400);
  const {data:q}=await db.from('hotel_website_conference_quotes')
   .select('quote_pdf_path,quote_link_expires_at').eq('quote_download_token',token).maybeSingle();
  if(!q?.quote_pdf_path||!q.quote_link_expires_at||Date.parse(q.quote_link_expires_at)<=Date.now())
   return json({error:'This quotation link is unavailable or expired. Contact the hotel for a new copy.'},410);
  const {data:signed,error}=await db.storage.from(bucket).createSignedUrl(q.quote_pdf_path,120,{download:'MWISHO-Conference-Quotation.pdf'});
  if(error||!signed?.signedUrl)return json({error:'Quotation cannot be downloaded right now'},503);
  return new Response(null,{status:302,headers:{location:signed.signedUrl,'cache-control':'no-store','referrer-policy':'no-referrer'}});
 }
 if(req.method!=='POST')return json({error:'Method not allowed'},405);
 const token=(req.headers.get('authorization')||'').replace(/^Bearer\s+/i,'');
 const {data:{user},error:authError}=await db.auth.getUser(token);
 if(authError||!user)return json({error:'Please sign in again'},401);
 const body=await req.json().catch(()=>({}));
 if(body.action!=='publish'||!uuid.test(String(body.quote_id||'')))return json({error:'Invalid request'},400);
 const quoteId=String(body.quote_id),path=String(body.path||'');
 if(!new RegExp('^'+quoteId+'/[0-9a-f-]{36}\\.pdf$','i').test(path))return json({error:'Invalid PDF file path'},400);
 const {data:q}=await db.from('hotel_website_conference_quotes')
  .select('id,organization_name,organization_email,contact_person,assigned_to,created_at').eq('id',quoteId).maybeSingle();
 if(!q)return json({error:'Quotation request not found'},404);
 const [{data:adminRoles},{data:activeStaff}]=await Promise.all([
  db.from('staff_roles').select('role').eq('user_id',user.id).eq('active',true).in('role',['director_admin','central_manager']).limit(1),
  db.from('staff_profiles').select('user_id').eq('user_id',user.id).eq('active',true).maybeSingle()
 ]);
 if(!adminRoles?.length&&!(q.assigned_to===user.id&&activeStaff))return json({error:'Not authorized to publish this quotation'},403);
 const {data:file,error:fileError}=await db.storage.from(bucket).info(path);
 if(fileError||!file||Number(file.size)>10485760)return json({error:'Upload the stamped PDF before publishing'},400);
 const downloadToken=crypto.randomUUID(),expires=new Date(Date.now()+30*86400000).toISOString();
 const {error:saveError}=await db.from('hotel_website_conference_quotes').update({
  quote_pdf_path:path,quote_download_token:downloadToken,quote_link_expires_at:expires,
  quote_published_at:new Date().toISOString(),quote_published_by:user.id,status:'quoted',updated_at:new Date().toISOString()
 }).eq('id',quoteId);
 if(saveError)return json({error:'Could not publish this quotation'},503);
 const referenceYear=new Intl.DateTimeFormat('en',{year:'numeric',timeZone:'Africa/Nairobi'}).format(new Date(q.created_at));
 const reference='MTH'+referenceYear+'-'+q.id.replace(/-/g,'').slice(0,10).toUpperCase();
 const downloadUrl=url+'/functions/v1/hotel-conference-quotation?token='+downloadToken;
 const {data:settings}=await db.from('hotel_notification_settings').select('email_enabled').eq('id',1).maybeSingle();
 let emailQueued=false;
 if(settings?.email_enabled&&q.organization_email){
  const {error:queueError}=await db.from('hotel_notification_outbox').insert({
   source_kind:'conference',source_id:q.id,event_key:'quotation_pdf_'+downloadToken.slice(0,8),
   channel:'email',recipient:q.organization_email.toLowerCase(),customer_name:q.contact_person,
   subject:'MWISHO Tourist Hotel — Quotation '+reference,
   message:'Dear '+q.contact_person+',\n\nThank you for your enquiry. Your approved MWISHO Tourist Hotel quotation ('+reference+') is ready.\nDownload your stamped quotation securely here:\n'+downloadUrl+'\n\nThis link is valid for 30 days.\n\nMWISHO Tourist Hotel\n0745396385'
  });
  emailQueued=!queueError;
  if(emailQueued)await fetch(url+'/functions/v1/hotel-notifications',{method:'POST',
   headers:{authorization:'Bearer '+key,'content-type':'application/json'},body:'{}',signal:AbortSignal.timeout(15000)}).catch(()=>null);
 }
 return json({ok:true,reference,email_queued:emailQueued,expires_at:expires,
  message:emailQueued?'Quotation published and email queued.':'Quotation published. Email delivery is not enabled or could not be queued; check notification settings.'});
});
