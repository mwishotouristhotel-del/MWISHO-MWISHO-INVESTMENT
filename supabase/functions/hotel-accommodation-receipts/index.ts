import {createClient} from 'npm:@supabase/supabase-js@2.57.4';
import {PDFDocument,StandardFonts,rgb} from 'npm:pdf-lib@1.17.1';
import QRCode from 'npm:qrcode@1.5.4';
import {LOGO_PNG_BASE64} from './logo.ts';

const originAllowed=new Set(['https://mwishotouristhotel-del.github.io','http://localhost:5173','http://127.0.0.1:5173']);
// supabase-js includes x-client-info on browser calls. Missing it from the
// preflight response blocks POST entirely despite a successful OPTIONS 204.
const cors=(origin:string|null)=>({'access-control-allow-origin':originAllowed.has(origin||'')?origin!:'https://mwishotouristhotel-del.github.io','access-control-allow-headers':'authorization,apikey,content-type,x-client-info,x-supabase-api-version','access-control-allow-methods':'GET,POST,OPTIONS','vary':'Origin'});
const json=(data:unknown,status=200,origin:string|null=null)=>new Response(JSON.stringify(data),{status,headers:{...cors(origin),'content-type':'application/json','cache-control':'no-store'}});
const tidy=(v:unknown)=>String(v??'').normalize('NFKD').replace(/[^\x20-\x7E]/g,' ').trim();
const amount=(v:unknown)=>Number(v||0).toLocaleString('en-KE',{minimumFractionDigits:2,maximumFractionDigits:2});
const hex=(data:ArrayBuffer)=>Array.from(new Uint8Array(data)).map(n=>n.toString(16).padStart(2,'0')).join('');
const digest=async(token:string)=>hex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token)));
const logoBytes=Uint8Array.from(atob(LOGO_PNG_BASE64),c=>c.charCodeAt(0));
// Keep the bearer token recoverable by authorized reception staff without
// exposing it in the Data API. A separate, random IV is used per receipt.
const tokenKey=async(secret:string)=>crypto.subtle.importKey('raw',await crypto.subtle.digest('SHA-256',new TextEncoder().encode('mwisho-receipt-token-v1:'+secret)),{name:'AES-GCM'},false,['encrypt','decrypt']);
const sealToken=async(token:string,secret:string)=>{
 const iv=crypto.getRandomValues(new Uint8Array(12));
 const encrypted=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},await tokenKey(secret),new TextEncoder().encode(token)));
 return btoa(String.fromCharCode(...iv,...encrypted));
};
const openToken=async(cipher:string,secret:string)=>{
 const bytes=Uint8Array.from(atob(cipher),c=>c.charCodeAt(0));
 return new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes.slice(0,12)},await tokenKey(secret),bytes.slice(12)));
};
const validEtims=(raw:unknown)=>{
 const input=String(raw||'').trim();if(!input)return null;
 if(input.length>2048)throw Error('eTIMS link is too long');
 const u=new URL(input);
 if(u.protocol!=='https:'||u.username||u.password||!u.hostname.includes('.'))throw Error('Enter a valid HTTPS eTIMS verification link');
 return u.href;
};
const asThermalPdf=async(row:any)=>{
 const data=row.snapshot, count=Math.min(data.payments.length,30);
 const height=Math.max(510,425+count*18+(row.etims_url?120:0));
 const pdf=await PDFDocument.create(),page=pdf.addPage([226.77,height]);
 const font=await pdf.embedFont(StandardFonts.Helvetica),bold=await pdf.embedFont(StandardFonts.HelveticaBold);
 let y=height-24;
 const center=(s:string,size=9,strong=false)=>{const f=strong?bold:font;page.drawText(tidy(s).slice(0,45),{x:(226.77-f.widthOfTextAtSize(tidy(s).slice(0,45),size))/2,y,font:f,size});y-=size+7};
 const item=(label:string,value:unknown)=>{const a=tidy(label+': '+String(value??''));for(let i=0;i<a.length;i+=36){page.drawText(a.slice(i,i+36),{x:12,y,font,size:9});y-=14}};
 const logo=await pdf.embedPng(logoBytes);
 page.drawImage(logo,{x:38,y:y-68,width:150,height:68});y-=78;
 center('MWISHO TOURIST HOTEL',12,true);center('Taste of Class',9);center('ACCOMMODATION RECEIPT',10,true);
 item('Receipt',data.receipt_number);item('Issued',new Date(row.created_at).toLocaleString('en-KE',{timeZone:'Africa/Nairobi'}));
 item('Guest',data.guest_name);item('Room',data.room_number);item('Package',data.package);
 item('Check in',data.check_in_date);item('Check out',data.check_out_date);
 item('Bill KSh',amount(data.total));item('Paid KSh',amount(data.paid));item('Balance KSh',amount(data.balance));
 item('Status',data.status);if(data.organization)item('Organization',data.organization);
 center('PAYMENT RECORD',9,true);
 for(const p of data.payments.slice(0,30)){item(p.method.toUpperCase()+' '+p.date,'KSh '+amount(p.amount));}
 if(data.payments.length>30)item('Additional payments',data.payments.length-30);
 if(row.etims_url){
  y-=8;const png=await QRCode.toDataURL(row.etims_url,{errorCorrectionLevel:'M',margin:1,width:250});
  const image=await pdf.embedPng(Uint8Array.from(atob(png.split(',')[1]),c=>c.charCodeAt(0)));
  page.drawImage(image,{x:73,y:y-93,width:80,height:80});y-=110;
  center('Scan To Open Etims/Etr Receipt',8,true);
 }
 center('Thank you for staying with us',8);
 return await pdf.save();
};
const asPdf=async(row:any)=>{
 const data=row.snapshot;
 const pdf=await PDFDocument.create();const page=pdf.addPage([595,842]);
 const font=await pdf.embedFont(StandardFonts.Helvetica),bold=await pdf.embedFont(StandardFonts.HelveticaBold);
 const logo=await pdf.embedPng(logoBytes);
 const purple=rgb(.34,.16,.51),grey=rgb(.34,.33,.39);
 const line=(label:string,value:unknown,y:number)=>{
  page.drawText(tidy(label),{x:46,y,font:bold,size:10,color:purple});
  page.drawText(tidy(value).slice(0,76),{x:190,y,font,size:10,color:grey});
 };
 page.drawRectangle({x:30,y:30,width:535,height:782,borderColor:purple,borderWidth:1});
 page.drawRectangle({x:31,y:753,width:533,height:58,color:rgb(.97,.94,.99)});
 page.drawImage(logo,{x:450,y:761,width:100,height:45.33});
 page.drawText('MWISHO TOURIST HOTEL',{x:45,y:785,font:bold,size:18,color:purple});
 page.drawText('Taste of Class  |  ACCOMMODATION RECEIPT',{x:46,y:766,font,size:10,color:purple});
 page.drawText(tidy(data.status),{x:45,y:722,font:bold,size:13,color:data.balance>0?rgb(.65,.31,.03):rgb(.1,.45,.2)});
 line('Receipt number',data.receipt_number,697);
 line('Issued',new Date(row.created_at).toLocaleString('en-KE',{timeZone:'Africa/Nairobi'}),676);
 line('Guest',data.guest_name,655);
 line('Room / section',`${data.room_number} / ${data.category}`,634);
 line('Package',data.package,613);
 line('Check in',data.check_in_date,592);line('Check out',data.check_out_date,571);
 page.drawLine({start:{x:45,y:552},end:{x:550,y:552},color:rgb(.82,.77,.87),thickness:1});
 line('Accommodation bill',`KSh ${amount(data.total)}`,530);
 line('Payments received',`KSh ${amount(data.paid)}`,509);
 line('Outstanding balance',`KSh ${amount(data.balance)}`,488);
 if(data.organization)line('Invoice organization',data.organization,467);
 page.drawText('PAYMENT RECORD',{x:45,y:440,font:bold,size:10,color:purple});
 let y=421;
 for(const p of data.payments.slice(0,10)){
  page.drawText(tidy(`${p.date}  ${p.method.toUpperCase()}  ${p.reference||'No reference'}`).slice(0,67),{x:45,y,font,size:9,color:grey});
  const paidText=`KSh ${amount(p.amount)}`;
  page.drawText(paidText,{x:545-font.widthOfTextAtSize(paidText,9),y,font,size:9,color:grey});y-=18;
 }
 if(data.payments.length>10)page.drawText(`${data.payments.length-10} additional payments are included in the total.`,{x:45,y:y-4,font,size:9,color:grey});
 if(row.etims_url){
  const imageData=await QRCode.toDataURL(row.etims_url,{errorCorrectionLevel:'M',margin:2,width:220});
  const image=await pdf.embedPng(Uint8Array.from(atob(imageData.split(',')[1]),c=>c.charCodeAt(0)));
  page.drawImage(image,{x:435,y:70,width:110,height:110});
  page.drawText('Scan To Open Etims/Etr Receipt',{x:404,y:58,font,size:8,color:purple});
 }
 page.drawText('This receipt records payments actually received. An invoice or pending approval is not a payment.',{x:45,y:45,font,size:8,color:grey});
 return await pdf.save();
};

