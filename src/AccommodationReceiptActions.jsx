import React,{useState} from 'react';

const phoneForWhatsApp=value=>{
 const digits=String(value||'').replace(/\D/g,'');
 if(/^254[17]\d{8}$/.test(digits))return digits;
 if(/^0[17]\d{8}$/.test(digits))return '254'+digits.slice(1);
 if(/^[17]\d{8}$/.test(digits))return '254'+digits;
 return '';
};
const tokenFromUrl=link=>new URL(link).searchParams.get('token');

export default function AccommodationReceiptActions({supabase,stay}){
 const [etims,setEtims]=useState(''),[receipt,setReceipt]=useState(null),[working,setWorking]=useState(''),[feedback,setFeedback]=useState('');
 const request=async(body)=>{
  const {data,error}=await supabase.functions.invoke('hotel-accommodation-receipts',{body:{stay_id:stay.id,...body}});
  if(error)throw Error(data?.error||error.message||'Receipt request failed');
  if(data?.error)throw Error(data.error);
  return data;
 };
 const run=async(action,operation)=>{
  setWorking(action);setFeedback('');
  try{await operation()}catch(e){setFeedback(e.message||'Receipt action failed')}finally{setWorking('')}
 };
 const create=()=>run('create',async()=>{
  const data=await request({action:'create',etims_url:etims.trim()});
  setReceipt(data);setFeedback('Receipt created. Link expires in 30 days.');
 });
 const send=channel=>run(channel,async()=>{
  const data=await request({action:'send',channel,token:tokenFromUrl(receipt.url)});
  setFeedback(data.status==='sent'?`${channel.toUpperCase()} delivered.`:data.status==='failed'?`${channel.toUpperCase()} could not be delivered. Check notification settings.`:`${channel.toUpperCase()} queued for delivery; not yet confirmed sent.`);
 });
 const revoke=()=>run('revoke',async()=>{
  if(!window.confirm('Revoke this receipt download link immediately?'))return;
  await request({action:'revoke',receipt_id:receipt.receipt_id});
  setReceipt(null);setFeedback('Receipt link revoked. Create another to share a new link.');
 });
 const whatsapp=phoneForWhatsApp(receipt?.guest_phone||stay.guest_phone);
 const shareText=receipt?`MWISHO TOURIST HOTEL: Download your accommodation receipt (available for 30 days): ${receipt.url}`:'';
 return <section className="mw-receipt-card" aria-label="Accommodation receipt">
  <h4>🧾 Checkout Receipt & eTIMS QR</h4>
  {!receipt?<>
   <label>eTIMS verification link (optional)<input type="url" placeholder="Paste the HTTPS KRA eTIMS link" value={etims} onChange={e=>setEtims(e.target.value)} disabled={!!working}/></label>
   <small>The eTIMS link becomes a QR code inside the receipt. Confirm the link belongs to the correct transaction.</small>
   <button type="button" disabled={!!working} onClick={create}>{working==='create'?'Creating receipt…':'Create Receipt & Download Link'}</button>
  </>:<>
   <p className="mw-receipt-expiry">✓ Receipt ready • {receipt.status} • Expires {new Date(receipt.expires_at).toLocaleDateString('en-KE')}</p>
   <div className="mw-receipt-buttons">
    <a href={receipt.url} target="_blank" rel="noreferrer">⬇ Download PDF</a>
    <button type="button" onClick={()=>{navigator.clipboard?.writeText(receipt.url).then(()=>setFeedback('Secure link copied.')).catch(()=>setFeedback('Could not copy link.'))}}>Copy receipt link</button>
    <button type="button" disabled={!whatsapp} onClick={()=>window.open(`https://wa.me/${whatsapp}?text=${encodeURIComponent(shareText)}`,'_blank','noopener,noreferrer')}>Share via WhatsApp</button>
    <button type="button" disabled={!!working||!receipt.guest_phone} onClick={()=>send('sms')}>Send SMS link</button>
    <button type="button" disabled={!!working||!receipt.guest_email} onClick={()=>send('email')}>Send Email</button>
    <button type="button" disabled={!!working} onClick={revoke}>Revoke link</button>
   </div>
   <small>Only share this receipt with the intended guest. Anyone who has the link can download it until expiry or revocation.</small>
  </>}
  {feedback&&<p role="status" className="mw-receipt-feedback">{feedback}</p>}
 </section>;
}
