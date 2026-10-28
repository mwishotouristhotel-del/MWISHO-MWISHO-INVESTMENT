import React,{useEffect,useState} from 'react';
export default function WebsiteFoodPreorders({supabase}){
 const [orders,setOrders]=useState([]),[error,setError]=useState(''),[busy,setBusy]=useState('');
 async function load(){const {data,error:e}=await supabase.from('hotel_website_food_preorders').select('*').order('created_at',{ascending:false}).limit(100);if(e)setError(e.message);else{setOrders(data||[]);setError('');}}
 useEffect(()=>{load()},[supabase]);
 async function review(item,approved){
  const proof=window.prompt(approved?'Enter verification evidence (e.g. statement reference and amount checked):':'Reason for rejecting the transaction:');
  if(proof===null)return;
  if(approved&&!proof.trim()){setError('Provide the evidence used to verify payment before approving.');return;}
  if(!window.confirm(approved?'Have you physically checked this transaction on the hotel M-Pesa record, and confirmed the amount and code?':'Reject this payment claim?'))return;
  setBusy(item.id);setError('');
  const {error:e}=await supabase.rpc('review_website_food_preorder',{p_id:item.id,p_approved:approved,p_note:proof.trim()});
  if(e)setError(e.message);else await load();
  setBusy('');
 }
 return <section className="mw-food-review">
  <h3>Website Food Pre-orders — M-Pesa Verification</h3>
  <p>Cashier or Admin must check the M-Pesa account statement for the exact transaction code and full amount. Customer-submitted codes are not proof of payment. No order enters the kitchen automatically.</p>
  <button type="button" onClick={load}>Refresh orders</button>
  {error&&<p role="alert">{error}</p>}
  <div className="mw-request-cards">{orders.map(o=><article key={o.id}>
   <h4>{o.customer_name} — KES {Number(o.total_kes).toLocaleString('en-KE')}</h4>
   <p>Arrival: {new Date(o.arrival_at).toLocaleString('en-KE',{timeZone:'Africa/Nairobi'})}</p>
   <p>Contact: {o.phone}</p><p>M-Pesa reference: <strong>{o.mpesa_reference}</strong></p>
   <p>Items: {(Array.isArray(o.items)?o.items:[]).map(x=>x.name+' × '+x.qty).join(', ')}</p>
   <p>Status: <strong>{o.status}</strong></p>
   {o.status==='pending_verification'&&<div className="mw-food-review-actions">
    <button disabled={busy===o.id} onClick={()=>review(o,true)}>Verify Payment</button>
    <button disabled={busy===o.id} onClick={()=>review(o,false)}>Reject</button>
   </div>}
   {o.verification_note&&<small>Verification note: {o.verification_note}</small>}
  </article>)}</div>
 </section>;
}