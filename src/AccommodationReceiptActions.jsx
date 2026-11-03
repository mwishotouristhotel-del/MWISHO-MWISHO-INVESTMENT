import React,{useEffect,useState} from 'react';

const phoneForWhatsApp=value=>{
 const digits=String(value||'').replace(/\D/g,'');
 if(/^254[17]\d{8}$/.test(digits))return digits;
 if(/^0[17]\d{8}$/.test(digits))return '254'+digits.slice(1);
 if(/^[17]\d{8}$/.test(digits))return '254'+digits;
 return '';
};
const tokenFromUrl=link=>new URL(link).searchParams.get('token');
const printUrl=(url,format)=>url+(url.includes('?')?'&':'?')+'format='+format;

export default function AccommodationReceiptActions({supabase,stay}){
 const [etims,setEtims]=useState(''),[receipt,setReceipt]=useState(null),[saved,setSaved]=useState([]),[working,setWorking]=useState(''),[feedback,setFeedback]=useState('');
 const signInMessage='Your session has expired. Please sign in again to access saved receipts.';
 const ensureSession=async()=>{
  const {data:{session},error:sessionError}=await supabase.auth.getSession();
  if(sessionError||!session)throw Error(signInMessage);
  const {error:identityError}=await supabase.auth.getUser();
  if(!identityError)return;
  const {data:renewed,error:renewError}=await supabase.auth.refreshSession();
  if(renewError||!renewed?.session)throw Error(signInMessage);
  const {error:verifiedError}=await supabase.auth.getUser();
  if(verifiedError)throw Error(signInMessage);
 };
 const request=async(body)=>{
  await ensureSession();
  const {data,error}=await supabase.functions.invoke('hotel-accommodation-receipts',{body:{stay_id:stay.id,...body}});
  if(error){
   let detail=data?.error;
   if(!detail&&error.context?.json){try{detail=(await error.context.json())?.error}catch{/* Retain the original error. */}}
   throw Error(detail==='Sign in required'?signInMessage:detail||error.message||'Receipt request failed');
  }
  if(data?.error)throw Error(data.error==='Sign in required'?signInMessage:data.error);
  return data;
 };
 const loadSaved=async()=>{
  const data=await request({action:'list'});setSaved(data.receipts||[]);
 };
 useEffect(()=>{let live=true;request({action:'list'}).then(data=>{if(live)setSaved(data.receipts||[])}).catch(e=>{if(live)setFeedback(e.message)});return()=>{live=false}},[stay.id,supabase]);
 const run=async(action,operation)=>{
  setWorking(action);setFeedback('');
  try{await operation()}catch(e){setFeedback(e.message||'Receipt action failed')}finally{setWorking('')}
 };
 const create=()=>run('create',async()=>{
  const data=await request({action:'create',etims_url:etims.trim()});
  setReceipt(data);await loadSaved();setFeedback('Receipt saved. The secure sharing link is valid for 30 days.');
 });
 const openSaved=entry=>run('open',async()=>{
  const data=await request({action:'open',receipt_id:entry.receipt_id});
  setReceipt(data);setFeedback(data.legacy?'Older saved receipt opened for printing. Its original sharing link was not stored recoverably.':'Saved receipt reopened with its original sharing link.');
 });
 const downloadSaved=format=>run('pdf-'+format,async()=>{
  const data=await request({action:'pdf',receipt_id:receipt.receipt_id,format});
  const binary=atob(data.pdf_base64),bytes=new Uint8Array(binary.length);
  for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
  const url=URL.createObjectURL(new Blob([bytes],{type:'application/pdf'}));
  const anchor=document.createElement('a');anchor.href=url;anchor.download=`Mwisho-Receipt-${data.receipt_number||receipt.receipt_id}-${format}.pdf`;
  document.body.appendChild(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
  setFeedback('Saved receipt PDF downloaded.');
 });
 const send=channel=>run(channel,async()=>{
  const data=await request({action:'send',channel,token:tokenFromUrl(receipt.url)});
  setFeedback(data.status==='sent'?channel.toUpperCase()+' delivered.':data.status==='failed'?channel.toUpperCase()+' could not be delivered. Check notification settings.':channel.toUpperCase()+' queued for delivery; not yet confirmed sent.');
 });
 const revoke=()=>run('revoke',async()=>{
  if(!window.confirm('Revoke this receipt download link immediately?'))return;
  await request({action:'revoke',receipt_id:receipt.receipt_id});
  setReceipt(null);await loadSaved();setFeedback('Receipt link revoked; saved history remains available.');
 });
 const whatsapp=phoneForWhatsApp(receipt?.guest_phone||stay.guest_phone);
 const shareText=receipt?'MWISHO TOURIST HOTEL: Download your accommodation receipt (available for 30 days): '+receipt.url:'';
 return <section className="mw-receipt-card" aria-label="Accommodation receipt">
  <h4>🧾 Accommodation Receipts</h4>
  <div className="mw-receipt-saved">
   <strong>Saved receipt history</strong>
   {!saved.length?<p><small>No receipts saved for this stay yet.</small></p>:<ul>{saved.map(entry=><li key={entry.receipt_id}>
    <span>{entry.receipt_number||'Receipt'} · {new Date(entry.created_at).toLocaleDateString('en-KE')} · {entry.status} {entry.revoked?'(revoked)':''}</span>
    <button type="button" disabled={!!working||entry.revoked} onClick={()=>openSaved(entry)}>Open & repeat actions</button>
   </li>)}</ul>}
  </div>
  <label>eTIMS/ETR verification link for a new receipt (optional)<input type="url" placeholder="HTTPS eTIMS/ETR link" value={etims} onChange={e=>setEtims(e.target.value)} disabled={!!working}/></label>
  <small>When supplied, the link is encoded in the receipt QR. The printed link text is omitted.</small>
  <button type="button" disabled={!!working} onClick={create}>{working==='create'?'Creating receipt…':'Create & save new receipt'}</button>
  {receipt&&<>
   <p className="mw-receipt-expiry">✓ Receipt ready · {receipt.status} · {receipt.legacy?'Original sharing link unavailable':'Link expires '+new Date(receipt.expires_at).toLocaleDateString('en-KE')}</p>
   <div className="mw-receipt-buttons">
    {receipt.legacy?<>
     <button type="button" disabled={!!working} onClick={()=>downloadSaved('a4')}>⬇ Download A4 PDF</button>
     <button type="button" disabled={!!working} onClick={()=>downloadSaved('thermal')}>⬇ Download XP-80 (80 mm) PDF</button>
    </>:<>
     <a href={printUrl(receipt.url,'a4')} target="_blank" rel="noreferrer">⬇ Download A4 PDF</a>
     <a href={printUrl(receipt.url,'thermal')} target="_blank" rel="noreferrer">⬇ Download XP-80 (80 mm) PDF</a>
    <button type="button" onClick={()=>{navigator.clipboard?.writeText(receipt.url).then(()=>setFeedback('Secure link copied.')).catch(()=>setFeedback('Could not copy link.'))}}>Copy receipt link</button>
    <button type="button" disabled={!whatsapp} onClick={()=>window.open('https://wa.me/'+whatsapp+'?text='+encodeURIComponent(shareText),'_blank','noopener,noreferrer')}>Share via WhatsApp</button>
    <button type="button" disabled={!!working||!receipt.guest_phone} onClick={()=>send('sms')}>Resend SMS link</button>
    <button type="button" disabled={!!working||!receipt.guest_email} onClick={()=>send('email')}>Resend Email</button>
    </>}
    <button type="button" disabled={!!working} onClick={revoke}>Revoke link</button>
   </div>
   <small>{receipt.legacy?'This older receipt can be downloaded and printed without generating a replacement receipt or link. To share, attach its PDF manually.':'Print the 80 mm PDF using the XP-80C printer driver at actual size. The original secure link remains valid for 30 days from creation unless revoked.'}</small>
  </>}
  {feedback&&<p role="status" className="mw-receipt-feedback">{feedback}</p>}
  {feedback===signInMessage&&<button type="button" onClick={async()=>{await supabase.auth.signOut({scope:'local'});window.location.reload()}}>Sign in again</button>}
 </section>;
}
