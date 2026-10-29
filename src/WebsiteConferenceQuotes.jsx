import React,{useEffect,useState} from 'react';
export default function WebsiteConferenceQuotes({supabase}){
 const [quotes,setQuotes]=useState([]),[staff,setStaff]=useState([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [edits,setEdits]=useState({});
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
  }catch(e){setError(e.message||String(e));}finally{setBusy(false);}
 }
 return <section style={{display:'grid',gap:15}}>
  <h3>Conference Quotation Requests</h3>
  <p>Review requests and assign an active staff member to prepare a quotation. Sending a quotation email is not automatic; CC recipients are saved for the quotation preparation stage.</p>
  {error&&<p role="alert" style={{color:'#b42331'}}>{error}</p>}{notice&&<p role="status" style={{color:'#197550'}}>{notice}</p>}
  <button type="button" disabled={busy} onClick={refresh}>Refresh Requests</button>
  {!quotes.length&&<p>No quotation requests have been submitted.</p>}
  {quotes.map(q=>{
   const current=edits[q.id]||{};
   return <article key={q.id} style={{border:'1px solid #e4d9ef',borderRadius:12,padding:16,display:'grid',gap:9}}>
    <strong>{q.organization_name} — {q.package_name||'Custom Requirements'}</strong>
    <span>Event: {q.event_date} · {q.number_of_pax} pax · {q.number_of_days??1} day{Number(q.number_of_days??1)===1?'':'s'} · Submitted: {new Date(q.created_at).toLocaleString('en-KE')}</span>
    <span>KRA PIN: {q.organization_kra_pin}</span>
    <span>Organization: {q.organization_email} | {q.organization_phone}</span>
    <span>Contact: {q.contact_person} | {q.contact_phone}</span>
    {q.requirements&&<p style={{whiteSpace:'pre-wrap'}}><strong>Requirements:</strong> {q.requirements}</p>}
    {!!q.cc_emails?.length&&<p>Quotation CC addresses: {q.cc_emails.join(', ')}</p>}
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