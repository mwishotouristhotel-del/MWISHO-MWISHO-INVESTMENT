import React,{useEffect,useState} from 'react';
export default function WebsiteFoodPayments({supabase}){
 const [orders,setOrders]=useState([]),[till,setTill]=useState(''),[enabled,setEnabled]=useState(false);
 const [busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[notice,setNotice]=useState(''),[error,setError]=useState('');
 const [reviewNotes,setReviewNotes]=useState({});
 async function refresh(){
  setLoading(true);
  const [settings,results]=await Promise.all([
   supabase.from('hotel_website_settings').select('key,value').in('key',['mpesa_till_number','food_order_enabled']),
   supabase.from('hotel_website_food_orders').select('*').order('created_at',{ascending:false}).limit(150)
  ]);
  if(settings.error||results.error)setError(settings.error?.message||results.error?.message);
  else{
   const values=Object.fromEntries((settings.data||[]).map(x=>[x.key,x.value]));
   setTill(values.mpesa_till_number||'');setEnabled(values.food_order_enabled==='true');
   setOrders(results.data||[]);setError('');
  }
  setLoading(false);
 }
 useEffect(()=>{refresh()},[supabase]);
 async function saveSettings(){
  if(till&& !/^\d{5,15}$/.test(till)){setError('Till number must contain 5–15 digits.');return;}
  if(enabled&&!till){setError('Enter and verify the hotel Till number before enabling food orders.');return;}
  setBusy(true);setError('');setNotice('');
  const {error:e}=await supabase.from('hotel_website_settings').upsert([
   {key:'mpesa_till_number',value:till,updated_at:new Date().toISOString()},
   {key:'food_order_enabled',value:String(enabled),updated_at:new Date().toISOString()}
  ]);
  if(e)setError(e.message);else setNotice('M-Pesa Till and website ordering settings saved.');
  setBusy(false);
 }
 async function review(order,approved){
  const action=approved?'approve':'reject';
  if(!window.confirm(approved?'Have you independently checked the Till statement, amount and transaction code?':'Reject this payment proof?'))return;
  setBusy(true);setError('');setNotice('');
  try{
   const {data:{user},error:userError}=await supabase.auth.getUser();
   if(userError||!user)throw Error('You must sign in to approve payments.');
   const {data,error:e}=await supabase.from('hotel_website_food_orders').update({
    status:approved?'approved_for_kitchen':'rejected',
    reviewed_by:user.id,reviewed_at:new Date().toISOString(),
    review_notes:(reviewNotes[order.id]||'').trim()
   }).eq('id',order.id).eq('status','pending_verification').select('id').single();
   if(e||!data)throw Error(e?.message||'Order was already reviewed or is unavailable.');
   await refresh();
   setNotice(approved?'Verified and approved for kitchen handover.':'Payment proof rejected.');
  }catch(e){setError(e.message||String(e));}
  finally{setBusy(false);}
 }
 async function complete(order){
  setBusy(true);setError('');
  const {data,error:e}=await supabase.from('hotel_website_food_orders')
    .update({status:'completed'}).eq('id',order.id).eq('status','approved_for_kitchen')
    .select('id').single();
  if(e||!data)setError(e?.message||'Could not complete order');
  else{await refresh();setNotice('Website food order marked completed.');}
  setBusy(false);
 }
 return <section className="mw-web-food-payments" style={{display:'grid',gap:16}}>
  <header><h3>Website Food Orders & Manual M-Pesa</h3><p>Customer transaction codes are payment claims, not automatic proof of payment. Approve only after independently checking your Till transactions. Approved orders appear in the kitchen handover queue below.</p></header>
  <article style={{padding:16,background:'#f8f4ff',border:'1px solid #e2d3f7',borderRadius:12}}>
   <h4>Hotel M-Pesa Till Settings</h4>
   <label>Official Buy Goods Till Number<input value={till} inputMode="numeric" onChange={e=>setTill(e.target.value.replace(/[^0-9]/g,'').slice(0,15))} placeholder="Enter verified Till number"/></label>
   <label style={{display:'flex',gap:8,alignItems:'center',margin:'12px 0'}}><input type="checkbox" checked={enabled} onChange={e=>setEnabled(e.target.checked)}/> Activate food ordering on customer website</label>
   <button type="button" disabled={busy||loading} onClick={saveSettings}>Save M-Pesa Settings</button>
  </article>
  {error&&<p role="alert" style={{color:'#b32436'}}>{error}</p>}
  {notice&&<p role="status" style={{color:'#206244'}}>{notice}</p>}
  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12,flexWrap:'wrap'}}><h3>Pending M-Pesa Verification</h3><button type="button" onClick={refresh} disabled={busy}>Refresh Orders</button></div>
  {loading?<p>Loading…</p>:!orders.some(o=>o.status==='pending_verification')?<p>No pending payment proofs.</p>:
   <div style={{display:'grid',gap:12}}>{orders.filter(o=>o.status==='pending_verification').map(o=><article key={o.id} style={{border:'1px solid #ddd2ec',padding:14,borderRadius:12}}>
    <strong>{o.customer_name} — KES {Number(o.total_kes).toLocaleString('en-KE')}</strong>
    <p>Phone: {o.customer_phone} · Arrives: {o.arrival_date} {o.arrival_time}</p>
    <p>Claimed Till: {o.till_number} · M-Pesa code: <strong>{o.mpesa_reference}</strong></p>
    {o.order_instructions&&<p><strong>Customer instructions:</strong> {o.order_instructions}</p>}
    <ul>{(o.items||[]).map((x,i)=><li key={i}>{x.name} × {x.qty} — KES {Number(x.unit_price*x.qty).toLocaleString('en-KE')}</li>)}</ul>
    <label>Review notes<input value={reviewNotes[o.id]||''} maxLength={500} onChange={e=>setReviewNotes(v=>({...v,[o.id]:e.target.value}))}/></label>
    <div style={{display:'flex',gap:10,flexWrap:'wrap',marginTop:12}}>
     <button type="button" disabled={busy} onClick={()=>review(o,true)}>Verify Payment & Approve</button>
     <button type="button" disabled={busy} onClick={()=>review(o,false)}>Reject Proof</button>
    </div>
   </article>)}</div>}
  <h3>Approved for Kitchen Handover</h3>
  <p>Only manually approved orders appear here. Kitchen staff must receive the confirmed order before preparing it. This queue is independent of existing POS tickets.</p>
  <div style={{display:'grid',gap:10}}>
  {orders.filter(o=>o.status==='approved_for_kitchen').map(o=><article key={o.id} style={{padding:14,border:'1px solid #b7dbce',borderRadius:10}}>
    <strong>{o.customer_name} — KES {Number(o.total_kes).toLocaleString('en-KE')}</strong>
    <p>Arrival {o.arrival_date} at {o.arrival_time} · {o.customer_phone}</p>
    {o.order_instructions&&<p><strong>Preparation instructions:</strong> {o.order_instructions}</p>}
    <ul>{(o.items||[]).map((x,i)=><li key={i}>{x.name} × {x.qty}</li>)}</ul>
    <button disabled={busy} onClick={()=>complete(o)}>Mark Prepared / Completed</button>
  </article>)}
  {!orders.some(o=>o.status==='approved_for_kitchen')&&<p>No approved website kitchen orders.</p>}
  </div>
 </section>;

}
