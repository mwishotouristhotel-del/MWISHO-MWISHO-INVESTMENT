import React,{useEffect,useState} from 'react';
export default function WebsiteEventTickets({supabase}){
 const [requests,setRequests]=useState([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 async function reload(){
  const {data,error:e}=await supabase.from('hotel_website_event_ticket_requests').select('*').order('created_at',{ascending:false}).limit(200);
  if(e)setError(e.message);else{setRequests(data||[]);setError('');}
 }
 useEffect(()=>{reload()},[supabase]);
 async function review(item,status){
  if(!window.confirm(status==='confirmed'?'Have you verified all payment/booking requirements? Confirm reservation?':'Reject this ticket request?'))return;
  setBusy(true);setNotice('');setError('');
  try{
   const {data:{user},error:authError}=await supabase.auth.getUser();
   if(authError||!user)throw Error('Sign in required.');
   if(status==='confirmed'){
    const {data:event,error:evError}=await supabase.from('hotel_website_promotions').select('ticket_capacity').eq('id',item.event_id).single();
    if(evError)throw evError;
    if(event?.ticket_capacity!==null){
     const {data:confirmed,error:countError}=await supabase.from('hotel_website_event_ticket_requests').select('quantity').eq('event_id',item.event_id).eq('status','confirmed');
     if(countError)throw countError;
     const used=(confirmed||[]).reduce((sum,x)=>sum+Number(x.quantity||0),0);
     if(used+Number(item.quantity)>Number(event.ticket_capacity))throw Error('Not enough ticket capacity to confirm.');
    }
   }
   const {data,error:e}=await supabase.from('hotel_website_event_ticket_requests')
    .update({status,reviewed_by:user.id,reviewed_at:new Date().toISOString()})
    .eq('id',item.id).eq('status','pending_review').select('id').single();
   if(e||!data)throw Error(e?.message||'Request already reviewed.');
   setNotice('Ticket request '+(status==='confirmed'?'confirmed':'rejected')+'.');await reload();
  }catch(e){setError(e.message||String(e));}finally{setBusy(false);}
 }
 return <section className="mw-ticket-admin" style={{display:'grid',gap:13}}>
  <header><h3>Event Ticket Booking Requests</h3><p>Bookings submitted from published hotel events. Ticket requests are not automatically paid or issued. Confirm only after the hotel's payment and capacity checks.</p></header>
  {error&&<p role="alert" style={{color:'#b42336'}}>{error}</p>}{notice&&<p role="status" style={{color:'#168055'}}>{notice}</p>}
  <button type="button" disabled={busy} onClick={reload}>Refresh Ticket Requests</button>
  {!requests.length&&<p>No ticket requests submitted yet.</p>}
  {requests.map(x=><article key={x.id} style={{border:'1px solid #ded4ed',borderRadius:10,padding:13,display:'grid',gap:8}}>
   <strong>{x.event_title} — {x.quantity} ticket{x.quantity===1?'':'s'}</strong>
   <span>{x.customer_name} · {x.customer_phone} · {x.customer_email}</span>
   <span>{x.total_kes===null?'Price to confirm with hotel':'Total KES '+Number(x.total_kes).toLocaleString('en-KE')} · Status: {x.status.replaceAll('_',' ')}</span>
   {x.notes&&<p>Customer notes: {x.notes}</p>}
   <small>Submitted {new Date(x.created_at).toLocaleString('en-KE')}</small>
   {x.status==='pending_review'&&<div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
    <button type="button" disabled={busy} onClick={()=>review(x,'confirmed')}>Confirm after verification</button>
    <button type="button" disabled={busy} onClick={()=>review(x,'rejected')}>Reject</button>
   </div>}
  </article>)}
 </section>;
}