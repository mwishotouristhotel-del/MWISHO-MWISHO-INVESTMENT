import React,{useEffect,useState} from 'react';
export default function WebsiteEventTickets({supabase}){
 const [requests,setRequests]=useState([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [payment,setPayment]=useState({method:'till',till:'9311663',paybill:'',account:''});
 async function reload(){
  const [tickets,settings]=await Promise.all([
   supabase.from('hotel_website_event_ticket_requests').select('*').order('created_at',{ascending:false}).limit(200),
   supabase.from('hotel_website_settings').select('key,value').in('key',['event_ticket_payment_method','event_ticket_till_number','event_ticket_paybill_number','event_ticket_paybill_account'])
  ]);
  if(tickets.error||settings.error)setError(tickets.error?.message||settings.error?.message);else{
   setRequests(tickets.data||[]);
   const v=Object.fromEntries((settings.data||[]).map(x=>[x.key,x.value]));
   setPayment({method:v.event_ticket_payment_method||'till',till:v.event_ticket_till_number||'9311663',paybill:v.event_ticket_paybill_number||'',account:v.event_ticket_paybill_account||''});
   setError('');
  }
 }
 useEffect(()=>{reload()},[supabase]);
 async function savePaymentSettings(){
  if(!['till','paybill'].includes(payment.method)||
    (payment.method==='till'&&!/^\d{5,15}$/.test(payment.till))||
    (payment.method==='paybill'&&(!/^\d{5,15}$/.test(payment.paybill)||!payment.account.trim()||payment.account.length>60))){
   setError('Enter a valid Till number, or a Paybill number and account reference.');return;
  }
  setBusy(true);setError('');setNotice('');
  const values={event_ticket_payment_method:payment.method,event_ticket_till_number:payment.till,
   event_ticket_paybill_number:payment.paybill,event_ticket_paybill_account:payment.account.trim()};
  const {error:e}=await supabase.from('hotel_website_settings').upsert(Object.entries(values).map(([key,value])=>({key,value,updated_at:new Date().toISOString()})));
  if(e)setError(e.message);else setNotice('Event ticket payment settings saved. Customer booking instructions will use the selected method.');
  setBusy(false);
 }
 async function review(item,status){
  if(status==='confirmed'&&Number(item.total_kes)>0&&!item.mpesa_reference){setError('A payment reference is required before confirming a paid ticket.');return;}
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
    .update({status,reviewed_by:user.id,reviewed_at:new Date().toISOString(),...(status==='confirmed'?{payment_verified_at:new Date().toISOString()}:{})})
    .eq('id',item.id).eq('status','pending_review').select('id').single();
   if(e||!data)throw Error(e?.message||'Request already reviewed.');
   setNotice('Ticket request '+(status==='confirmed'?'confirmed':'rejected')+'.');await reload();
  }catch(e){setError(e.message||String(e));}finally{setBusy(false);}
 }
 return <section className="mw-ticket-admin" style={{display:'grid',gap:13}}>
  <header><h3>Event Ticket Booking Requests</h3><p>Bookings submitted from published hotel events. Ticket requests are not automatically paid or issued. Confirm only after the hotel's payment and capacity checks.</p></header>
  <article style={{border:'1px solid #ded4ed',borderRadius:12,padding:16,display:'grid',gap:10,background:'#f8f4ff'}}>
   <h4>Event Ticket M-Pesa Payment Settings</h4>
   <label>Payment method<select value={payment.method} onChange={e=>setPayment(p=>({...p,method:e.target.value}))}><option value="till">Buy Goods Till</option><option value="paybill">Paybill</option></select></label>
   {payment.method==='till'?<label>Buy Goods Till Number<input inputMode="numeric" value={payment.till} onChange={e=>setPayment(p=>({...p,till:e.target.value.replace(/\D/g,'').slice(0,15)}))}/></label>:<>
    <label>Paybill Number<input inputMode="numeric" value={payment.paybill} onChange={e=>setPayment(p=>({...p,paybill:e.target.value.replace(/\D/g,'').slice(0,15)}))}/></label>
    <label>Paybill Account Number / Reference<input maxLength={60} value={payment.account} onChange={e=>setPayment(p=>({...p,account:e.target.value}))} placeholder="Account customers should enter"/></label>
   </>}
   <p>These settings apply to event tickets only; food-order payment settings remain unchanged.</p>
   <button type="button" disabled={busy} onClick={savePaymentSettings}>Save Ticket Payment Settings</button>
  </article>
  {error&&<p role="alert" style={{color:'#b42336'}}>{error}</p>}{notice&&<p role="status" style={{color:'#168055'}}>{notice}</p>}
  <button type="button" disabled={busy} onClick={reload}>Refresh Ticket Requests</button>
  {!requests.length&&<p>No ticket requests submitted yet.</p>}
  {requests.map(x=><article key={x.id} style={{border:'1px solid #ded4ed',borderRadius:10,padding:13,display:'grid',gap:8}}>
   <strong>{x.event_title} — {x.quantity} ticket{x.quantity===1?'':'s'}</strong>
   <span><strong>Ticket number:</strong> {x.tracking_number||'Legacy request'}</span>
   <span>{x.customer_name} · {x.customer_phone} · {x.customer_email}</span>
   <span><strong>M-Pesa reference:</strong> {x.mpesa_reference||'Not provided'} · <strong>Payment:</strong> {x.payment_verified_at?'Verified by hotel':'Not verified'}</span>
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
