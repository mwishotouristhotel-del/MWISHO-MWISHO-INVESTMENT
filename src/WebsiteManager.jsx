import React,{useEffect,useState} from 'react';
import './WebsiteManager.css';
const CARD_NAMES=['hero','regular-rooms','vvip-rooms','extended-stay','restaurant','bar','conference','night-club','private-events'];
const SITE='https://mwishotouristhotel-del.github.io/MWISHO-MWISHO-INVESTMENT/';
function WebsiteManager({supabase}){
 const [cards,setCards]=useState([]),[settings,setSettings]=useState({}),[traffic,setTraffic]=useState([]),[selected,setSelected]=useState('hero');
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('');
 const [period,setPeriod]=useState('7');
 const [tab,setTab]=useState('content');
 async function refresh(){
  setError('');
  const [a,b,c]=await Promise.all([
   supabase.from('hotel_website_content').select('*').order('display_order'),
   supabase.from('hotel_website_settings').select('key,value'),
   supabase.from('hotel_website_traffic_daily').select('*').gte('date',new Date(Date.now()-90*86400000).toISOString().slice(0,10)).order('date',{ascending:false})
  ]);
  if(a.error||b.error||c.error) {setError(a.error?.message||b.error?.message||c.error?.message);return;}
  setCards(a.data||[]);setSettings(Object.fromEntries((b.data||[]).map(x=>[x.key,x.value])));setTraffic(c.data||[]);
 }
 useEffect(()=>{refresh()},[]);
 const active=cards.find(c=>c.slug===selected);
 function edit(field,value){setCards(old=>old.map(x=>x.slug===selected?{...x,[field]:value}:x))}
 async function saveCard(){
  if(!active)return;
  if(active.image_url&&!/^https:\/\//i.test(active.image_url)){setError('Please supply a secure HTTPS image URL.');return}
  setBusy(true);setError('');setMessage('');
  const {error:e}=await supabase.from('hotel_website_content').update({
   title:active.title,subtitle:active.subtitle,description:active.description,image_url:active.image_url,
   enabled:active.enabled,updated_at:new Date().toISOString()
  }).eq('slug',active.slug);
  if(e)setError(e.message);else setMessage('Saved '+active.title+'. Customer website reads the published settings on its next refresh.');
  setBusy(false);
 }
 async function uploadImage(file){
  if(!file)return;
  if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>5*1024*1024){setError('Use a PNG, JPEG or WebP image under 5 MB.');return;}
  setBusy(true);setError('');
  const extension=file.type==='image/png'?'png':file.type==='image/webp'?'webp':'jpg';
  const name=selected+'-'+crypto.randomUUID()+'.'+extension;
  const {error:e}=await supabase.storage.from('mwisho-website').upload(name,file,{contentType:file.type,upsert:false});
  if(e)setError(e.message);
  else {const {data}=supabase.storage.from('mwisho-website').getPublicUrl(name);edit('image_url',data.publicUrl);setMessage('Image uploaded. Click Save Changes to publish it.');}
  setBusy(false);
 }
 async function saveSettings(){
  setBusy(true);setError('');setMessage('');
  const allowed=['tagline','contact_phone','contact_email','whatsapp','facebook','instagram'];
  const {error:e}=await supabase.from('hotel_website_settings').upsert(allowed.map(key=>({key,value:settings[key]||'',updated_at:new Date().toISOString()})));
  if(e)setError(e.message);else setMessage('Website contact and branding settings saved.');
  setBusy(false);
 }
 const cutoff=new Date(Date.now()-(Number(period)-1)*86400000).toISOString().slice(0,10);
 const recent=traffic.filter(x=>x.date>=cutoff);
 const views=recent.reduce((n,x)=>n+Number(x.views||0),0);
 const daily=Object.entries(recent.reduce((a,x)=>(a[x.date]=(a[x.date]||0)+Number(x.views||0),a),{})).sort((a,b)=>a[0].localeCompare(b[0]));
 const topPages=Object.entries(recent.reduce((a,x)=>(a[x.page]=(a[x.page]||0)+Number(x.views||0),a),{})).sort((a,b)=>b[1]-a[1]);
 function exportCsv(){const rows=[['Date','Page','Views'],...recent.map(x=>[x.date,x.page,x.views])];const content=rows.map(r=>r.map(v=>'"'+String(v).replaceAll('"','""')+'"').join(',')).join('\r\n');const url=URL.createObjectURL(new Blob([content],{type:'text/csv'}));const a=document.createElement('a');a.href=url;a.download='MWISHO-Website-Traffic.csv';a.click();URL.revokeObjectURL(url)}
 return <article className="mw-web-admin">
  <div className="mw-web-head"><div><small>MWISHO TOURIST HOTEL · TASTE OF CLASS</small><h2>Hotel Website Management</h2><p>Customer website content, service photos and traffic — independent of hotel POS.</p></div><a href={SITE} target="_blank" rel="noreferrer">↗ Open Customer Website</a></div>
  <div className="mw-web-tabs">{[['content','🖼️ Service Cards & Images'],['settings','⚙️ Website Settings'],['traffic','📊 Customer Traffic']].map(([key,label])=><button type="button" key={key} onClick={()=>{setTab(key);setMessage('')}} className={tab===key?'on':''}>{label}</button>)}</div>
  {error&&<p className="mw-web-error" role="alert">{error}</p>}{message&&<p className="mw-web-ok" role="status">{message}</p>}
  {tab==='content'&&<div className="mw-web-layout"><aside className="mw-web-list" aria-label="Website sections"><div className="mw-web-list-heading"><strong>Manage Service Cards</strong><small>Choose a section to edit its image and text</small></div>{CARD_NAMES.map(id=>{const c=cards.find(x=>x.slug===id);return <button type="button" key={id} onClick={()=>{setSelected(id);setMessage('')}} className={selected===id?'current':''} aria-current={selected===id?'true':undefined}><span className="mw-web-list-icon" aria-hidden="true">{id==='hero'?'🏨':'🖼️'}</span><span className="mw-web-list-name">{c?.title||id}</span><small className="mw-web-list-status">{c?.enabled===false?'Hidden':'Visible'}</small></button>})}</aside>
  <div className="mw-web-editor">{active?<><h3>{active.title} <small>({active.slug})</small></h3><div className="mw-web-preview">{active.image_url?<img src={active.image_url} alt={'Preview of '+active.title}/>:<div>Upload an image to replace the current placeholder</div>}</div>
    <label>Service / card heading<input value={active.title} maxLength={100} onChange={e=>edit('title',e.target.value)}/></label>
    <label>Small heading<input value={active.subtitle} maxLength={120} onChange={e=>edit('subtitle',e.target.value)}/></label>
    <label>Description<textarea rows="3" value={active.description} maxLength={500} onChange={e=>edit('description',e.target.value)}/></label>
    <label>Image (PNG, JPG, WebP, maximum 5 MB)<input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={e=>uploadImage(e.target.files?.[0])}/></label>
    <label>Or paste HTTPS image URL<input type="url" placeholder="https://..." value={active.image_url} onChange={e=>edit('image_url',e.target.value)}/></label>
    <label className="mw-web-check"><input type="checkbox" checked={active.enabled} onChange={e=>edit('enabled',e.target.checked)}/> Display this section on customer website</label>
    <button type="button" className="mw-web-save" disabled={busy} onClick={saveCard}>{busy?'Saving…':'Save Changes'}</button>
   </>:<p>Website settings have not been initialized yet. Apply the isolated migration before using this panel.</p>}</div></div>}
  {tab==='settings'&&<div className="mw-web-editor mw-web-settings"><h3>Public Hotel Details</h3><p>Only add contact details approved for publication. The existing POS and payment details are not exposed.</p>
   {[['tagline','Hotel tagline'],['contact_phone','Contact number'],['contact_email','Public email'],['whatsapp','WhatsApp number'],['facebook','Facebook link'],['instagram','Instagram link']].map(([key,label])=><label key={key}>{label}<input value={settings[key]||''} onChange={e=>setSettings(old=>({...old,[key]:e.target.value}))}/></label>)}
   <p className="mw-web-info">Online reservations and payments remain disabled until the accommodation backend is tested.</p><button className="mw-web-save" type="button" disabled={busy} onClick={saveSettings}>Save Website Settings</button></div>}
  {tab==='traffic'&&<div className="mw-web-editor"><div className="mw-web-traffic-top"><h3>Website Customer Traffic</h3><div><select aria-label="Traffic reporting period" value={period} onChange={e=>setPeriod(e.target.value)}><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option></select><button type="button" onClick={refresh}>Refresh</button><button type="button" onClick={exportCsv}>Export CSV</button></div></div>
   <div className="mw-web-metrics"><div><small>Recorded page views</small><strong>{views.toLocaleString('en-KE')}</strong></div><div><small>Pages visited</small><strong>{topPages.length}</strong></div><div><small>Reporting period</small><strong>{period} days</strong></div></div>
   <p className="mw-web-info">Privacy-conscious aggregate counts, not unique people. Bots, browser privacy tools and repeated visits may affect totals. No visitor identities or IP addresses are stored by this module.</p>
   <h4>Daily visits</h4><div className="mw-web-bars">{daily.length?daily.map(([day,n])=><div key={day} className="mw-web-bar-row"><span>{day}</span><div><i style={{width:(100*n/Math.max(1,...daily.map(x=>x[1])))+'%'}}/></div><strong>{n}</strong></div>):<p>No recorded traffic for this period yet.</p>}</div>
   <h4>Most visited pages</h4><table><thead><tr><th>Page</th><th>Views</th></tr></thead><tbody>{topPages.map(([p,n])=><tr key={p}><td>{p}</td><td>{n}</td></tr>)}</tbody></table>
  </div>}
 </article>
}
export default WebsiteManager;