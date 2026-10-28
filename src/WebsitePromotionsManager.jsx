import React,{useEffect,useState} from 'react';
import {prepareGalleryUpload} from './galleryUpload.js';
import './WebsitePromotionsManager.css';
const TYPES={'image/jpeg':'image','image/png':'image','image/webp':'image','video/mp4':'video','video/webm':'video'};
const EXT={'image/jpeg':'jpg','image/png':'png','image/webp':'webp','video/mp4':'mp4','video/webm':'webm'};
const VIDEO_MAX=10*1024*1024;
const empty={kind:'advertisement',title:'',description:'',action_label:'',action_url:'',event_date:'',starts_at:'',ends_at:'',popup_enabled:false,popup_mode:'manual',is_published:true};
const toLocal=v=>v?new Date(v).toISOString().slice(0,16):'';
const toUtc=v=>v?new Date(v).toISOString():null;
export default function WebsitePromotionsManager({supabase}){
 const [items,setItems]=useState([]),[form,setForm]=useState(empty),[media,setMedia]=useState(null),[busy,setBusy]=useState(false),[working,setWorking]=useState(null);
 const [notice,setNotice]=useState(''),[error,setError]=useState('');
 const patch=(k,v)=>setForm(f=>({...f,[k]:v}));
 async function refresh(){
  const {data,error:e}=await supabase.from('hotel_website_promotions').select('*').order('display_order').order('created_at',{ascending:false});
  if(e)setError('Cannot load adverts: '+e.message);else setItems(data||[]);
 }
 useEffect(()=>{refresh();},[supabase]);
 function selectFile(file){
  setError('');
  if(!file){setMedia(null);return;}
  if(!TYPES[file.type]){setError('Upload JPG, PNG, WebP, MP4 or WebM only.');setMedia(null);return;}
  if(TYPES[file.type]==='video'&&file.size>VIDEO_MAX){setError('Videos must be under 10 MB.');setMedia(null);return;}
  if(!file.size){setError('The selected file is empty.');setMedia(null);return;}
  setMedia(file);
 }
 async function submit(e){
  e.preventDefault();if(!media||!form.title.trim()||busy)return;
  if(form.starts_at&&form.ends_at&&new Date(form.ends_at)<=new Date(form.starts_at)){setError('End date must be later than start date.');return;}
  if(form.action_url){try{if(new URL(form.action_url).protocol!=='https:')throw Error();}catch{setError('The optional action link must start with https://');return;}}
  setBusy(true);setNotice('Preparing media…');setError('');
  let storedPath='';
  try{
   const prepared=await prepareGalleryUpload(media);
   const selected=prepared.file;
   storedPath='promotions/'+crypto.randomUUID()+'.'+EXT[selected.type];
   setNotice('Uploading '+(selected.size/1048576).toFixed(2)+' MB…');
   const {error:uploadError}=await supabase.storage.from('mwisho-gallery').upload(storedPath,selected,{upsert:false,contentType:selected.type});
   if(uploadError)throw new Error('Upload failed: '+uploadError.message);
   const url=supabase.storage.from('mwisho-gallery').getPublicUrl(storedPath).data?.publicUrl;
   if(!url)throw new Error('Media URL not returned.');
   setNotice('Saving '+form.kind+' details…');
   const record={...form,title:form.title.trim(),description:form.description.trim(),action_label:form.action_label.trim(),action_url:form.action_url.trim(),
    event_date:toUtc(form.event_date),starts_at:toUtc(form.starts_at),ends_at:toUtc(form.ends_at),
    media_type:TYPES[selected.type],media_url:url,media_path:storedPath,
    display_order:Math.max(0,...items.map(x=>Number(x.display_order)||0))+10};
   const {data,error:saveError}=await supabase.from('hotel_website_promotions').insert(record).select('id').single();
   if(saveError||!data)throw new Error('Cannot save promotion: '+(saveError?.message||'No record returned'));
   storedPath='';setForm(empty);setMedia(null);await refresh();
   setNotice('Saved successfully. '+(form.is_published?'Published on the customer site.':'Saved as unpublished draft.'));
  }catch(e){
   setError(e.message||String(e));setNotice('');
   if(storedPath)await supabase.storage.from('mwisho-gallery').remove([storedPath]).catch(()=>{});
  }finally{setBusy(false);}
 }
 async function update(item,changes){
  setWorking(item.id);setError('');setNotice('');
  try{
   const {data,error:e}=await supabase.from('hotel_website_promotions').update({...changes,updated_at:new Date().toISOString()}).eq('id',item.id).select('id').single();
   if(e||!data)throw Error(e?.message||'No record updated');
   await refresh();setNotice('Advertisement / event settings saved.');
  }catch(e){setError(e.message||String(e));}finally{setWorking(null);}
 }
 async function remove(item){
  if(!window.confirm('Remove this '+item.kind+' permanently?'))return;
  setWorking(item.id);setError('');setNotice('');
  try{
   const {error:e}=await supabase.from('hotel_website_promotions').delete().eq('id',item.id);
   if(e)throw e;
   const {error:storageError}=await supabase.storage.from('mwisho-gallery').remove([item.media_path]);
   if(storageError)setNotice('Removed listing; media cleanup needs attention.');
   else setNotice('Removed successfully.');
   await refresh();
  }catch(e){setError('Delete failed: '+(e.message||String(e)));}finally{setWorking(null);}
 }
 return <section className="mw-promotions">
  <header><h3>Advertisements & Upcoming Events</h3><p>Manage website adverts, hotel announcements, events and optional customer popups.</p></header>
  <form className="mw-promo-form" onSubmit={submit}>
   <h4>Upload New Advertisement or Event</h4>
   <label>Content type<select value={form.kind} onChange={e=>patch('kind',e.target.value)}><option value="advertisement">Advertisement</option><option value="event">Upcoming Hotel Event</option></select></label>
   <label>Title<input required maxLength={150} value={form.title} onChange={e=>patch('title',e.target.value)} placeholder="e.g. Friday Live Music"/></label>
   <label className="span2">Description<textarea maxLength={1000} rows="3" value={form.description} onChange={e=>patch('description',e.target.value)}/></label>
   <label className="span2">Poster or short video (JPG, PNG, WebP, MP4 or WebM; video max 10 MB)<input key={media?.name||'none'} type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm" onChange={e=>selectFile(e.target.files?.[0])}/></label>
   <label>Event date/time (optional)<input type="datetime-local" value={form.event_date} onChange={e=>patch('event_date',e.target.value)}/></label>
   <label>Publish from (optional)<input type="datetime-local" value={form.starts_at} onChange={e=>patch('starts_at',e.target.value)}/></label>
   <label>Stop publishing (optional)<input type="datetime-local" value={form.ends_at} onChange={e=>patch('ends_at',e.target.value)}/></label>
   <label>Action button label (optional)<input value={form.action_label} maxLength={40} onChange={e=>patch('action_label',e.target.value)} placeholder="e.g. Contact us"/></label>
   <label className="span2">Action URL (optional, HTTPS only)<input type="url" value={form.action_url} onChange={e=>patch('action_url',e.target.value)} placeholder="https://..."/></label>
   <div className="mw-promo-popup span2">
    <label className="check"><input type="checkbox" checked={form.popup_enabled} onChange={e=>patch('popup_enabled',e.target.checked)}/> Activate popup on customer website</label>
    {form.popup_enabled&&<fieldset><legend>Popup behavior</legend>
      <label><input type="radio" name="popup_mode" checked={form.popup_mode==='five_seconds'} onChange={()=>patch('popup_mode','five_seconds')}/> 5-second countdown (automatically closes)</label>
      <label><input type="radio" name="popup_mode" checked={form.popup_mode==='manual'} onChange={()=>patch('popup_mode','manual')}/> No countdown (customer closes manually)</label>
     </fieldset>}
    <p>Popups appear at most once per browser session for each advertisement or event.</p>
   </div>
   <label className="check span2"><input type="checkbox" checked={form.is_published} onChange={e=>patch('is_published',e.target.checked)}/> Publish when saved</label>
   <button type="submit" disabled={busy||!media||!form.title.trim()}>{busy?'Publishing…':'Save Advertisement / Event'}</button>
  </form>
  {error&&<p role="alert" className="mw-promo-error">{error}</p>}{notice&&<p role="status" className="mw-promo-success">{notice}</p>}
  <h4>Manage Uploaded Advertisements & Events</h4>
  {!items.length&&<p>No advertisements or events uploaded yet.</p>}
  <div className="mw-promo-grid">{items.map(item=><article key={item.id} className="mw-promo-card">
    {item.media_type==='video'?<video src={item.media_url} preload="none" controls playsInline/>:<img src={item.media_url} alt={item.title} loading="lazy" decoding="async"/>}
    <div><strong>{item.title}</strong><p>{item.kind==='event'?'Upcoming Event':'Advertisement'} · {item.is_published?'Published':'Draft'}</p>
    {item.event_date&&<small>Event: {new Date(item.event_date).toLocaleString('en-KE')}</small>}
    <label className="check"><input type="checkbox" checked={item.popup_enabled} disabled={working!==null} onChange={e=>update(item,{popup_enabled:e.target.checked})}/> Show popup</label>
    {item.popup_enabled&&<label>Popup mode<select disabled={working!==null} value={item.popup_mode} onChange={e=>update(item,{popup_mode:e.target.value})}><option value="five_seconds">5-second countdown</option><option value="manual">No countdown</option></select></label>}
    <div className="mw-promo-actions"><button disabled={working!==null} onClick={()=>update(item,{is_published:!item.is_published})}>{item.is_published?'Unpublish':'Publish'}</button><button disabled={working!==null} onClick={()=>remove(item)} className="danger">Delete</button></div>
    </div>
  </article>)}</div>
 </section>;
}