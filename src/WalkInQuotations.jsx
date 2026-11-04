import React,{useEffect,useState} from 'react';
import {downloadConferenceQuotation} from './conferenceQuotationPdf.js';

const today=()=>new Date().toLocaleDateString('en-CA');
const empty=()=>({organization_name:'',contact_person:'',contact_phone:'',organization_email:'',event_date:today(),event_start_time:'',event_end_date:today(),event_end_time:'',requirements:'',vat_rate:'0'});
const firstItem=()=>({description:'',unitPrice:'',pax:'1',days:'1'});
const money=v=>'KSh '+Number(v||0).toLocaleString('en-KE',{minimumFractionDigits:2});
export default function WalkInQuotations({supabase}){
 const [form,setForm]=useState(empty),[items,setItems]=useState([firstItem()]),[quotes,setQuotes]=useState([]),[accounts,setAccounts]=useState([]),[terms,setTerms]=useState(''),[companyDetails,setCompanyDetails]=useState({}),[accountChoices,setAccountChoices]=useState({});
 const [busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[error,setError]=useState('');
 async function refresh(){const [a,b,c]=await Promise.all([
  supabase.from('hotel_walkin_quotations').select('*').order('created_at',{ascending:false}).limit(150),
  supabase.from('hotel_document_settings').select('quotation_terms,company_details').eq('id',1).maybeSingle(),
  supabase.from('hotel_document_payment_accounts').select('*').eq('is_active',true).order('display_order')
 ]);if(a.error||b.error||c.error)setError(a.error?.message||b.error?.message||c.error?.message);
 else{setQuotes(a.data||[]);setTerms(b.data?.quotation_terms||'');setCompanyDetails(b.data?.company_details||{});setAccounts(c.data||[]);}}
 useEffect(()=>{refresh()},[supabase]);
 const change=(key,value)=>setForm(f=>({...f,[key]:value}));
 const changeItem=(i,key,value)=>setItems(rows=>rows.map((r,j)=>i===j?{...r,[key]:value}:r));
 const total=items.reduce((sum,r)=>sum+Number(r.unitPrice||0)*Number(r.pax||0)*Number(r.days||0),0)*(1+Number(form.vat_rate||0)/100);
 async function create(e){e.preventDefault();setError('');setNotice('');
  if(items.some(r=>r.description.trim().length<2||r.unitPrice===''||Number(r.unitPrice)<0||!(Number(r.pax)>0)||!(Number(r.days)>0))||!(total>0)){setError('Complete all quotation items with valid rates and quantities.');return;}
  setBusy(true);
  const {data,error:err}=await supabase.rpc('hotel_walkin_quote_create',{p_name:form.organization_name,p_contact:form.contact_person,p_phone:form.contact_phone,p_email:form.organization_email,p_event_date:form.event_date,p_start_time:form.event_start_time||null,p_end_date:form.event_end_date||null,p_end_time:form.event_end_time||null,p_requirements:form.requirements,p_items:items.map(r=>({description:r.description,unitPrice:Number(r.unitPrice),pax:Number(r.pax),days:Number(r.days)})),p_vat:Number(form.vat_rate)});
  if(err)setError(err.message);else{setNotice('Walk-in quotation '+data+' created. Download it below for approval and signature.');setForm(empty());setItems([firstItem()]);await refresh();}setBusy(false);
 }
 async function mark(q,status){if(!window.confirm('Mark quotation '+q.reference+' as '+status.toUpperCase()+'?'))return;
  setBusy(true);setError('');const {error:e}=await supabase.rpc('hotel_walkin_quote_status',{p_id:q.id,p_status:status});if(e)setError(e.message);else{setNotice('Quotation '+q.reference+' marked '+status+'.');await refresh();}setBusy(false);
 }
 async function download(q){setError('');try{const chosen=accountChoices[q.id]??accounts.filter(a=>a.show_on_quotation).map(a=>a.id);
   await downloadConferenceQuotation(q,q.items,q.vat_rate,terms,accounts.filter(a=>chosen.includes(a.id)).map(a=>a.label+'\n'+a.details).join('\n\n'),companyDetails);
  }catch(e){setError(e.message||'Unable to prepare quotation PDF');}}
 return <section style={{display:'grid',gap:15}}>
  <h3>Walk-in / Email / Telephone Quotations</h3><p>Create a quotation internally even when the customer never submitted a website form. It uses the same hotel PDF design, quotation terms and approved payment accounts.</p>
  {error&&<p role="alert" style={{color:'#9e2338'}}>{error}</p>}{notice&&<p role="status" style={{color:'#186f43'}}>{notice}</p>}
  <form onSubmit={create} style={{display:'grid',gap:12,padding:15,border:'1px solid #dfd1e8',borderRadius:12}}>
   <h4>Prepare New Quotation</h4><div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:10}}>
   <label>Customer / Organization Name<input required maxLength={150} value={form.organization_name} onChange={e=>change('organization_name',e.target.value)}/></label>
   <label>Contact Person<input required maxLength={120} value={form.contact_person} onChange={e=>change('contact_person',e.target.value)}/></label>
   <label>Phone (optional)<input value={form.contact_phone} onChange={e=>change('contact_phone',e.target.value)}/></label>
   <label>Email (optional)<input type="email" value={form.organization_email} onChange={e=>change('organization_email',e.target.value)}/></label>
   <label>Event Starting Date<input required type="date" value={form.event_date} onChange={e=>change('event_date',e.target.value)}/></label>
   <label>Starting Time<input type="time" value={form.event_start_time} onChange={e=>change('event_start_time',e.target.value)}/></label>
   <label>Event Ending Date<input type="date" min={form.event_date} value={form.event_end_date} onChange={e=>change('event_end_date',e.target.value)}/></label>
   <label>Ending Time<input type="time" value={form.event_end_time} onChange={e=>change('event_end_time',e.target.value)}/></label></div>
   <label>Customer Requirements / Event Details<textarea rows={3} value={form.requirements} onChange={e=>change('requirements',e.target.value)}/></label>
   <strong>Quotation Items</strong>
   {items.map((item,i)=><div key={i} style={{display:'grid',gridTemplateColumns:'minmax(140px,3fr) repeat(3,minmax(70px,1fr)) auto',gap:6,alignItems:'end'}}>
    <label>Description<input required value={item.description} onChange={e=>changeItem(i,'description',e.target.value)}/></label>
    <label>Rate KSh<input required type="number" min="0" step="0.01" value={item.unitPrice} onChange={e=>changeItem(i,'unitPrice',e.target.value)}/></label>
    <label>Pax / Qty<input required type="number" min="0.001" step="0.001" value={item.pax} onChange={e=>changeItem(i,'pax',e.target.value)}/></label>
    <label>Days<input required type="number" min="0.001" step="0.001" value={item.days} onChange={e=>changeItem(i,'days',e.target.value)}/></label>
    <button type="button" disabled={items.length===1} onClick={()=>setItems(rows=>rows.filter((_,j)=>i!==j))}>Remove</button></div>)}
   <button type="button" disabled={items.length>=50} onClick={()=>setItems(rows=>[...rows,firstItem()])}>+ Add Quotation Item</button>
   <label>VAT Rate (%)<input type="number" min="0" max="100" step="0.01" value={form.vat_rate} onChange={e=>change('vat_rate',e.target.value)}/></label>
   <strong>Grand Total: {money(total)}</strong><button type="submit" disabled={busy||total<=0}>{busy?'Saving…':'Save & Prepare Quotation'}</button>
  </form>
  <h4>Saved Walk-in Quotations</h4><button type="button" onClick={refresh}>Refresh Quotations</button>
  {quotes.map(q=>{const chosen=accountChoices[q.id]??accounts.filter(a=>a.show_on_quotation).map(a=>a.id);
   return <article key={q.id} style={{border:'1px solid #dfd1e8',borderRadius:12,padding:12}}>
    <strong>{q.reference} · {q.organization_name}</strong><p>{q.event_date} · {money(q.total_kes)} · <strong>{q.status.toUpperCase()}</strong></p>
    <details><summary>Document Payment Accounts</summary>{accounts.map(a=><label key={a.id} style={{display:'block'}}><input type="checkbox" checked={chosen.includes(a.id)} onChange={e=>setAccountChoices(v=>({...v,[q.id]:e.target.checked?[...chosen,a.id]:chosen.filter(id=>id!==a.id)}))}/> {a.label}</label>)}</details>
    <button type="button" onClick={()=>download(q)}>Download Quotation PDF</button>
    {q.status==='prepared'&&<button type="button" disabled={busy} onClick={()=>mark(q,'approved')}>Mark Approved</button>}
    {q.status==='approved'&&<button type="button" disabled={busy} onClick={()=>mark(q,'booked')}>Mark Booked</button>}
    {['prepared','approved'].includes(q.status)&&<button type="button" disabled={busy} onClick={()=>mark(q,'cancelled')}>Cancel</button>}
   </article>})}{!quotes.length&&<p>No internal quotations have been prepared yet.</p>}
 </section>;
}
