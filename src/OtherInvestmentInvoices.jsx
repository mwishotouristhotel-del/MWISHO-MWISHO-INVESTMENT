import React,{useEffect,useMemo,useState} from 'react';
import {downloadOtherIncomeInvoice} from './otherIncomeInvoicePdf.js';

const empty={issuer_entity:'hotel',category:'House Rent',bill_to:'',contact:'',address:'',kra_pin:'',invoice_date:new Date().toLocaleDateString('en-CA'),due_date:'',description:''};
const initialCategories=['House Rent','Equipment Hire','Property Lease','Other Services'];
const draftKey='mwisho-other-investment-invoice-draft-v1';
const defaultLines=()=>[{description:'',quantity:'1',unit_price_kes:''}];
const readDraft=()=>{
 try{
  const saved=JSON.parse(window.sessionStorage.getItem(draftKey)||'null');
  if(saved&&saved.form&&Array.isArray(saved.lines)&&saved.lines.length&&saved.lines.length<=50)
   return {form:{...empty,...saved.form},lines:saved.lines};
 }catch{/* Private browsing or a malformed draft must never prevent invoice creation. */}
 return {form:{...empty},lines:defaultLines()};
};
const money=n=>'KSh '+Number(n||0).toLocaleString('en-KE',{minimumFractionDigits:2});
export default function OtherInvestmentInvoices({supabase}){
 const [initialDraft]=useState(readDraft);
 const [form,setForm]=useState(initialDraft.form),[lines,setLines]=useState(initialDraft.lines);
 const [invoices,setInvoices]=useState([]),[items,setItems]=useState([]),[payments,setPayments]=useState([]),[accounts,setAccounts]=useState([]),[terms,setTerms]=useState(''),[issuerPin,setIssuerPin]=useState(''),[companyDetails,setCompanyDetails]=useState({}),[investmentCompanyDetails,setInvestmentCompanyDetails]=useState({});
 const [categories,setCategories]=useState(initialCategories),[newCategory,setNewCategory]=useState('');
 const [selected,setSelected]=useState({}),[payDraft,setPayDraft]=useState({}),[cancelDraft,setCancelDraft]=useState({}),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('');
 const total=useMemo(()=>lines.reduce((s,x)=>s+Number(x.quantity||0)*Number(x.unit_price_kes||0),0),[lines]);
 useEffect(()=>{
  try{window.sessionStorage.setItem(draftKey,JSON.stringify({form,lines}));}catch{/* Keep the form usable when storage is unavailable. */}
 },[form,lines]);
 const refresh=async()=>{
  const results=await Promise.all([
   supabase.from('hotel_other_income_invoices').select('*').order('created_at',{ascending:false}).limit(100),
   supabase.from('hotel_other_income_invoice_items').select('*').limit(500),
   supabase.from('hotel_other_income_payments').select('*').order('created_at',{ascending:false}).limit(500),
   supabase.from('hotel_document_settings').select('invoice_terms,issuer_kra_pin,company_details,investment_company_details,other_income_categories').eq('id',1).maybeSingle(),
   supabase.from('hotel_document_payment_accounts').select('*').eq('is_active',true).order('display_order')
  ]);
  const e=results.find(r=>r.error)?.error;if(e){setError(e.message);return;}
  setInvoices(results[0].data||[]);setItems(results[1].data||[]);setPayments(results[2].data||[]);
  setTerms(results[3].data?.invoice_terms||'');setIssuerPin(results[3].data?.issuer_kra_pin||'');setCompanyDetails(results[3].data?.company_details||{});setInvestmentCompanyDetails(results[3].data?.investment_company_details||{});setAccounts(results[4].data||[]);
  setCategories(Array.isArray(results[3].data?.other_income_categories)?results[3].data.other_income_categories:initialCategories);
 };
 useEffect(()=>{refresh()},[supabase]);
 const addIncomeSource=async()=>{
  const name=newCategory.trim().replace(/\s+/g,' ');
  if(name.length<2||name.length>100){setError('Income source name must contain 2–100 characters.');return;}
  if(categories.some(c=>c.toLowerCase()===name.toLowerCase())){setError('This income source already exists.');return;}
  setBusy(true);setError('');setMessage('');
  const next=[...categories,name];
  const {error:e}=await supabase.from('hotel_document_settings').upsert({id:1,other_income_categories:next,updated_at:new Date().toISOString()});
  if(e)setError(e.message);else{setCategories(next);setNewCategory('');setMessage('Income source “'+name+'” added. It is now available when creating invoices.');}
  setBusy(false);
 };
 const makeInvoice=async e=>{
  e.preventDefault();setError('');setMessage('');
  if(!lines.length||lines.some(x=>x.description.trim().length<2||!(Number(x.quantity)>0)||Number(x.unit_price_kes)<0||x.unit_price_kes==='')||total<=0){setError('Complete each item with a description, positive quantity, valid price and positive invoice total.');return;}
  setBusy(true);
  const {data,error:err}=await supabase.rpc('hotel_other_income_create_invoice_for_entity',{p_issuer:form.issuer_entity,p_category:form.category,p_bill_to:form.bill_to,p_contact:form.contact,p_address:form.address,p_kra_pin:form.kra_pin,p_date:form.invoice_date,p_due_date:form.due_date||null,p_description:form.description,p_items:lines.map(x=>({description:x.description,quantity:Number(x.quantity),unit_price_kes:Number(x.unit_price_kes)}))});
  if(err)setError(err.message);else{
   setMessage('Invoice '+data+' created. No income has been posted until payment is recorded.');
   try{window.sessionStorage.removeItem(draftKey);}catch{}
   setForm({...empty});setLines(defaultLines());await refresh();
  }
  setBusy(false);
 };
 const recordPayment=async (invoice,amountOverride)=>{
  const draft=payDraft[invoice.id]||{};setError('');setMessage('');setBusy(true);
  const {error:e}=await supabase.rpc('hotel_other_income_record_payment',{p_invoice_id:invoice.id,p_amount:Number(amountOverride??draft.amount),p_method:draft.method||'cash',p_reference:draft.reference||'',p_date:draft.date||new Date().toLocaleDateString('en-CA')});
  if(e)setError(e.message);else{setMessage('Payment recorded against '+invoice.invoice_number+'.');setPayDraft(old=>({...old,[invoice.id]:{}}));await refresh();}setBusy(false);
 };
 const cancelInvoice=async invoice=>{
  const reason=(cancelDraft[invoice.id]||'').trim();
  if(reason.length<8||reason.length>500){setError('Enter a cancellation reason of 8–500 characters.');return;}
  if(!window.confirm('Cancel '+invoice.invoice_number+'? This invoice will remain in the audit history and cannot receive payments.'))return;
  setError('');setMessage('');setBusy(true);
  const {error:e}=await supabase.rpc('hotel_other_income_cancel_invoice',{p_invoice_id:invoice.id,p_reason:reason});
  if(e)setError(e.message);else{setMessage('Invoice '+invoice.invoice_number+' cancelled. Reason saved.');setCancelDraft(old=>({...old,[invoice.id]:''}));await refresh();}
  setBusy(false);
 };
 const download=invoice=>{
  const chosen=selected[invoice.id]??accounts.filter(a=>a.show_on_invoice).map(a=>a.id);
  downloadOtherIncomeInvoice({invoice,items:items.filter(x=>x.invoice_id===invoice.id),terms,accounts:accounts.filter(a=>chosen.includes(a.id)),issuerPin,companyDetails:invoice.issuer_entity==='investment'?investmentCompanyDetails:companyDetails,issuerEntity:invoice.issuer_entity||'hotel'});
 };
 const set=(key,value)=>setForm(old=>({...old,[key]:value}));
 const setLine=(index,key,value)=>setLines(old=>old.map((row,i)=>i===index?{...row,[key]:value}:row));
 const setPay=(id,key,value)=>setPayDraft(old=>({...old,[id]:{...old[id],[key]:value}}));
 return <section style={{display:'grid',gap:18}}>
  <h3>Other MWISHO Investment Income — Internal Invoicing</h3>
  <p>Issue invoices for House Rent and other non-POS services. An invoice is a receivable; only recorded payments count as collected income. These do not affect accommodation sales, waiter bills or stock.</p>
  {error&&<p role="alert" style={{color:'#a21c37'}}>{error}</p>}{message&&<p role="status" style={{color:'#176b3b'}}>{message}</p>}
  <div style={{border:'1px solid #dccce7',borderRadius:14,padding:16,display:'grid',gap:9}}>
   <h4>Admin — Manage Other Investment Income Sources</h4>
   <p>Choose an existing income category when preparing an invoice. Add new sources such as Parking Fees, Property Rent, Hall Hire or Consultancy Income here. Previous invoices keep their saved categories.</p>
   <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>{categories.map(c=><span key={c} style={{border:'1px solid #d6c9e3',borderRadius:20,padding:'4px 10px'}}>{c}</span>)}</div>
   <div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'end'}}><label>New Income Source<input maxLength={100} value={newCategory} onChange={e=>setNewCategory(e.target.value)} placeholder="e.g. Parking Fees"/></label><button type="button" disabled={busy||!newCategory.trim()} onClick={addIncomeSource}>Add Income Source</button></div>
  </div>
  <form onSubmit={makeInvoice} style={{padding:16,border:'1px solid #dccce7',borderRadius:14,display:'grid',gap:12}}>
   <h4>Create Internal Invoice</h4>
   <small>Your unfinished invoice is kept in this browser tab if the page refreshes. It is cleared after successful creation.</small>
   <label><strong>Invoice Issued By (Select Entity)</strong><select required value={form.issuer_entity} onChange={e=>set('issuer_entity',e.target.value)}>
    <option value="hotel">MWISHO TOURIST HOTEL</option>
    <option value="investment">MWISHO MWISHO INVESTMENT LIMITED</option>
   </select></label>
   <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(190px,1fr))',gap:12}}>
    <label>Income Source / Category<select required value={form.category} onChange={e=>set('category',e.target.value)}>
     {!categories.includes(form.category)&&<option value={form.category}>{form.category} (saved draft)</option>}
     {categories.map(c=><option key={c} value={c}>{c}</option>)}
    </select></label>
    <label>Bill To / Tenant / Organization<input required maxLength={180} value={form.bill_to} onChange={e=>set('bill_to',e.target.value)}/></label>
    <label>Contact (optional)<input value={form.contact} onChange={e=>set('contact',e.target.value)}/></label>
    <label>Address (optional)<input value={form.address} onChange={e=>set('address',e.target.value)}/></label>
    <label>KRA PIN (optional)<input value={form.kra_pin} onChange={e=>set('kra_pin',e.target.value)}/></label>
    <label>Invoice Date<input required type="date" value={form.invoice_date} onChange={e=>set('invoice_date',e.target.value)}/></label>
    <label>Payment Due Date<input type="date" min={form.invoice_date} value={form.due_date} onChange={e=>set('due_date',e.target.value)}/></label>
   </div>
   <label>Additional Description / Rental Period<textarea rows={2} maxLength={1000} value={form.description} onChange={e=>set('description',e.target.value)} placeholder="e.g. November 2026 house rent, property/unit number"/></label>
   <strong>Invoice Items</strong>
   {lines.map((line,i)=><div key={i} style={{display:'grid',gridTemplateColumns:'minmax(150px,3fr) minmax(65px,1fr) minmax(100px,1fr) auto',gap:8,alignItems:'end'}}>
    <label>Service / Item<input required value={line.description} maxLength={300} onChange={e=>setLine(i,'description',e.target.value)} placeholder="e.g. Monthly house rent"/></label>
    <label>Quantity<input required type="number" step="0.001" min="0.001" value={line.quantity} onChange={e=>setLine(i,'quantity',e.target.value)}/></label>
    <label>Unit Price (KSh)<input required type="number" step="0.01" min="0" value={line.unit_price_kes} onChange={e=>setLine(i,'unit_price_kes',e.target.value)}/></label>
    <button type="button" disabled={lines.length===1} onClick={()=>setLines(old=>old.filter((_,j)=>i!==j))}>Remove</button>
   </div>)}
   <button type="button" disabled={lines.length>=50} onClick={()=>setLines(old=>[...old,{description:'',quantity:'1',unit_price_kes:''}])}>+ Add Item</button>
   <strong>Total Invoice: {money(total)}</strong><button type="submit" disabled={busy||total<=0}>{busy?'Saving…':'Create Invoice'}</button>
  </form>
  <div><h4>Internal Invoices & Collected Income</h4><button type="button" onClick={refresh}>Refresh Invoices</button></div>
  <div style={{display:'grid',gap:12}}>{invoices.map(invoice=>{
   const paid=payments.filter(p=>p.invoice_id===invoice.id).reduce((s,p)=>s+Number(p.amount_kes),0);
   const balance=Math.max(0,Number(invoice.total_kes)-paid),draft=payDraft[invoice.id]||{};
   const checked=selected[invoice.id]??accounts.filter(a=>a.show_on_invoice).map(a=>a.id);
   return <article key={invoice.id} style={{border:'1px solid #ded0e8',borderRadius:12,padding:14}}>
    <strong>{invoice.invoice_number} · {invoice.category}</strong><p>Issuer: {invoice.issuer_entity==='investment'?'MWISHO MWISHO INVESTMENT LIMITED':'MWISHO TOURIST HOTEL'} · {invoice.bill_to} · {invoice.invoice_date} · <strong>{invoice.status.toUpperCase()}</strong></p>
    <p>Invoiced: {money(invoice.total_kes)} | Paid: {money(paid)} | Outstanding: {money(invoice.status==='cancelled'?0:balance)}</p>
    <details><summary>Invoice PDF & Payment Accounts</summary><p>Current Admin invoice terms will appear on this newly downloaded PDF.</p>
     {accounts.map(a=><label key={a.id} style={{display:'block'}}><input type="checkbox" checked={checked.includes(a.id)} onChange={e=>setSelected(old=>({...old,[invoice.id]:e.target.checked?[...checked,a.id]:checked.filter(id=>id!==a.id)}))}/> {a.label}</label>)}
     <button type="button" onClick={()=>download(invoice)}>Download A4 Invoice PDF</button></details>
    {invoice.status==='cancelled'&&<p role="status" style={{color:'#9b2334'}}><strong>Cancelled:</strong> {invoice.cancellation_reason} {invoice.cancelled_at&&'· '+new Date(invoice.cancelled_at).toLocaleString('en-KE')}</p>}
    {invoice.status!=='cancelled'&&balance>0&&<details><summary>Record Payment / Mark Invoice Paid</summary>
     <div style={{display:'flex',flexWrap:'wrap',gap:10,alignItems:'end'}}>
      <label>Amount (KSh)<input type="number" min="0.01" max={balance} step="0.01" value={draft.amount||''} onChange={e=>setPay(invoice.id,'amount',e.target.value)}/></label>
      <label>Method<select value={draft.method||'cash'} onChange={e=>setPay(invoice.id,'method',e.target.value)}><option value="cash">Cash</option><option value="mpesa">M-Pesa</option><option value="bank">Bank</option><option value="pdq">PDQ</option><option value="other">Other</option></select></label>
      <label>Reference<input value={draft.reference||''} onChange={e=>setPay(invoice.id,'reference',e.target.value)}/></label>
      <label>Payment Date<input type="date" value={draft.date||new Date().toLocaleDateString('en-CA')} onChange={e=>setPay(invoice.id,'date',e.target.value)}/></label>
      <button type="button" disabled={busy||!(Number(draft.amount)>0)||Number(draft.amount)>balance} onClick={()=>recordPayment(invoice)}>Confirm Received Payment</button>
      <button type="button" disabled={busy} onClick={()=>recordPayment(invoice,balance)}>Mark Invoice Paid — {money(balance)}</button>
      <small>Mark Paid records the full outstanding amount using the selected method, reference and date. Enter a reference for M-Pesa, Bank or PDQ.</small>
     </div></details>}
    {invoice.status==='unpaid'&&paid===0&&<details><summary>Cancel Invoice</summary>
     <p>A cancellation keeps the invoice in the records but excludes it from outstanding receivables. Invoices with recorded payments cannot be cancelled here.</p>
     <label>Reason for Cancellation (required)<textarea rows={2} minLength={8} maxLength={500} value={cancelDraft[invoice.id]||''} onChange={e=>setCancelDraft(old=>({...old,[invoice.id]:e.target.value}))} placeholder="e.g. Issued to the wrong customer; replacement invoice required"/></label>
     <button type="button" disabled={busy||(cancelDraft[invoice.id]||'').trim().length<8} onClick={()=>cancelInvoice(invoice)}>Confirm Cancel Invoice</button>
    </details>}
    {!!payments.filter(p=>p.invoice_id===invoice.id).length&&<details><summary>Payment History</summary>{payments.filter(p=>p.invoice_id===invoice.id).map(p=><p key={p.id}>{p.payment_date} · {p.method} · {money(p.amount_kes)} · {p.payment_reference}</p>)}</details>}
   </article>})}{!invoices.length&&<p>No internal invoices have been created yet.</p>}</div>
 </section>;
}
