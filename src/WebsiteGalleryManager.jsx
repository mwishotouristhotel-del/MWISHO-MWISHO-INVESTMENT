import React,{useEffect,useState} from 'react';
import './WebsiteGalleryManager.css';
import {optimizeWebsitePhoto} from './optimizeWebsitePhoto.js';

const MAX_BYTES=10*1024*1024;
const TYPE_MAP={'image/jpeg':'photo','image/png':'photo','image/webp':'photo','video/mp4':'video','video/webm':'video'};
const EXT={'image/jpeg':'jpg','image/png':'png','image/webp':'webp','video/mp4':'mp4','video/webm':'webm'};

export default function WebsiteGalleryManager({supabase}){
 const [items,setItems]=useState([]);
 const [file,setFile]=useState(null),[title,setTitle]=useState(''),[description,setDescription]=useState('');
 const [publish,setPublish]=useState(true),[busy,setBusy]=useState(false),[status,setStatus]=useState(''),[error,setError]=useState('');
 const [workingId,setWorkingId]=useState(null);
 async function refresh(){
  const {data,error:e}=await supabase.from('hotel_website_gallery').select('*')
    .order('display_order',{ascending:true}).order('created_at',{ascending:false});
  if(e){setError('Could not load the gallery: '+e.message);return;}
  setItems(data||[]);
 }
 useEffect(()=>{refresh();},[supabase]);
 function selectFile(f){
  setError('');setStatus('');
  if(!f){setFile(null);return;}
  if(!TYPE_MAP[f.type]){setError('Only JPG, PNG, WebP, MP4 and WebM are supported.');setFile(null);return;}
  if(TYPE_MAP[f.type]==='video'&&f.size>MAX_BYTES){setError('Videos must be 10 MB or less. Compress this video before uploading.');setFile(null);return;}
  if(f.size===0){setError('The selected file is empty.');setFile(null);return;}
  setFile(f);
  setStatus((TYPE_MAP[f.type]==='video'?'Video':'Photo')+' ready: '+f.name+' ('+(f.size/1048576).toFixed(2)+' MB)');
 }
 async function upload(e){
  e.preventDefault();if(!file||busy)return;
  setBusy(true);setError('');setStatus('Preparing gallery media…');
  let path='';
  let uploaded=false;
  try{
   const uploadFile=TYPE_MAP[file.type]==='photo'?await optimizeWebsitePhoto(file,1600):file;
   path=crypto.randomUUID()+'.'+EXT[uploadFile.type];
   setStatus('Uploading '+(uploadFile.size/1048576).toFixed(2)+' MB of gallery media…');
   const {error:uploadError}=await supabase.storage.from('mwisho-gallery').upload(path,uploadFile,{contentType:uploadFile.type,upsert:false,cacheControl:'31536000'});
   if(uploadError)throw new Error('Storage upload failed: '+uploadError.message);
   uploaded=true;
   const publicUrl=supabase.storage.from('mwisho-gallery').getPublicUrl(path).data?.publicUrl;
   if(!publicUrl||!publicUrl.startsWith('https://'))throw new Error('Storage upload returned no secure media link.');
   const nextOrder=Math.max(0,...items.map(x=>Number(x.display_order)||0))+10;
   setStatus('Media uploaded. Saving gallery details…');
   const {data,error:dbError}=await supabase.from('hotel_website_gallery').insert({
     title:title.trim().slice(0,120),description:description.trim().slice(0,500),
     media_type:TYPE_MAP[file.type],mime_type:uploadFile.type,file_size:uploadFile.size,
     object_path:path,media_url:publicUrl,is_published:publish,display_order:nextOrder
   }).select('id,media_url').single();
   if(dbError||!data)throw new Error('Gallery record failed: '+(dbError?.message||'No saved row returned'));
   setStatus('Gallery '+TYPE_MAP[file.type]+' saved'+(publish?' and published.':' as draft.'));
   setFile(null);setTitle('');setDescription('');
   await refresh();
  }catch(e){
   setError(e?.message||String(e));setStatus('Upload was not published.');
   if(uploaded&&path)await supabase.storage.from('mwisho-gallery').remove([path]).catch(()=>{});
  }finally{setBusy(false);}
 }
 async function update(item,patch){
  setWorkingId(item.id);setError('');setStatus('');
  try{
   const {data,error:e}=await supabase.from('hotel_website_gallery')
    .update({...patch,updated_at:new Date().toISOString()})
    .eq('id',item.id).select('id').single();
   if(e||!data)throw new Error(e?.message||'No gallery record updated');
   await refresh();setStatus('Gallery item updated.');
  }catch(e){setError('Update failed: '+(e?.message||String(e)));}
  finally{setWorkingId(null);}
 }
 async function remove(item){
  if(!window.confirm('Permanently delete this gallery '+item.media_type+'?'))return;
  setWorkingId(item.id);setError('');
  try{
   const {error:e}=await supabase.from('hotel_website_gallery').delete().eq('id',item.id);
   if(e)throw e;
   const {error:storageError}=await supabase.storage.from('mwisho-gallery').remove([item.object_path]);
   if(storageError)setStatus('Gallery entry removed. Media cleanup needs attention: '+storageError.message);
   else setStatus('Gallery photo/video deleted.');
   await refresh();
  }catch(e){setError('Delete failed: '+(e?.message||String(e)));}
  finally{setWorkingId(null);}
 }
 async function move(item,direction){
  const index=items.findIndex(x=>x.id===item.id);
  const neighbor=items[index+direction];if(!neighbor)return;
  setWorkingId(item.id);setError('');
  const oldA=item.display_order,oldB=neighbor.display_order;
  try{
   const a=await supabase.from('hotel_website_gallery').update({display_order:oldB}).eq('id',item.id);
   if(a.error)throw a.error;
   const b=await supabase.from('hotel_website_gallery').update({display_order:oldA}).eq('id',neighbor.id);
   if(b.error){await supabase.from('hotel_website_gallery').update({display_order:oldA}).eq('id',item.id);throw b.error;}
   await refresh();setStatus('Gallery order saved.');
  }catch(e){setError('Could not reorder: '+(e?.message||String(e)));}
  finally{setWorkingId(null);}
 }
 const published=items.filter(x=>x.is_published).length;
 return <section className="mw-gallery-admin">
  <div className="mw-gallery-heading"><div><h3>Gallery Photos & Videos</h3><p>Upload, publish, reorder or remove media for the public hotel Gallery.</p></div><div className="mw-gallery-stats">{items.length} media • {published} published</div></div>
  <form onSubmit={upload} className="mw-gallery-uploader">
   <h4>Add Gallery Photo or Video</h4><p>Select photos of any size (your Supabase project's upload ceiling still applies). Photos are optimized for faster customer loading before upload. Videos: <strong>10 MB maximum</strong>. JPG, PNG, WebP, MP4 and WebM.</p>
   <label>Choose photo or video<input key={file?.name||'empty'} type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm" onChange={e=>selectFile(e.target.files?.[0])} disabled={busy}/></label>
   <label>Caption / title<input value={title} maxLength={120} onChange={e=>setTitle(e.target.value)} placeholder="e.g. VVIP Lounge"/></label>
   <label>Description (optional)<textarea value={description} maxLength={500} onChange={e=>setDescription(e.target.value)} rows="2"/></label>
   <label className="mw-gallery-check"><input type="checkbox" checked={publish} onChange={e=>setPublish(e.target.checked)}/> Publish to customer website after uploading</label>
   <button type="submit" disabled={!file||busy}>{busy?'Uploading…':'Upload to Gallery'}</button>
  </form>
  {error&&<p className="mw-gallery-error" role="alert">{error}</p>}
  {status&&<p className="mw-gallery-status" role="status">{status}</p>}
  <div className="mw-gallery-grid">{items.map((item,i)=><article className="mw-gallery-card" key={item.id}>
    {item.media_type==='video'?<video preload="metadata" controls playsInline src={item.media_url}/>:<img loading="lazy" src={item.media_url} alt={item.title||'Hotel gallery photograph'}/>}
    <div className="mw-gallery-card-body">
     <div className="mw-gallery-card-head"><strong>{item.title|| (item.media_type==='video'?'Hotel video':'Hotel photo')}</strong><span>{item.is_published?'Published':'Draft'}</span></div>
     <small>{item.media_type==='video'?'Video':'Photo'} · {(Number(item.file_size)/1048576).toFixed(2)} MB</small>
     <div className="mw-gallery-actions">
      <button type="button" disabled={workingId!==null} onClick={()=>update(item,{is_published:!item.is_published})}>{item.is_published?'Unpublish':'Publish'}</button>
      <button type="button" disabled={i===0||workingId!==null} onClick={()=>move(item,-1)}>↑ Earlier</button>
      <button type="button" disabled={i===items.length-1||workingId!==null} onClick={()=>move(item,1)}>↓ Later</button>
      <button type="button" className="danger" disabled={workingId!==null} onClick={()=>remove(item)}>Delete</button>
     </div>
    </div>
  </article>)}</div>
  {!items.length&&<p className="mw-gallery-empty">There are no gallery uploads yet. Add your first hotel photograph or video above.</p>}
 </section>;
}
