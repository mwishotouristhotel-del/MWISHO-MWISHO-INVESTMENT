import React,{useEffect,useState} from 'react';
import './WebsiteStaffTasks.css';

export const WEBSITE_AREAS=[
 ['service_cards','Homepage & service cards'],['website_settings','Website text, contact & links'],
 ['rooms','Rooms, rates & photos'],['gallery','Gallery photos & videos'],
 ['promotions','Advertisements & pop-ups'],['events','Events & tickets'],
 ['conference','Conference packages'],['restaurant','Restaurant & dining content'],
 ['reviews','Customer reviews & testimonials'],['contact','Contact & customer information']
];
const areaLabel=id=>WEBSITE_AREAS.find(([key])=>key===id)?.[1]||id;
const when=value=>new Date(value).toLocaleString('en-KE',{timeZone:'Africa/Nairobi'});

export default function WebsiteStaffTasks({supabase,userId,isAdmin=false}){
 const [permissions,setPermissions]=useState([]),[directory,setDirectory]=useState([]),[submissions,setSubmissions]=useState([]);
 const [target,setTarget]=useState(''),[area,setArea]=useState('service_cards');
 const [title,setTitle]=useState(''),[details,setDetails]=useState(''),[url,setUrl]=useState('');
 const [editing,setEditing]=useState(null),[comments,setComments]=useState({});
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('');
 const myAreas=permissions.filter(p=>p.staff_id===userId).map(p=>p.area);
 const chosenArea=myAreas.includes(area)?area:myAreas[0];
 async function load(){
  const requests=[supabase.from('hotel_website_staff_permissions').select('*'),
   supabase.from('hotel_website_staff_submissions').select('*').order('created_at',{ascending:false}).limit(200)];
  if(isAdmin)requests.push(supabase.from('staff_profiles').select('user_id,display_name,active').eq('active',true).order('display_name'));
  const [p,s,d]=await Promise.all(requests);
  if(p.error||s.error||d?.error){setError(p.error?.message||s.error?.message||d?.error?.message);return;}
  setPermissions(p.data||[]);setSubmissions(s.data||[]);if(d)setDirectory(d.data||[]);
 }
 useEffect(()=>{load()},[supabase,userId,isAdmin]);
 async function run(action,success){
  setBusy(true);setError('');setMessage('');
  try{const {error:e}=await action();if(e)throw e;setMessage(success);await load();}
  catch(e){setError(e.message||String(e));}finally{setBusy(false);}
 }
 async function submit(e){e.preventDefault();if(!chosenArea)return;
  const payload={submitted_by:userId,area:chosenArea,title:title.trim(),details:details.trim(),proposed_url:url.trim()};
  await run(()=>supabase.from('hotel_website_staff_submissions').insert(payload),'Submitted for Director/Admin approval. Nothing has been published.');
 }
 function review(item,action){
  const comment=(comments[item.id]||'').trim();
  if(['rejected','changes_requested'].includes(action)&&comment.length<3){setError('Enter a reason for rejection or requested changes.');return;}
  if(action==='published'&&!window.confirm('Confirm this content has already been applied using the appropriate admin website editor?'))return;
  run(()=>supabase.rpc('hotel_website_review_staff_submission',{p_id:item.id,p_action:action,p_comment:comment}),
   action==='published'?'Marked published.':'Review recorded. The customer site has not been changed.');
 }
 function resubmit(e){e.preventDefault();
  run(()=>supabase.rpc('hotel_website_resubmit_staff_submission',{p_id:editing.id,p_title:title.trim(),p_details:details.trim(),p_url:url.trim()}),'Corrections submitted for review.');
  setEditing(null);setTitle('');setDetails('');setUrl('');
 }
 const names=Object.fromEntries(directory.map(x=>[x.user_id,x.display_name]));
 const pending=submissions.filter(x=>x.status==='pending');
 return <section className="mw-web-tasks">
  <header><div><h3>{isAdmin?'Website Staff Tasks & Approval Center':'My Website Assignments'}</h3><p>Staff submit proposals. Only management may change the live customer website.</p></div><button type="button" onClick={load}>Refresh</button></header>
  {error&&<p role="alert" className="mw-web-error">{error}</p>}{message&&<p role="status" className="mw-web-ok">{message}</p>}
  {isAdmin&&<div className="mw-task-card"><h4>Assign website responsibilities</h4><p>Give individual staff members permission to submit proposals in selected areas. Permissions never include publishing.</p>
   <label>Staff member<select value={target} onChange={e=>setTarget(e.target.value)}><option value="">Select staff</option>{directory.filter(x=>x.user_id!==userId).map(x=><option key={x.user_id} value={x.user_id}>{x.display_name}</option>)}</select></label>
   {target&&<div className="mw-task-permissions">{WEBSITE_AREAS.map(([id,label])=>{
    const granted=permissions.some(p=>p.staff_id===target&&p.area===id);
    return <label key={id}><input type="checkbox" checked={granted} disabled={busy} onChange={e=>run(()=>e.target.checked?
      supabase.from('hotel_website_staff_permissions').insert({staff_id:target,area:id,granted_by:userId}):
      supabase.from('hotel_website_staff_permissions').delete().eq('staff_id',target).eq('area',id),
      'Website permissions updated.')}/>{label}</label>;
   })}</div>}
  </div>}
  {!isAdmin&&<div className="mw-task-card"><h4>{editing?'Correct and resubmit':'Submit a website update'}</h4>
   {myAreas.length===0?<p>No website functions assigned yet. Ask Director/Admin to assign the relevant function.</p>:
   <form onSubmit={editing?resubmit:submit}>
    <label>Website function<select value={editing?.area||chosenArea} disabled={!!editing} onChange={e=>setArea(e.target.value)}>{WEBSITE_AREAS.filter(([id])=>myAreas.includes(id)).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label>
    <label>Submission title<input required minLength={3} maxLength={150} value={title} onChange={e=>setTitle(e.target.value)}/></label>
    <label>Content or requested changes<textarea required minLength={5} maxLength={6000} rows={5} value={details} onChange={e=>setDetails(e.target.value)} placeholder="Describe the new content, replacement, removal or correction. Include dates and prices where relevant."/></label>
    <label>Media or reference link (optional HTTPS)<input type="url" value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://…"/></label>
    <p>Media links are references for Admin to review; they do not upload or publish anything. Never paste passwords or customer payment details.</p>
    <button disabled={busy||!myAreas.includes(editing?.area||chosenArea)}>{editing?'Resubmit corrections':'Submit for approval'}</button>
    {editing&&<button type="button" onClick={()=>{setEditing(null);setTitle('');setDetails('');setUrl('')}}>Cancel corrections</button>}
   </form>}
  </div>}
  <div className="mw-task-card"><h4>{isAdmin?`Pending website approvals (${pending.length})`:'My submissions & notifications'}</h4>
   {isAdmin&&<p>Approve requests, then make the actual change using its existing website editor. Mark Published only after verifying the live content. Approval itself does not publish or overwrite current content.</p>}
   {submissions.length===0?<p>No submissions yet.</p>:<div className="mw-task-list">{submissions.map(item=><article key={item.id}>
    <div className="mw-task-row"><strong>{item.title}</strong><span className={'mw-task-status status-'+item.status}>{item.status.replace('_',' ')}</span></div>
    <small>{areaLabel(item.area)} · {isAdmin?(names[item.submitted_by]||'Staff member')+' · ':''}{when(item.created_at)}</small>
    <p className="mw-task-content">{item.details}</p>{item.proposed_url&&<p><a href={item.proposed_url} target="_blank" rel="noopener noreferrer">Open reference link</a></p>}
    {item.admin_comment&&<p className="mw-task-comment"><strong>Admin feedback:</strong> {item.admin_comment}</p>}
    {isAdmin&&item.status==='pending'&&<div className="mw-task-actions"><label>Admin feedback<textarea value={comments[item.id]||''} onChange={e=>setComments(v=>({...v,[item.id]:e.target.value}))} placeholder="Reason or correction instructions"/></label>
      <button disabled={busy} onClick={()=>review(item,'approved')}>Approve for publication</button><button disabled={busy} onClick={()=>review(item,'changes_requested')}>Request changes</button><button disabled={busy} onClick={()=>review(item,'rejected')}>Reject</button></div>}
    {isAdmin&&item.status==='approved'&&<button disabled={busy} onClick={()=>review(item,'published')}>Mark Published (after applying in editor)</button>}
    {!isAdmin&&item.status==='changes_requested'&&myAreas.includes(item.area)&&<button onClick={()=>{setEditing(item);setTitle(item.title);setDetails(item.details);setUrl(item.proposed_url)}}>Edit & resubmit</button>}
   </article>)}</div>}
  </div>
 </section>;
}
