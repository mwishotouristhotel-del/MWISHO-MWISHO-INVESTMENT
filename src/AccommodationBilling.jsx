import React,{useEffect,useMemo,useState} from 'react';
import {downloadAccommodationInvoice} from './accommodationDocuments.js';
import {accommodationTotals} from './accommodationMath.js';

const money=n=>'KSh '+Number(n||0).toLocaleString('en-KE',{minimumFractionDigits:2});

export default function AccommodationBilling({supabase,stays,payments,rooms,refresh}){
 const [invoices,setInvoices]=useState([]),[invoiceItems,setInvoiceItems]=useState([]),[requests,setRequests]=useState([]);
 const [org,setOrg]=useState({organization_name:'',organization_address:'',kra_pin:'',payment_terms:'Due on receipt'});
 const [chosen,setChosen]=useState([]),[requestsDraft,setRequestsDraft]=useState({}),[busy,setBusy]=useState(false);
 const [canApprove,setCanApprove]=useState(false);
 const [message,setMessage]=useState('');
 const load=async()=>{
  const results=await Promise.all([
   supabase.from('hotel_accommodation_invoices').select('*').order('created_at',{ascending:false}).limit(100),
   supabase.from('hotel_accommodation_invoice_items').select('*').limit(500),
   supabase.from('hotel_accommodation_complimentary_requests').select('*').order('created_at',{ascending:false}).limit(200)
  ]);
  const error=results.find(x=>x.error)?.error;
  if(error){setMessage(error.message);return;}
  setInvoices(results[0].data||[]);setInvoiceItems(results[1].data||[]);setRequests(results[2].data||[]);
 };
 useEffect(()=>{load()},[stays,payments]);
 useEffect(()=>{supabase.rpc('hotel_accommodation_can_manage_all').then(({data,error})=>setCanApprove(!error&&data===true))},[supabase]);
 const options=useMemo(()=>stays.filter(s=>{
  const due=accommodationTotals(s.check_in_date,s.expected_check_out_date,s.nightly_rate_kes,payments.filter(p=>p.stay_id===s.id)).balance;
  return s.status==='checked_out'&&due>0&&!invoiceItems.some(i=>i.stay_id===s.id);
 }),[stays,payments,invoiceItems]);
 const act=async(fn)=>{setBusy(true);setMessage('');try{await fn();await load();await refresh()}catch(e){setMessage(e.message||'Operation failed')}finally{setBusy(false)}};
 const createInvoice=()=>act(async()=>{
  if(!org.organization_name.trim()||!chosen.length)throw Error('Enter organization name and select checked-out rooms.');
  const {data,error}=await supabase.rpc('hotel_accommodation_create_invoice',{
   p_organization:org.organization_name,p_address:org.organization_address,p_kra_pin:org.kra_pin,
   p_terms:org.payment_terms,p_stays:chosen
  });
  if(error)throw error;
  setChosen([]);setOrg({organization_name:'',organization_address:'',kra_pin:'',payment_terms:'Due on receipt'});
  setMessage(`Invoice created: ${data}. Select it below to download.`);
 });
 const complimentary=stay=>act(async()=>{
  const d=requestsDraft[stay.id]||{};
  const {error}=await supabase.rpc('hotel_accommodation_request_complimentary',{
   p_stay:stay.id,p_amount:Number(d.amount),p_reason:d.reason||''
  });if(error)throw error;
  setMessage('Complimentary request submitted for management approval. It has not cleared the bill.');
 });
 const review=(id,approved)=>act(async()=>{
  const {error}=await supabase.rpc('hotel_accommodation_review_complimentary',{p_request:id,p_approve:approved});
  if(error)throw error;setMessage(approved?'Complimentary approved and posted.':'Complimentary rejected.');
 });
 const exportInvoice=invoice=>{
  const items=invoiceItems.filter(x=>x.invoice_id===invoice.id).map(x=>{
   const stay=stays.find(s=>s.id===x.stay_id);
   return {...x,guest_name:stay?.guest_name||'Guest',room_number:rooms.find(r=>r.id===stay?.room_id)?.room_number||'',
    check_in_date:stay?.check_in_date||'',expected_check_out_date:stay?.expected_check_out_date||''};
  });
  downloadAccommodationInvoice({invoice,items});
 };
 return <section id="accommodation-billing" className="mw-accommodation-panel mw-accommodation-billing">
  <h3>🧾 Accommodation Bill Clearance & Invoicing</h3>
  <p className="muted">Cash, M-Pesa and card/PDQ payments are recorded against each guest. Complimentary clearance requires separate management approval. An invoice records an outstanding organizational receivable, not money received.</p>
  <div className="mw-accommodation-billing-stats"><div><span>⏳</span><strong>{requests.filter(r=>r.status==='pending').length}</strong><small>Complimentary approvals pending</small></div><div><span>🏢</span><strong>{options.filter(s=>s.invoice_organization_name).length}</strong><small>Rooms pending invoice</small></div><div><span>📄</span><strong>{invoices.length}</strong><small>Issued invoices</small></div></div>
  {message&&<p role="status">{message}</p>}
  <details className="mw-billing-action-card"><summary><span>🎁</span> Request complimentary clearance</summary>
   {stays.filter(s=>s.status==='checked_in').map(stay=>{
    const d=requestsDraft[stay.id]||{};
    const balance=accommodationTotals(stay.check_in_date,stay.expected_check_out_date,stay.nightly_rate_kes,payments.filter(p=>p.stay_id===stay.id)).balance;
    return balance>0&&<div className="mw-accommodation-stay" key={stay.id}><strong>{stay.guest_name} — {money(balance)} outstanding</strong>
     <div className="mw-accommodation-actions"><input aria-label={`Complimentary amount for ${stay.guest_name}`} type="number" min="0.01" step="0.01" max={balance} placeholder="Amount KSh" value={d.amount||''} onChange={e=>setRequestsDraft(v=>({...v,[stay.id]:{...d,amount:e.target.value}}))}/><input aria-label="Complimentary reason" placeholder="Reason for complimentary" value={d.reason||''} onChange={e=>setRequestsDraft(v=>({...v,[stay.id]:{...d,reason:e.target.value}}))}/><button disabled={busy||!d.amount||!d.reason} onClick={()=>complimentary(stay)}>Request Approval</button></div>
    </div>;
   })}</details>
  {canApprove&&<details className="mw-billing-action-card"><summary><span>✅</span> Approve / reject complimentary requests ({requests.filter(r=>r.status==='pending').length} pending)</summary>
   {requests.filter(r=>r.status==='pending').map(r=><div key={r.id} className="mw-accommodation-stay"><strong>{stays.find(s=>s.id===r.stay_id)?.guest_name||'Guest'} — {money(r.amount_kes)}</strong><span>{r.reason}</span>{r.stated_approver_name&&<span>Stated approver: {r.stated_approver_name} · {r.stated_approver_designation} (unverified until approved here)</span>}<div className="mw-accommodation-actions"><button disabled={busy} onClick={()=>review(r.id,true)}>Approve</button><button disabled={busy} onClick={()=>review(r.id,false)}>Reject</button></div></div>)}
  </details>}
  <details className="mw-billing-action-card"><summary><span>🏢</span> Generate organization invoice (multiple rooms)</summary>
   <div className="mw-accommodation-grid">{[['organization_name','Organization / Bill To'],['organization_address','Postal / Physical Address'],['kra_pin','Organization KRA PIN'],['payment_terms','Payment Terms']].map(([key,label])=><label key={key}>{label}<input value={org[key]} onChange={e=>setOrg(v=>({...v,[key]:e.target.value}))}/></label>)}</div>
   <p className="muted">Select checked-out rooms with unpaid balances. Each room appears only once on an issued invoice.</p>
   {options.map(stay=><label key={stay.id} className="mw-accommodation-invoice-choice"><input type="checkbox" checked={chosen.includes(stay.id)} onChange={e=>{if(e.target.checked){if(stay.invoice_organization_name&&org.organization_name.trim()&&stay.invoice_organization_name.trim().toLowerCase()!==org.organization_name.trim().toLowerCase()){setMessage('This room was reserved for a different organization. Create its invoice separately.');return;}if(stay.invoice_organization_name&&!org.organization_name.trim())setOrg(v=>({...v,organization_name:stay.invoice_organization_name}));setChosen(v=>[...v,stay.id])}else setChosen(v=>v.filter(id=>id!==stay.id))}}/>
    Room {rooms.find(r=>r.id===stay.room_id)?.room_number} — {stay.guest_name} — {money(accommodationTotals(stay.check_in_date,stay.expected_check_out_date,stay.nightly_rate_kes,payments.filter(p=>p.stay_id===stay.id)).balance)} {stay.invoice_organization_name&&<strong> · {stay.invoice_organization_name}</strong>}
   </label>)}
   {!options.length&&<p>No eligible checked-out rooms with uninvoiced balances.</p>}
   <button className="primary" disabled={busy||!chosen.length||!org.organization_name.trim()} onClick={createInvoice}>Create Invoice for {chosen.length} Room(s)</button>
  </details>
  <h4>Issued Invoices</h4>
  {invoices.map(invoice=><div key={invoice.id} className="mw-accommodation-stay"><div><strong>{invoice.invoice_number} — {invoice.organization_name}</strong><span>{invoice.invoice_date} • {invoiceItems.filter(i=>i.invoice_id===invoice.id).length} room(s) • {money(invoiceItems.filter(i=>i.invoice_id===invoice.id).reduce((n,i)=>n+Number(i.amount_kes),0))}</span></div><button onClick={()=>exportInvoice(invoice)}>Download PDF Invoice</button></div>)}
  {!invoices.length&&<p>No invoices issued.</p>}
 </section>;
}
