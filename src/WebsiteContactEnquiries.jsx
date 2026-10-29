import React,{useEffect,useState} from 'react';
export default function WebsiteContactEnquiries({supabase}){
 const [items,setItems]=useState([]),[drafts,setDrafts]=useState({}),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState(''),[notice,setNotice]=useState('');
 async function refresh(){
  setLoading(true);
  const {data,error:e}=await supabase.from('hotel_website_contact_enquiries')
   .select('*').order('created_at',{ascending:false}).limit(200);
  if(e)setError('Enquiry inbox: '+e.message);else{setItems(data||[]);setError('');}
  setLoading(false);
 }
 useEffect(()=>{refresh()},[supabase]);
 const change=(id,key,value)=>setDrafts(d=>({...d,[id]:{...d[id],[key]:value}}));
 async function save(item){
  setBusy(true);setError('');setNotice('');
  const edits=drafts[item.id]||{};
  const status=edits.status??item.status,staff_notes=edits.staff_notes??item.staff_notes;
  if(!['new','in_progress','resolved'].includes(status)||staff_notes.length>2000){
   setError('Invalid status or notes too long.');setBusy(false);return;
  }
  const {data,error:e}=await supabase.from('hotel_website_contact_enquiries')
   .update({status,staff_notes,updated_at:new Date().toISOString()}).eq('id',item.id).select('id').single();
  if(e||!data)setError(e?.message||'Unable to save enquiry.');
  else{setNotice('Enquiry updated.');await refresh();}
  setBusy(false);
 }
 const pending=items.filter(x=>x.status!=='resolved').length;
 return <section className="mw-website-contact-inbox" style={{display:'grid',gap:14}}>
  <header><h3>Customer Enquiries</h3><p>Messages submitted through the hotel customer website. Only authorized administrators may view or update this inbox.</p>
   <strong>{pending} open enquiry{pending===1?'':'ies'} · {items.length} most recent received</strong></header>
  {error&&<p role="alert" style={{color:'#ad253a'}}>{error}</p>}
  {notice&&<p role="status" style={{color:'#176d49'}}>{notice}</p>}
  <button type="button" disabled={busy} onClick={refresh}>Refresh Enquiries</button>
  {loading?<p>Loading enquiries…</p>:!items.length?<p>No customer enquiries received yet.</p>:
  items.map(item=><article key={item.id} style={{border:'1px solid #e2d7ef',borderRadius:11,padding:14,display:'grid',gap:9,overflowWrap:'anywhere'}}>
   <div style={{display:'flex',gap:10,flexWrap:'wrap',justifyContent:'space-between'}}>
    <strong>{item.customer_name} — {item.topic}</strong>
    <small>{new Date(item.created_at).toLocaleString('en-KE',{timeZone:'Africa/Nairobi'})}</small>
   </div>
   <a href={'mailto:'+encodeURIComponent(item.customer_email)}>{item.customer_email}</a>
   <p style={{whiteSpace:'pre-wrap',margin:'3px 0 8px'}}>{item.message}</p>
   <label>Status<select value={drafts[item.id]?.status??item.status} onChange={e=>change(item.id,'status',e.target.value)}>
    <option value="new">New</option><option value="in_progress">In Progress</option><option value="resolved">Resolved</option>
   </select></label>
   <label>Internal notes<textarea rows={3} maxLength={2000} value={drafts[item.id]?.staff_notes??item.staff_notes} onChange={e=>change(item.id,'staff_notes',e.target.value)}/></label>
   <button type="button" disabled={busy} onClick={()=>save(item)}>Save Enquiry Update</button>
  </article>)}
 </section>;
}