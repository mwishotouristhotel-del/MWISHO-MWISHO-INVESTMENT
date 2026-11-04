import React,{useEffect,useState} from 'react';

const blank={label:'',account_type:'bank',details:'',is_active:true,show_on_invoice:true,show_on_quotation:true,display_order:0};
export default function HotelDocumentSettings({supabase}){
 const [terms,setTerms]=useState({invoice_terms:'',quotation_terms:'',receipt_terms:''}),[accounts,setAccounts]=useState([]),[newAccount,setNewAccount]=useState({...blank});
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 async function refresh(){
  const [a,b]=await Promise.all([
   supabase.from('hotel_document_settings').select('invoice_terms,quotation_terms,receipt_terms').eq('id',1).maybeSingle(),
   supabase.from('hotel_document_payment_accounts').select('*').order('display_order').order('label')
  ]);
  if(a.error||b.error)setError(a.error?.message||b.error?.message);
  else{setTerms({invoice_terms:a.data?.invoice_terms||'',quotation_terms:a.data?.quotation_terms||'',receipt_terms:a.data?.receipt_terms||''});setAccounts(b.data||[]);setError('');}
 }
 useEffect(()=>{refresh()},[supabase]);
 const edit=(id,key,value)=>setAccounts(old=>old.map(a=>a.id===id?{...a,[key]:value}:a));
 async function saveTerms(){
  setBusy(true);setError('');setNotice('');
  const {error:e}=await supabase.from('hotel_document_settings').upsert({id:1,...Object.fromEntries(Object.entries(terms).map(([k,v])=>[k,v.trim()])),updated_at:new Date().toISOString()});
  if(e)setError(e.message);else setNotice('Invoice, quotation and receipt terms saved independently. Newly issued documents will use their respective wording.');
  setBusy(false);
 }
 async function saveAccount(account,isNew=false){
  if(account.label.trim().length<2||account.details.trim().length<3){setError('Enter the account name and complete approved payment details.');return;}
  setBusy(true);setError('');setNotice('');
  const payload={label:account.label.trim(),account_type:account.account_type,details:account.details.trim(),is_active:!!account.is_active,
   show_on_invoice:!!account.show_on_invoice,show_on_quotation:!!account.show_on_quotation,display_order:Number(account.display_order)||0,updated_at:new Date().toISOString()};
  const query=isNew?supabase.from('hotel_document_payment_accounts').insert(payload):supabase.from('hotel_document_payment_accounts').update(payload).eq('id',account.id);
  const {error:e}=await query;
  if(e)setError(e.message);else{setNotice('Payment account saved.');if(isNew)setNewAccount({...blank});await refresh();}
  setBusy(false);
 }
 const editor=(account,isNew=false)=>{
  const set=(key,value)=>isNew?setNewAccount(old=>({...old,[key]:value})):edit(account.id,key,value);
  return <div key={account.id||'new'} style={{display:'grid',gap:9,padding:14,border:'1px solid #dfd3ea',borderRadius:12}}>
   <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(170px,1fr))',gap:10}}>
    <label>Account Name<input maxLength={100} placeholder="e.g. Equity Bank or M-Pesa Till" value={account.label} onChange={e=>set('label',e.target.value)}/></label>
    <label>Payment Type<select value={account.account_type} onChange={e=>set('account_type',e.target.value)}>
     <option value="bank">Bank Account</option><option value="mpesa_till">M-Pesa Till</option><option value="mpesa_paybill">M-Pesa Paybill</option><option value="other">Other</option>
    </select></label>
    <label>Display Order<input type="number" value={account.display_order} onChange={e=>set('display_order',e.target.value)}/></label>
   </div>
   <label>Approved Account Details<textarea rows={3} maxLength={800} placeholder="Bank, account name, account number, branch — or Till/Paybill details" value={account.details} onChange={e=>set('details',e.target.value)}/></label>
   <div style={{display:'flex',gap:16,flexWrap:'wrap'}}>
    {[['is_active','Active account'],['show_on_invoice','Show by default on invoices'],['show_on_quotation','Show by default on quotations']].map(([key,label])=><label key={key}><input type="checkbox" checked={!!account[key]} onChange={e=>set(key,e.target.checked)}/> {label}</label>)}
   </div>
   <button disabled={busy} type="button" onClick={()=>saveAccount(account,isNew)}>{isNew?'Add Payment Account':'Save Payment Account'}</button>
  </div>;
 };
 return <section style={{display:'grid',gap:16}}>
  <h3>Invoice, Quotation & Receipt Terms and Payment Accounts</h3>
  <p>Admin manages the official document terms and payment accounts here. Staff can select from active accounts when downloading an invoice or quotation; inactive accounts will not be offered. Changes affect newly generated PDFs, not previously issued documents.</p>
  {error&&<p role="alert" style={{color:'#b42331'}}>{error}</p>}{notice&&<p role="status" style={{color:'#167447'}}>{notice}</p>}
  {[['quotation_terms','Quotation Terms & Conditions'],['invoice_terms','Invoice Terms & Conditions'],['receipt_terms','Receipt Terms & Conditions']].map(([key,label])=><label key={key}><strong>{label}</strong><textarea rows={6} maxLength={5000} value={terms[key]} onChange={e=>setTerms(old=>({...old,[key]:e.target.value}))} placeholder={`Enter hotel-approved ${label.toLowerCase()}`}/></label>)}
  <button disabled={busy} type="button" onClick={saveTerms}>Save Document Terms & Conditions</button>
  <h4>Approved Payment Accounts</h4>
  {accounts.map(a=>editor(a))}
  <h4>Add Payment Account</h4>
  {editor(newAccount,true)}
 </section>;
}