Deno.serve(async(req:Request)=>{
 const origin=req.headers.get('origin');
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors(origin)});
 const url=Deno.env.get('SUPABASE_URL')||'',serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
 if(!url||!serviceKey)return json({error:'Receipt service not configured'},503,origin);
 const db=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
 try{
  if(req.method==='GET'){
   const u=new URL(req.url),token=u.searchParams.get('token')||'';
   if(!/^[0-9a-f]{64}$/.test(token))return json({error:'Invalid or expired receipt link'},404,origin);
   const {data:receipt}=await db.from('hotel_accommodation_receipts').select('*').eq('token_hash',await digest(token)).is('revoked_at',null).gt('expires_at',new Date().toISOString()).maybeSingle();
   if(!receipt)return json({error:'Invalid, revoked or expired receipt link'},404,origin);
   const format=u.searchParams.get('format');
   if(format&&format!=='a4'&&format!=='thermal')return json({error:'Unsupported print format'},400,origin);
   const pdf=format==='thermal'?await asThermalPdf(receipt):await asPdf(receipt);
   return new Response(new Uint8Array(pdf),{headers:{...cors(origin),'content-type':'application/pdf','content-disposition':`attachment; filename="Mwisho-Receipt-${receipt.id.slice(0,8)}.pdf"`,'cache-control':'private, no-store','referrer-policy':'no-referrer','x-content-type-options':'nosniff'}});
  }
  if(req.method!=='POST')return json({error:'Method not supported'},405,origin);
  const jwt=(req.headers.get('authorization')||'').replace(/^Bearer\s+/i,'');
  const {data:{user},error:authError}=await db.auth.getUser(jwt);
  if(authError||!user)return json({error:'Sign in required'},401,origin);
  const userDb=createClient(url,Deno.env.get('SUPABASE_ANON_KEY')||'',{global:{headers:{Authorization:`Bearer ${jwt}`}},auth:{persistSession:false,autoRefreshToken:false}});
  const {data:allowed,error:allowError}=await userDb.rpc('hotel_accommodation_can_reception');
  if(allowError||allowed!==true)return json({error:'Reception access required'},403,origin);
  const body=await req.json().catch(()=>({}));
  const stayId=String(body.stay_id||'');
  if(!/^[0-9a-f-]{36}$/i.test(stayId))return json({error:'Invalid stay'},400,origin);
  const {data:stay,error:stayError}=await userDb.from('hotel_accommodation_stays').select('*').eq('id',stayId).maybeSingle();
  if(stayError||!stay)return json({error:'Stay inaccessible'},403,origin);
  if(stay.status!=='checked_out')return json({error:'Complete checkout before creating or sending a receipt'},409,origin);
  const endpoint=`${url}/functions/v1/hotel-accommodation-receipts`;
  if(body.action==='list'){
   const {data:rows,error:listError}=await db.from('hotel_accommodation_receipts')
    .select('id,created_at,expires_at,revoked_at,snapshot,etims_url')
    .eq('stay_id',stayId).order('created_at',{ascending:false}).limit(50);
   if(listError)return json({error:'Could not list saved receipts'},503,origin);
   return json({receipts:(rows||[]).map((r:any)=>({receipt_id:r.id,created_at:r.created_at,expires_at:r.expires_at,revoked:!!r.revoked_at,receipt_number:r.snapshot?.receipt_number,status:r.snapshot?.status,has_etims:!!r.etims_url,guest_phone:stay.guest_phone||'',guest_email:stay.email||''}))},200,origin);
  }
  if(body.action==='open'){
   const receiptId=String(body.receipt_id||'');
   const {data:old}=await db.from('hotel_accommodation_receipts').select('id,revoked_at,expires_at,snapshot,token_cipher').eq('id',receiptId).eq('stay_id',stayId).maybeSingle();
   if(!old)return json({error:'Saved receipt not found'},404,origin);
   if(old.revoked_at)return json({error:'Revoked receipt cannot be shared again'},409,origin);
   if(!old.token_cipher||new Date(old.expires_at).getTime()<=Date.now())return json({receipt_id:receiptId,legacy:true,expires_at:old.expires_at,status:old.snapshot?.status,guest_phone:stay.guest_phone||'',guest_email:stay.email||''},200,origin);
   let token:string;
   try{token=await openToken(old.token_cipher,serviceKey)}catch{return json({error:'Could not retrieve the original secure receipt link'},503,origin)}
   return json({receipt_id:receiptId,url:`${endpoint}?token=${token}`,expires_at:old.expires_at,status:old.snapshot?.status,guest_phone:stay.guest_phone||'',guest_email:stay.email||''},200,origin);
  }
  if(body.action==='pdf'){
   const receiptId=String(body.receipt_id||''),format=String(body.format||'a4');
   if(!['a4','thermal'].includes(format))return json({error:'Unsupported print format'},400,origin);
   const {data:saved}=await db.from('hotel_accommodation_receipts').select('*').eq('id',receiptId).eq('stay_id',stayId).maybeSingle();
   if(!saved)return json({error:'Saved receipt not found'},404,origin);
   const bytes=format==='thermal'?await asThermalPdf(saved):await asPdf(saved);
   let encoded='';for(let i=0;i<bytes.length;i+=8192)encoded+=String.fromCharCode(...bytes.slice(i,i+8192));
   return json({pdf_base64:btoa(encoded),receipt_number:saved.snapshot?.receipt_number},200,origin);
  }
  if(body.action==='create'){
   let etims:null|string;
   try{etims=validEtims(body.etims_url)}catch(e){return json({error:String(e instanceof Error?e.message:e)},400,origin)}
   const [{data:room},{data:payments,error:paymentError}]=await Promise.all([
    userDb.from('hotel_accommodation_rooms').select('room_number,category').eq('id',stay.room_id).maybeSingle(),
    userDb.from('hotel_accommodation_payments').select('amount_kes,method,reference,received_at').eq('stay_id',stayId).order('received_at')
   ]);
   if(paymentError||!room)return json({error:'Could not verify room and payment records'},503,origin);
   const paid=(payments||[]).reduce((sum:number,p:any)=>sum+Number(p.amount_kes||0),0),total=Number(stay.total_kes||0),balance=Math.max(0,total-paid);
   const token=hex(crypto.getRandomValues(new Uint8Array(32)).buffer),now=new Date(),expiry=new Date(now.getTime()+30*86400000),receiptId=crypto.randomUUID();
   const snapshot={receipt_number:`MTH-${now.getUTCFullYear()}-${receiptId.slice(0,8).toUpperCase()}`,guest_name:stay.guest_name,room_number:room.room_number,category:room.category,package:stay.package_key,
    check_in_date:stay.check_in_date,check_out_date:stay.actual_check_out_date||stay.expected_check_out_date,
    total,paid,balance,organization:stay.invoice_organization_name||'',status:balance>0?(stay.invoice_organization_name?'INVOICE PENDING':'PAYMENT / APPROVAL PENDING'):'PAID',
    payments:(payments||[]).map((p:any)=>({date:String(p.received_at).slice(0,10),method:p.method,reference:p.reference,amount:p.amount_kes}))};
   const {data:receipt,error:insertError}=await db.from('hotel_accommodation_receipts').insert({id:receiptId,stay_id:stayId,token_hash:await digest(token),token_cipher:await sealToken(token,serviceKey),snapshot,etims_url:etims,expires_at:expiry.toISOString(),created_by:user.id}).select('id,created_at').single();
   if(insertError)return json({error:'Could not create receipt'},503,origin);
   return json({receipt_id:receipt.id,url:`${endpoint}?token=${token}`,expires_at:expiry.toISOString(),status:snapshot.status,guest_phone:stay.guest_phone||'',guest_email:stay.email||''},200,origin);
  }
  if(body.action==='send'){
   const token=String(body.token||''),channel=String(body.channel||'');
   if(!/^[0-9a-f]{64}$/.test(token)||!['sms','email'].includes(channel))return json({error:'Invalid delivery request'},400,origin);
   const hash=await digest(token);
   const {data:receipt}=await db.from('hotel_accommodation_receipts').select('id').eq('stay_id',stayId).eq('token_hash',hash).is('revoked_at',null).gt('expires_at',new Date().toISOString()).maybeSingle();
   if(!receipt)return json({error:'Receipt link expired or inaccessible'},404,origin);
   const recipient=channel==='sms'?String(stay.guest_phone||''):String(stay.email||'');
   if(channel==='sms'&&!/^(\+?254|0)?[17]\d{8}$/.test(recipient.replace(/\s/g,'')))return json({error:'Guest has no valid Kenyan mobile number'},400,origin);
   if(channel==='email'&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient))return json({error:'Guest has no valid email'},400,origin);
   const {count}=await db.from('hotel_accommodation_receipt_delivery').select('id',{count:'exact',head:true}).eq('receipt_id',receipt.id).eq('channel',channel).gte('created_at',new Date(Date.now()-300000).toISOString());
   if((count||0)>0)return json({error:'This receipt was already queued for this channel in the last five minutes'},429,origin);
   const {count:allCount}=await db.from('hotel_accommodation_receipt_delivery').select('id',{count:'exact',head:true}).eq('receipt_id',receipt.id);
   if((allCount||0)>=5)return json({error:'Delivery limit reached; ask management for assistance'},429,origin);
   const link=`${endpoint}?token=${token}`;
   const message=`MWISHO TOURIST HOTEL: Your accommodation receipt is available for 30 days: ${link}`;
   const {data:job,error:queueError}=await db.from('hotel_notification_outbox').insert({source_kind:'accommodation_receipt',source_id:receipt.id,event_key:'receipt_'+channel+'_'+crypto.randomUUID(),channel,recipient,customer_name:stay.guest_name,subject:'MWISHO Tourist Hotel - Accommodation Receipt',message,status:'pending'}).select('id').single();
   if(queueError)return json({error:'Could not queue receipt delivery'},503,origin);
   await db.from('hotel_accommodation_receipt_delivery').insert({receipt_id:receipt.id,channel,recipient,created_by:user.id});
   // Dispatch through the established provider worker. A queued response must
   // not be presented as delivered unless its outbox status confirms it.
   await fetch(`${url}/functions/v1/hotel-notifications`,{method:'POST',headers:{authorization:`Bearer ${serviceKey}`,'content-type':'application/json'},body:'{}',signal:AbortSignal.timeout(20000)}).catch(()=>null);
   const {data:delivery}=await db.from('hotel_notification_outbox').select('status,last_error').eq('id',job.id).single();
   return json({queued:true,channel,status:delivery?.status||'pending',error:delivery?.status==='failed'?'Delivery provider did not accept the message':null},200,origin);
  }
  if(body.action==='revoke'){
   const receiptId=String(body.receipt_id||'');
   const {data:receipt}=await db.from('hotel_accommodation_receipts').select('id').eq('id',receiptId).eq('stay_id',stayId).maybeSingle();
   if(!receipt)return json({error:'Receipt not found'},404,origin);
   const {error:revokeError}=await db.from('hotel_accommodation_receipts').update({revoked_at:new Date().toISOString()}).eq('id',receiptId);
   return revokeError?json({error:'Could not revoke link'},503,origin):json({revoked:true},200,origin);
  }
  return json({error:'Unknown action'},400,origin);
 }catch(e){return json({error:'Receipt service could not complete the request'},500,origin)}
});
