import React,{useEffect,useState} from 'react';

const defaults={sms_enabled:false,email_enabled:false,afrinet_partner_id:'4429',afrinet_sender_id:'MwishoHotel',
 afrinet_key_saved:false,gmail_sender_name:'MWISHO TOURIST HOTEL',gmail_address:'',gmail_password_saved:false};

export default function WebsiteNotifications({supabase}){
 const [settings,setSettings]=useState(defaults),[apiKey,setApiKey]=useState(''),[password,setPassword]=useState('');
 const [jobs,setJobs]=useState([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const patch=(key,value)=>setSettings(p=>({...p,[key]:value}));
 async function refresh(){
  const [config,list]=await Promise.all([
   supabase.rpc('hotel_notification_admin_settings'),
   supabase.from('hotel_notification_outbox').select('id,source_kind,event_key,channel,recipient,status,attempts,last_error,created_at').order('created_at',{ascending:false}).limit(100)
  ]);
  if(config.error||list.error){setError(config.error?.message||list.error?.message);return;}
  setSettings({...defaults,...config.data});setJobs(list.data||[]);setError('');
 }
 useEffect(()=>{refresh()},[supabase]);
 async function save(){
  setBusy(true);setError('');setNotice('');
  const {error:e}=await supabase.rpc('hotel_notification_save_settings',{
   p_sms_enabled:settings.sms_enabled,p_email_enabled:settings.email_enabled,
   p_partner_id:settings.afrinet_partner_id,p_sender_id:settings.afrinet_sender_id,
   p_gmail_name:settings.gmail_sender_name,p_gmail_address:settings.gmail_address,
   p_afrinet_key:apiKey||null,p_gmail_password:password||null
  });
  if(e)setError(e.message);else{setNotice('Notification settings saved. New customer updates will use enabled channels.');setApiKey('');setPassword('');await refresh();}
  setBusy(false);
 }
 async function dispatch(retryId){
  setBusy(true);setError('');setNotice('');
  const {data,error:e}=await supabase.functions.invoke('hotel-notifications',{body:retryId?{action:'retry',id:retryId}:{action:'dispatch'}});
  if(e||data?.error)setError(e?.message||data?.error);else setNotice('Delivery attempt completed. Sent: '+data.sent+' · Failed: '+data.failed);
  await refresh();setBusy(false);
 }
 return <section style={{display:'grid',gap:16}}>
  <header><h3>Customer Email & SMS Notifications</h3><p>Transactional updates for accommodation, food orders, event tickets and conference requests. Gmail uses an App Password stored securely in Supabase Vault. Afrinet credentials are separate from LEOGO.</p></header>
  <article style={{padding:16,border:'1px solid #ded4ed',borderRadius:12,display:'grid',gap:12}}>
   <h4>Afrinet SMS</h4>
   <label><input type="checkbox" checked={settings.sms_enabled} onChange={e=>patch('sms_enabled',e.target.checked)}/> Enable transactional SMS for new events</label>
   <label>Partner ID<input value={settings.afrinet_partner_id} onChange={e=>patch('afrinet_partner_id',e.target.value)}/></label>
   <label>Sender ID<input value={settings.afrinet_sender_id} onChange={e=>patch('afrinet_sender_id',e.target.value)}/></label>
   <label>Afrinet API Key ({settings.afrinet_key_saved?'saved — leave blank to keep':'not configured'})<input type="password" value={apiKey} autoComplete="new-password" onChange={e=>setApiKey(e.target.value)} placeholder="Enter privately; never displayed again"/></label>
   <h4>Gmail Customer Email</h4>
   <label><input type="checkbox" checked={settings.email_enabled} onChange={e=>patch('email_enabled',e.target.checked)}/> Enable transactional email for new events</label>
   <label>Sender name<input value={settings.gmail_sender_name} onChange={e=>patch('gmail_sender_name',e.target.value)}/></label>
   <label>Gmail address<input type="email" value={settings.gmail_address} onChange={e=>patch('gmail_address',e.target.value)}/></label>
   <label>Gmail App Password ({settings.gmail_password_saved?'saved — leave blank to keep':'not configured'})<input type="password" value={password} autoComplete="new-password" onChange={e=>setPassword(e.target.value)} placeholder="Gmail App Password (not normal Gmail password)"/></label>
   <p>Keep channels off until you have verified the sender accounts. SMS provider charges may apply. Customer booking updates are never held up by notification failures.</p>
   <button type="button" onClick={save} disabled={busy}>Save Notification Settings</button>
  </article>
  {error&&<p role="alert" style={{color:'#ad253d'}}>{error}</p>}{notice&&<p role="status" style={{color:'#176d45'}}>{notice}</p>}
  <article style={{display:'grid',gap:10}}>
   <div style={{display:'flex',justifyContent:'space-between',flexWrap:'wrap',gap:10}}><h4>Recent Delivery Log</h4><div><button type="button" disabled={busy} onClick={refresh}>Refresh</button> <button type="button" disabled={busy} onClick={()=>dispatch()}>Send Pending</button></div></div>
   {!jobs.length&&<p>No transactional notifications recorded yet.</p>}
   {jobs.map(job=><div key={job.id} style={{padding:12,border:'1px solid #e5dfed',borderRadius:9}}>
    <strong>{job.source_kind} · {job.event_key} · {job.channel.toUpperCase()}</strong>
    <p>{job.recipient} · {job.status} · Attempts: {job.attempts}</p>
    {job.last_error&&<small>{job.last_error}</small>}
    {job.status==='failed'&&<button type="button" disabled={busy} onClick={()=>dispatch(job.id)}>Retry Failed</button>}
   </div>)}
  </article>
 </section>;
}
