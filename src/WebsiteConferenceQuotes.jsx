import React,{useEffect,useState} from 'react';
import {downloadConferenceQuotation} from './conferenceQuotationPdf.js';
export default function WebsiteConferenceQuotes({supabase}){
 const [quotes,setQuotes]=useState([]),[staff,setStaff]=useState([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [edits,setEdits]=useState({});
 const [drafts,setDrafts]=useState({}),[pdfFiles,setPdfFiles]=useState({});
 const [documentTerms,setDocumentTerms]=useState(''),[approvedAccounts,setApprovedAccounts]=useState([]),[selectedAccounts,setSelectedAccounts]=useState({});
 const draftFor=q=>drafts[q.id]||{items:[{description:q.package_name||'Conference Package',unitPrice:'',pax:q.number_of_pax||1,days:q.number_of_days||1}],vat:'0'};
 const chosenAccounts=q=>selectedAccounts[q.id]??approvedAccounts.filter(a=>a.is_active&&a.show_on_quotation).map(a=>a.id);
 const changeDraft=(q,patch)=>setDrafts(old=>({...old,[q.id]:{...draftFor(q),...patch}}));
 async function preparePdf(q){
  setError('');try{const d=draftFor(q);const paymentText=approvedAccounts.filter(a=>a.is_active&&chosenAccounts(q).includes(a.id)).map(a=>a.label+'\n'+a.details).join('\n\n');await downloadConferenceQuotation(q,d.items,d.vat,documentTerms,paymentText);}
  catch(e){setError(e.message||'Could not prepare PDF');}
 }
 useEffect(()=>{
  let alive=true;
  Promise.all([supabase.from('hotel_document_settings').select('quotation_terms').eq('id',1).maybeSingle(),
   supabase.from('hotel_document_payment_accounts').select('*').eq('is_active',true).order('display_order')]).then(([a,b])=>{
   if(!alive)return;
   if(a.error||b.error)setError('Document settings unavailable: '+(a.error?.message||b.error?.message));
   else{setDocumentTerms(a.data?.quotation_terms||'');setApprovedAccounts(b.data||[]);}
  });return()=>{alive=false;};
 },[supabase]);
 async function publishPdf(q){
  const file=pdfFiles[q.id];
  if(!file||file.type!=='application/pdf'||file.size>10*1024*1024||file.size===0){setError('Select a stamped PDF of 10 MB or less.');return;}
  if(!window.confirm('Publish this stamped quotation and email the customer a secure 30-day download link?'))return;
  setBusy(true);setError('');setNotice('');
  try{
   const path=q.id+'/'+crypto.randomUUID()+'.pdf';
   const {error:uploadError}=await supabase.storage.from('mwisho-conference-quotes').upload(path,file,{upsert:false,contentType:'application/pdf'});
   if(uploadError)throw Error('Upload failed: '+uploadError.message);
   const {data,error}=await supabase.functions.invoke('hotel-conference-quotation',{body:{action:'publish',quote_id:q.id,path}});
   if(error||!data?.ok)throw Error(data?.error||error?.message||'Publication failed. The PDF uploaded but was not published; please contact Admin.');
   setNotice(data.reference+': '+data.message);setPdfFiles(old=>({...old,[q.id]:null}));await refresh();
  }catch(e){setError(e.message||'Could not publish quotation');}finally{setBusy(false);}
 }
 async function refresh(){
  const [a,b]=await Promise.all([
   supabase.from('hotel_website_conference_quotes').select('*').order('created_at',{ascending:false}).limit(200),
   supabase.from('staff_profiles').select('user_id,display_name,active').eq('active',true).order('display_name').limit(150)
  ]);
  if(a.error)setError(a.error.message);else{setQuotes(a.data||[]);setError('');}
  if(b.error)setError(x=>x||'Staff list cannot be loaded: '+b.error.message);else setStaff(b.data||[]);
 }
 useEffect(()=>{refresh()},[supabase]);
 function edit(id,key,value){setEdits(e=>({...e,[id]:{...e[id],[key]:value}}));}
 async function save(q){
  setBusy(true);setError('');setNotice('');
  try{
   const data=edits[q.id]||{};
   const assignee=data.assigned_to===undefined?q.assigned_to:data.assigned_to||null;
   const status=data.status||q.status;
   const notes=data.admin_notes===undefined?q.admin_notes:data.admin_notes;
   if(assignee&&!staff.some(s=>s.user_id===assignee))throw Error('Choose an active staff member.');
   const {data:session,error:e1}=await supabase.auth.getUser();
   if(e1||!session?.user)throw Error('Please sign in again.');
   const changed=assignee!==q.assigned_to;
   const {data:updated,error:e}=await supabase.from('hotel_website_conference_quotes').update({
    assigned_to:assignee,status:assignee&&status==='new'?'assigned':status,
    admin_notes:notes,updated_at:new Date().toISOString(),
    ...(changed?{assigned_by:session.user.id,assigned_at:assignee?new Date().toISOString():null}:{})
   }).eq('id',q.id).select('id').single();
   if(e||!updated)throw Error(e?.message||'Request could not be updated.');
   setNotice('Quotation request updated.');await refresh();
   supabase.functions.invoke('hotel-notifications',{body:{action:'dispatch'}}).catch(()=>{});
  }catch(e){setError(e.message||String(e));}finally{setBusy(false);}
 }
 return <section style={{display:'grid',gap:15}}>
  <h3>Conference Quotation Requests</h3>
  <p>Prepare an itemized PDF, print it for authorized signing and stamping, then upload the approved PDF. Publishing makes a secure 30-day download link available by email when hotel email notifications are enabled.</p>
  {error&&<p role="alert" style={{color:'#b42331'}}>{error}</p>}{notice&&<p role="status" style={{color:'#197550'}}>{notice}</p>}
  <button type="button" disabled={busy} onClick={refresh}>Refresh Requests</button>
  {!quotes.length&&<p>No quotation requests have been submitted.</p>}
  {quotes.map(q=>{
   const current=edits[q.id]||{};
   const referenceYear=new Intl.DateTimeFormat('en',{year:'numeric',timeZone:'Africa/Nairobi'}).format(new Date(q.created_at));
   const quotationReference='MTH'+referenceYear+'-'+q.id.replace(/-/g,'').slice(0,10).toUpperCase();
   return <article key={q.id} style={{border:'1px solid #e4d9ef',borderRadius:12,padding:16,display:'grid',gap:9}}>
    <strong>{q.organization_name} — {q.package_name||'Custom Requirements'}</strong>
    <span><strong>Quotation Reference:</strong> {quotationReference}</span>
    <span>Event: {q.event_date}{q.event_start_time?' at '+q.event_start_time.slice(0,5):''}{q.event_end_date?' — '+q.event_end_date+' at '+(q.event_end_time||'').slice(0,5):''} · {q.number_of_pax} pax · {q.number_of_days??1} day{Number(q.number_of_days??1)===1?'':'s'} · Submitted: {new Date(q.created_at).toLocaleString('en-KE')}</span>
    <span>KRA PIN: {q.organization_kra_pin}</span>
    <span>Organization: {q.organization_email} | {q.organization_phone}</span>
    <span>Contact: {q.contact_person} | {q.contact_phone}</span>
    {q.requirements&&<p style={{whiteSpace:'pre-wrap'}}><strong>Requirements:</strong> {q.requirements}</p>}
    {!!q.cc_emails?.length&&<p>Quotation CC addresses: {q.cc_emails.join(', ')}</p>}
    <details style={{border:'1px solid #e3d8ef',borderRadius:10,padding:12}}>
     <summary style={{fontWeight:700,cursor:'pointer'}}>Prepare Quotation PDF · Stamp · Publish</summary>
     <p>Enter agreed rates (KSh), quantities and days. VAT defaults to 0%; enter the applicable rate only when confirmed. Payment instructions are editable and are not taken from the sample document.</p>
     {draftFor(q).items.map((item,i)=><div key={i} style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(125px,1fr))',gap:8,marginBottom:8,alignItems:'end'}}>
      <label>Item / service<input value={item.description} onChange={e=>changeDraft(q,{items:draftFor(q).items.map((x,n)=>n===i?{...x,description:e.target.value}:x)})}/></label>
      {['unitPrice','pax','days'].map((field,n)=><label key={field}>{['Rate (KSh)','Pax / Qty','Days'][n]}<input type="number" min="0" step={field==='unitPrice'?'0.01':'1'} value={item[field]} onChange={e=>changeDraft(q,{items:draftFor(q).items.map((x,j)=>j===i?{...x,[field]:e.target.value}:x)})}/></label>)}
      <button type="button" onClick={()=>changeDraft(q,{items:draftFor(q).items.filter((_,n)=>n!==i)})}>Remove</button>
     </div>)}
     <button type="button" onClick={()=>changeDraft(q,{items:[...draftFor(q).items,{description:'',unitPrice:'',pax:1,days:1}]})}>+ Add quotation item</button>
     <label>VAT (%)<input type="number" min="0" max="100" step="0.01" value={draftFor(q).vat} onChange={e=>changeDraft(q,{vat:e.target.value})}/></label>
     <strong>Grand total: KSh {(draftFor(q).items.reduce((s,x)=>s+Number(x.unitPrice||0)*Number(x.pax||0)*Number(x.days||0),0)*(1+Number(draftFor(q).vat||0)/100)).toLocaleString('en-KE',{minimumFractionDigits:2,maximumFractionDigits:2})}</strong>
     <div><strong>Admin-approved Terms & Conditions</strong><p style={{whiteSpace:'pre-wrap'}}>{documentTerms||'No shared terms configured. Ask Admin to add document terms.'}</p></div>
     <div><strong>Payment Accounts to Print on this Quotation</strong>
      {approvedAccounts.map(a=><label key={a.id} style={{display:'block'}}><input type="checkbox" checked={chosenAccounts(q).includes(a.id)} onChange={e=>setSelectedAccounts(old=>({...old,[q.id]:e.target.checked?[...chosenAccounts(q),a.id]:chosenAccounts(q).filter(id=>id!==a.id)}))}/> {a.label} — {a.details}</label>)}
      {!approvedAccounts.length&&<p>No active payment accounts are configured. Admin can add Equity Bank, M-Pesa Till and other approved accounts in Document Settings.</p>}
     </div>
     <button type="button" disabled={busy} onClick={()=>preparePdf(q)}>⬇ Download Draft Quotation PDF</button>
     <p>After authorized signature and hotel stamp, scan or save the signed document as a PDF and upload it below.</p>
     <label>Stamped and approved PDF (max 10 MB)<input type="file" accept="application/pdf,.pdf" onChange={e=>setPdfFiles(old=>({...old,[q.id]:e.target.files?.[0]||null}))}/></label>
     <button type="button" disabled={busy||!pdfFiles[q.id]} onClick={()=>publishPdf(q)}>Publish Approved PDF & Email Customer Link</button>
     {q.quote_published_at&&<p><strong>Last published:</strong> {new Date(q.quote_published_at).toLocaleString('en-KE')}. Link expires {new Date(q.quote_link_expires_at).toLocaleDateString('en-KE')}. {q.quote_download_token&&<a href={'https://vsrkdykljelafkoixjtq.supabase.co/functions/v1/hotel-conference-quotation?token='+q.quote_download_token} target="_blank" rel="noreferrer">Download approved quotation</a>}</p>}
    </details>
    <label>Assign staff member<select value={current.assigned_to===undefined?(q.assigned_to||''):current.assigned_to} onChange={e=>edit(q.id,'assigned_to',e.target.value)}>
     <option value="">Not assigned</option>{staff.map(member=><option value={member.user_id} key={member.user_id}>{member.display_name||member.user_id}</option>)}
    </select></label>
    <label>Request status<select value={current.status||q.status} onChange={e=>edit(q.id,'status',e.target.value)}>
     {['new','assigned','preparing','quoted','closed'].map(x=><option key={x} value={x}>{x.replace('_',' ')}</option>)}
    </select></label>
    <label>Admin / quotation preparation notes<textarea rows={3} maxLength={3000} value={current.admin_notes===undefined?q.admin_notes:current.admin_notes} onChange={e=>edit(q.id,'admin_notes',e.target.value)}/></label>
    <button type="button" disabled={busy} onClick={()=>save(q)}>Save Assignment & Status</button>
   </article>;
  })}
 </section>;
}
