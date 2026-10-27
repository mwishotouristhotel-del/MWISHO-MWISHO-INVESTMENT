import React,{useEffect,useState} from 'react';
import './WebsiteManager.css';
const CARD_NAMES=['hero','regular-rooms','vvip-rooms','extended-stay','restaurant','bar','conference','night-club','private-events'];
const DEFAULT_PLACEMENT={hero:'hero','regular-rooms':'rooms','vvip-rooms':'rooms','extended-stay':'rooms',restaurant:'dining',bar:'dining',conference:'events','night-club':'events','private-events':'events'};
const PLACEMENTS=[['rooms','Accommodation'],['dining','Dining & Bars'],['events','Events & Experiences']];
const SITE='https://mwishotouristhotel-del.github.io/MWISHO-MWISHO-INVESTMENT/hotel/';
function WebsiteManager({supabase}){
 const [cards,setCards]=useState([]),[settings,setSettings]=useState({}),[traffic,setTraffic]=useState([]),[selected,setSelected]=useState('hero');
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('');
 const [period,setPeriod]=useState('7');
 const [tab,setTab]=useState('content');
 const [newCard,setNewCard]=useState({title:'',placement:'events'});const [adding,setAdding]=useState(false);
 async function refresh(){
  setError('');
  const [a,b,c]=await Promise.all([
   supabase.from('hotel_website_content').select('*').order('display_order'),
   supabase.from('hotel_website_settings').select('key,value'),
   supabase.from('hotel_website_traffic_daily').select('*').gte('date',new Date(Date.now()-90*86400000).toISOString().slice(0,10)).order('date',{ascending:false})
  ]);
  if(a.error||b.error||c.error) {setError(a.error?.message||b.error?.message||c.error?.message);return;}
  setCards((a.data||[]).sort((x,y)=>x.display_order-y.display_order));setSettings(Object.fromEntries((b.data||[]).map(x=>[x.key,x.value])));setTraffic(c.data||[]);
 }
 useEffect(()=>{refresh()},[]);
 const active=cards.find(c=>c.slug===selected);
 function edit(field,value){setCards(old=>old.map(x=>x.slug===selected?{...x,[field]:value}:x))}
 async function saveCard(){
  if(!active)return;
  if(active.image_url&&!/^https:\/\//i.test(active.image_url)){setError('Please supply a secure HTTPS image URL.');return;}
  setBusy(true);setError('');setMessage('');
  try{
   const {data,error:e}=await supabase.from('hotel_website_content').update({
    title:active.title,subtitle:active.subtitle,description:active.description,image_url:active.image_url,
    enabled:active.enabled,placement:active.placement||DEFAULT_PLACEMENT[active.slug]||'events',
    display_order:active.display_order,updated_at:new Date().toISOString()
   }).eq('slug',active.slug).select('slug,image_url').single();
   if(e)throw e;
   if(!data)throw new Error('No card was updated. Check website administration permissions.');
   await refresh();
   setMessage('Saved successfully. Refresh the customer website to view this card and its image.');
  }catch(e){setError('Unable to save service card: '+(e.message||String(e)));}
  finally{setBusy(false);}
 }
 async function uploadImage(file){
  if(!file)return;
  if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>5*1024*1024){
   setError('Use a PNG, JPEG or WebP image under 5 MB.');return;
  }
  if(!active){setError('Choose a service card before uploading.');return;}
  const cardSlug=active.slug;
  setBusy(true);setError('');setMessage('Uploading and publishing image…');
  const extension=file.type==='image/png'?'png':file.type==='image/webp'?'webp':'jpg';
  const name=cardSlug+'-'+crypto.randomUUID()+'.'+extension;
  try{
   const {error:uploadError}=await supabase.storage.from('mwisho-website').upload(name,file,{contentType:file.type,upsert:false});
   if(uploadError)throw new Error('Storage upload failed: '+uploadError.message);
   const {data:publicUrlData}=supabase.storage.from('mwisho-website').getPublicUrl(name);
   const publicUrl=publicUrlData?.publicUrl;
   if(!publicUrl||!/^https:\/\//.test(publicUrl))throw new Error('Uploaded image URL could not be determined.');
   // Save directly to the selected database row: React state updates are asynchronous.
   const {data:saved,error:dbError}=await supabase.from('hotel_website_content')
    .update({image_url:publicUrl,updated_at:new Date().toISOString()})
    .eq('slug',cardSlug).select('slug,image_url').single();
   if(dbError||saved?.image_url!==publicUrl)throw new Error('Image uploaded but card update failed: '+(dbError?.message||'no row returned'));
   setCards(old=>old.map(c=>c.slug===cardSlug?{...c,image_url:publicUrl}:c));
   setMessage('Image uploaded and published to '+(active.title||cardSlug)+'. Refresh the customer website to see it.');
  }catch(e){
   setError(e.message||String(e));
   setMessage('');
  }finally{setBusy(false);}
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
  {tab==='content'&&<div className="mw-web-layout"><aside className="mw-web-list" aria-label="Website sections"><div className="mw-web-list-heading"><strong>Manage Service Cards</strong><small>Choose a section to edit its image and text</small></div><div className="mw-web-new-card">
 <button type="button" className="mw-web-add-button" onClick={()=>setAdding(v=>!v)} disabled={busy}>＋ Add Service Card</button>
 {adding&&<form className="mw-web-add-form" onSubmit={addCard}>
  <label>Card name<input value={newCard.title} required maxLength={100} onChange={e=>setNewCard(v=>({...v,title:e.target.value}))} placeholder="e.g. Wedding Packages"/></label>
  <label>Website section<select value={newCard.placement} onChange={e=>setNewCard(v=>({...v,placement:e.target.value}))}>{PLACEMENTS.map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
  <button type="submit" disabled={busy}>Create Card</button>
 </form>}
 </div>
 {cards.slice().sort((a,b)=>a.display_order-b.display_order).map(c=><button type="button" key={c.slug} onClick={()=>{setSelected(c.slug);setMessage('')}} className={selected===c.slug?'current':''} aria-current={selected===c.slug?'true':undefined}>
 <span className="mw-web-list-icon" aria-hidden="true">{c.slug==='hero'?'🏨':'🖼️'}</span>
 <span className="mw-web-list-name">{c.title}</span>
 <small className="mw-web-list-status">{c.enabled?'Visible':'Hidden'}</small>
 <small className="mw-web-area">{(PLACEMENTS.find(([id])=>id===(c.placement||DEFAULT_PLACEMENT[c.slug]))||['','Homepage'])[1]}</small>
 </button>)}</aside>
  <div className="mw-web-editor">{active?<><h3>{active.title} <small>({active.slug})</small></h3><div className="mw-web-preview">{active.image_url?<img src={active.image_url} alt={'Preview of '+active.title}/>:<div>Upload an image to replace the current placeholder</div>}</div>
    <div className="mw-web-card-controls">
  <span>Section: <strong>{(PLACEMENTS.find(([id])=>id===(active.placement||DEFAULT_PLACEMENT[active.slug]))||['','Homepage'])[1]}</strong></span>
  {active.slug!=='hero'&&<>
    <button type="button" disabled={busy} onClick={()=>moveCard(-1)}>↑ Move Earlier</button>
    <button type="button" disabled={busy} onClick={()=>moveCard(1)}>↓ Move Later</button>
    <button type="button" disabled={busy} onClick={hideCard}>Hide Card</button>
  </>}
 </div>
 {active.slug.startsWith('custom-')&&<label>Move to website section
  <select value={active.placement||'events'} onChange={e=>edit('placement',e.target.value)}>{PLACEMENTS.map(([k,label])=><option key={k} value={k}>{label}</option>)}</select>
 </label>}
 <label>Service / card heading<input value={active.title} maxLength={100} onChange={e=>edit('title',e.target.value)}/></label>
    <label>Small heading<input value={active.subtitle} maxLength={120} onChange={e=>edit('subtitle',e.target.value)}/></label>
    <label>Description<textarea rows="3" value={active.description} maxLength={500} onChange={e=>edit('description',e.target.value)}/></label>
    <label>Change Image — upload and publish automatically (PNG, JPG, WebP, maximum 5 MB)<input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={e=>uploadImage(e.target.files?.[0])}/></label>
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