import './WebsiteRoomsManager.css';
import React,{useEffect,useState} from 'react';
import {prepareGalleryUpload} from './galleryUpload.js';

const EMPTY={category:'regular',name:'',description:'',nightly_rate_kes:'',max_guests:2,amenities:'',image_url:'',image_storage_path:'',is_published:false,display_order:100};
const CATEGORIES=[['regular','Regular Rooms'],['vvip','VVIP Rooms'],['extended','Extended Stay']];
const PACKAGES=[['bed_only','Bed Only'],['bed_breakfast','Bed & Breakfast'],['half_board','Half Board'],['full_board','Full Board']];
const emptyPackages=()=>Object.fromEntries(PACKAGES.map(([key])=>[key,{base_rate_kes:'',extra_guest_kes:''}]));
const validUrl=value=>!value||(/^https:\/\//i.test(value)&&value.length<=2048);

export default function WebsiteRoomsManager({supabase}){
 const [rooms,setRooms]=useState([]);
 const [draft,setDraft]=useState(EMPTY);
 const [plans,setPlans]=useState(emptyPackages);
 const [selected,setSelected]=useState(null);
 const [newFiles,setNewFiles]=useState([]);
 const [photos,setPhotos]=useState([]);
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState('');
 const [error,setError]=useState('');
 const [filter,setFilter]=useState('regular');
 async function refresh(){
  const {data,error:e}=await supabase.from('hotel_website_room_listings').select('*').order('display_order').order('created_at');
  if(e){setError('Cannot load room listings: '+e.message);return;}
  setRooms(data||[]);
 }
 useEffect(()=>{refresh();},[supabase]);
 const edit=(key,value)=>setDraft(d=>({...d,[key]:value}));
 function begin(item){
  setSelected(item?.id||null);setNewFiles([]);setError('');setMessage('');
  setPhotos(item?(Array.isArray(item.room_photos)&&item.room_photos.length?item.room_photos.filter(p=>p&&/^https:\/\//.test(p.url)).slice(0,5):(item.image_url?[{url:item.image_url,path:item.image_storage_path||''}]:[])):[]);
  setDraft(item?{...item,amenities:(item.amenities||[]).join(', ')}:{...EMPTY,category:filter,display_order:(rooms.length+1)*10});
  const current=item?.package_rates && Object.keys(item.package_rates).length?item.package_rates:(item?{bed_only:{base_rate_kes:item.nightly_rate_kes,extra_guest_kes:0}}:{});
  setPlans(Object.fromEntries(PACKAGES.map(([key])=>[key,{base_rate_kes:current[key]?.base_rate_kes??'',extra_guest_kes:current[key]?.extra_guest_kes??''}])));
 }
 async function save(e){
  e.preventDefault();
  if(busy)return;
  setError('');setMessage('');
  const name=String(draft.name||'').trim(),description=String(draft.description||'').trim();
  const guests=Number(draft.max_guests);
  const package_rates={};
  for(const [key,label] of PACKAGES){
   const p=plans[key]||{};
   const base=String(p.base_rate_kes??'').trim(),extra=String(p.extra_guest_kes??'').trim();
   if(!base && !extra)continue;
   if(!base || !extra || !Number.isFinite(Number(base)) || !Number.isFinite(Number(extra)) || Number(base)<0 || Number(extra)<0 || Number(base)>10000000 || Number(extra)>10000000){setError(label+': enter both a valid base rate and extra guest charge (use 0 when free).');return;}
   package_rates[key]={base_rate_kes:Number(base),extra_guest_kes:Number(extra)};
  }
  if(!Object.keys(package_rates).length){setError('Set at least one complete room package.');return;}
  const rate=package_rates.bed_only?.base_rate_kes??Object.values(package_rates)[0].base_rate_kes;
  const amenities=String(draft.amenities||'').split(',').map(x=>x.trim()).filter(Boolean);
  if(name.length<2||name.length>120){setError('Enter a room name between 2 and 120 characters.');return;}
  if(!Number.isInteger(guests)||guests<1||guests>30){setError('Maximum guests must be 1–30.');return;}
  if(description.length>1500||amenities.length>25||amenities.some(a=>a.length>80)){setError('Keep the description under 1,500 characters and use up to 25 short amenities.');return;}
  if(!validUrl(draft.image_url)){setError('The room photo URL must be HTTPS.');return;}
  setBusy(true);
  const newUploadPaths=[];
  try{
   const uploadedPhotos=[...photos];
   if(uploadedPhotos.length+newFiles.length>5)throw new Error('Each room may have a maximum of five photos.');
   for(const [i,file] of newFiles.entries()){
    if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size===0)throw new Error('Choose a valid JPG, PNG or WebP photo.');
    setMessage('Preparing room photo '+(i+1)+' of '+newFiles.length+'…');
    const prepared=await prepareGalleryUpload(file,{optimize:true});
    const photo=prepared.file;
    const ext={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'}[photo.type];
    if(!ext)throw new Error('Unsupported converted image format.');
    const path='rooms/'+crypto.randomUUID()+'.'+ext;
    const {error:uploadError}=await supabase.storage.from('mwisho-gallery').upload(path,photo,{upsert:false,contentType:photo.type});
    if(uploadError)throw new Error('Room photo '+(i+1)+' upload failed: '+uploadError.message);
    newUploadPaths.push(path);
    const url=supabase.storage.from('mwisho-gallery').getPublicUrl(path).data?.publicUrl;
    if(!url||!/^https:\/\//i.test(url))throw new Error('Photo uploaded but no secure URL was generated.');
    uploadedPhotos.push({url,path});
   }
   const image_url=uploadedPhotos[0]?.url||'';
   const image_storage_path=uploadedPhotos[0]?.path||'';
   const payload={
    category:draft.category,name,description,nightly_rate_kes:rate,package_rates,
    max_guests:guests,amenities:[...new Set(amenities)],
    image_url,image_storage_path,room_photos:uploadedPhotos,is_published:!!draft.is_published,
    display_order:Number(draft.display_order)||100,updated_at:new Date().toISOString()
   };
   const query=selected?supabase.from('hotel_website_room_listings').update(payload).eq('id',selected):
     supabase.from('hotel_website_room_listings').insert(payload);
   const {error:saveError}=await query.select('id').single();
   if(saveError)throw saveError;
   setMessage(selected?'Room details updated.':'Room added successfully.');
   setSelected(null);setDraft({...EMPTY,category:filter});setPlans(emptyPackages());setNewFiles([]);setPhotos([]);await refresh();
  }catch(err){
   setError(err?.message||String(err));
   if(newUploadPaths.length)await supabase.storage.from('mwisho-gallery').remove(newUploadPaths).catch(()=>{});
  }finally{setBusy(false);}
 }
 async function remove(item){
  if(!window.confirm('Delete '+item.name+'? It will immediately stop appearing on the customer website.'))return;
  setBusy(true);setError('');
  const {error:e}=await supabase.from('hotel_website_room_listings').delete().eq('id',item.id);
  if(e)setError(e.message);
  else {setMessage('Room removed from website listings.');if(selected===item.id)begin();await refresh();}
  setBusy(false);
 }
 const shown=rooms.filter(x=>x.category===filter);
 return <section className="mw-web-editor mw-room-manager">
  <h3>Hotel Rooms, Rates & Amenities</h3>
  <p>Manage room types displayed under Regular Rooms, VVIP Rooms and Extended Stay. Rates are indicative per night; online reservations and live availability are not enabled by this catalogue.</p>
  {error&&<p role="alert" className="mw-web-error">{error}</p>}
  {message&&<p role="status" className="mw-web-ok">{message}</p>}
  <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:16}}>
   {CATEGORIES.map(([key,label])=><button type="button" key={key} className={'mw-web-save'} style={{opacity:filter===key?1:.55}} onClick={()=>{setFilter(key);begin({...EMPTY,category:key})}}>{label}</button>)}
  </div>
  <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(270px,1fr))',gap:20}}>
   <div>
    <h4>{shown.length} {CATEGORIES.find(([key])=>key===filter)?.[1]} listed</h4>
    {shown.length===0&&<p>No room types have been added. Use the form to publish your first room.</p>}
    {shown.map(room=><article key={room.id} style={{border:'1px solid #ddd6ed',padding:12,borderRadius:12,marginBottom:10}}>
      {room.image_url&&<img alt={room.name} src={room.image_url} loading="lazy" style={{width:'100%',height:140,objectFit:'contain',background:'#f6f3fc'}}/>}
      <strong>{room.name}</strong>
      <p>{Array.isArray(room.room_photos)&&room.room_photos.length?room.room_photos.length:room.image_url?1:0} of 5 room photos</p>
      <p>From KES {Math.min(...Object.values(room.package_rates||{}).map(x=>Number(x.base_rate_kes)).filter(Number.isFinite),Number(room.nightly_rate_kes)).toLocaleString('en-KE')} per night · Up to {room.max_guests} guests</p>
      <small>{PACKAGES.filter(([key])=>room.package_rates?.[key]).map(([key,label])=>label).join(' · ')||'Legacy room rate'}</small>
      <small>{room.is_published?'Published':'Draft / hidden'} · {(room.amenities||[]).join(' • ')}</small>
      <div style={{display:'flex',gap:8,marginTop:10}}>
       <button type="button" onClick={()=>begin(room)} disabled={busy}>Edit</button>
       <button type="button" onClick={()=>remove(room)} disabled={busy}>Delete</button>
      </div>
     </article>)}
    <button type="button" onClick={()=>begin()} disabled={busy}>＋ Add Another Room</button>
   </div>
   <form onSubmit={save} style={{display:'grid',gap:10}}>
    <h4>{selected?'Edit Room':'Add Room'}</h4>
    <label>Room category<select value={draft.category} onChange={e=>edit('category',e.target.value)}>{CATEGORIES.map(([v,l])=><option value={v} key={v}>{l}</option>)}</select></label>
    <label>Room name<input required maxLength={120} value={draft.name} onChange={e=>edit('name',e.target.value)} placeholder="e.g. Regular Double Room"/></label>
    <fieldset style={{border:'1px solid #e3d9f3',borderRadius:12,padding:12,minWidth:0}}>
     <legend style={{fontWeight:800}}>Room Packages & Pricing (KES per night)</legend>
     <p style={{fontSize:13,lineHeight:1.6}}>Each package price includes the first guest. Set a separate charge for each additional guest on that package. Leave both fields empty to hide a package.</p>
     {PACKAGES.map(([key,label])=><div key={key} style={{borderBottom:'1px solid #ece5f5',padding:'10px 0'}}>
       <strong>{label}</strong>
       <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(145px,1fr))',gap:10}}>
        <label>Base rate · 1 guest (KES)<input type="number" min="0" max="10000000" step="0.01" placeholder="Not offered" value={plans[key]?.base_rate_kes??''} onChange={e=>setPlans(old=>({...old,[key]:{...old[key],base_rate_kes:e.target.value}}))}/></label>
        <label>Each extra guest (KES)<input type="number" min="0" max="10000000" step="0.01" placeholder="Not offered" value={plans[key]?.extra_guest_kes??''} onChange={e=>setPlans(old=>({...old,[key]:{...old[key],extra_guest_kes:e.target.value}}))}/></label>
       </div>
     </div>)}
     <p style={{fontSize:12}}>Example: Bed & Breakfast KES 4,000 + KES 1,200 for each additional guest. Two guests pay KES 5,200 per night.</p>
    </fieldset>
    <label>Maximum guests<input type="number" min="1" max="30" value={draft.max_guests} onChange={e=>edit('max_guests',e.target.value)}/></label>
    <label>Description<textarea value={draft.description} rows={4} maxLength={1500} onChange={e=>edit('description',e.target.value)} placeholder="Describe this room and its features"/></label>
    <label>Amenities (separate with commas)<textarea value={draft.amenities} rows={3} onChange={e=>edit('amenities',e.target.value)} placeholder="Wi-Fi, Private bathroom, TV, Hot shower"/></label>
    <fieldset className="mw-room-photos">
     <legend>Room photos ({photos.length+newFiles.length}/5)</legend>
     <p>Add up to 5 photos for this room. The first photo becomes the cover. Existing photos stay published until you save changes.</p>
     <div className="mw-room-photo-grid">
      {photos.map((photo,i)=><div className="mw-room-photo" key={photo.path||photo.url}>
       <img src={photo.url} alt={'Room photo '+(i+1)} loading="lazy"/>
       <span>{i===0?'Cover image':'Photo '+(i+1)}</span>
       <div className="mw-room-photo-actions">
        <button type="button" disabled={busy||i===0} onClick={()=>setPhotos(old=>{const next=[...old];[next[i-1],next[i]]=[next[i],next[i-1]];return next;})}>←</button>
        <button type="button" disabled={busy||i===photos.length-1} onClick={()=>setPhotos(old=>{const next=[...old];[next[i+1],next[i]]=[next[i],next[i+1]];return next;})}>→</button>
        <button type="button" disabled={busy} onClick={()=>setPhotos(old=>old.filter((_,n)=>n!==i))}>Remove</button>
       </div>
      </div>)}
      {newFiles.map((photo,i)=><div className="mw-room-photo new" key={photo.name+i}>
       <span>New photo: {photo.name}</span>
       <button type="button" disabled={busy} onClick={()=>setNewFiles(old=>old.filter((_,n)=>n!==i))}>Remove</button>
      </div>)}
     </div>
     <label>Choose more room photos<input type="file" multiple disabled={busy||photos.length+newFiles.length>=5}
      accept="image/jpeg,image/png,image/webp"
      onChange={e=>{
       const files=Array.from(e.target.files||[]);
       if(files.some(f=>!['image/jpeg','image/png','image/webp'].includes(f.type)||!f.size)){setError('Use nonempty JPG, PNG or WebP photos only.');e.target.value='';return;}
       if(photos.length+newFiles.length+files.length>5){setError('Maximum five photos per room. Remove an existing photo first.');e.target.value='';return;}
       setError('');setNewFiles(old=>[...old,...files]);e.target.value='';
      }}/>
     </label>
    </fieldset>
    <label>Display order<input type="number" value={draft.display_order} onChange={e=>edit('display_order',e.target.value)}/></label>
    <label><input type="checkbox" checked={!!draft.is_published} onChange={e=>edit('is_published',e.target.checked)}/> Publish on hotel website</label>
    <button className="mw-web-save" disabled={busy} type="submit">{busy?'Saving…':selected?'Save Room Changes':'Add Room Listing'}</button>
   </form>
  </div>
 </section>;
}
