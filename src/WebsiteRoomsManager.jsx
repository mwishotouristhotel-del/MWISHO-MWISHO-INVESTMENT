import React,{useEffect,useState} from 'react';
import {prepareGalleryUpload} from './galleryUpload.js';

const EMPTY={category:'regular',name:'',description:'',nightly_rate_kes:'',max_guests:2,amenities:'',image_url:'',image_storage_path:'',is_published:false,display_order:100};
const CATEGORIES=[['regular','Regular Rooms'],['vvip','VVIP Rooms'],['extended','Extended Stay']];
const validUrl=value=>!value||(/^https:\/\//i.test(value)&&value.length<=2048);

export default function WebsiteRoomsManager({supabase}){
 const [rooms,setRooms]=useState([]);
 const [draft,setDraft]=useState(EMPTY);
 const [selected,setSelected]=useState(null);
 const [file,setFile]=useState(null);
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
  setSelected(item?.id||null);setFile(null);setError('');setMessage('');
  setDraft(item?{...item,amenities:(item.amenities||[]).join(', ')}:{...EMPTY,category:filter,display_order:(rooms.length+1)*10});
 }
 async function save(e){
  e.preventDefault();
  if(busy)return;
  setError('');setMessage('');
  const name=String(draft.name||'').trim(),description=String(draft.description||'').trim();
  const rate=Number(draft.nightly_rate_kes),guests=Number(draft.max_guests);
  const amenities=String(draft.amenities||'').split(',').map(x=>x.trim()).filter(Boolean);
  if(name.length<2||name.length>120){setError('Enter a room name between 2 and 120 characters.');return;}
  if(!String(draft.nightly_rate_kes).trim()||!Number.isFinite(rate)||rate<0){setError('Enter a valid room rate in KES per night.');return;}
  if(!Number.isInteger(guests)||guests<1||guests>30){setError('Maximum guests must be 1–30.');return;}
  if(description.length>1500||amenities.length>25||amenities.some(a=>a.length>80)){setError('Keep the description under 1,500 characters and use up to 25 short amenities.');return;}
  if(!validUrl(draft.image_url)){setError('The room photo URL must be HTTPS.');return;}
  setBusy(true);
  let uploadedPath='';
  try{
   let image_url=draft.image_url||'',image_storage_path=draft.image_storage_path||'';
   if(file){
    if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size===0)throw Error('Choose a JPG, PNG or WebP photo.');
    setMessage('Preparing room photo…');
    const prepared=await prepareGalleryUpload(file,{optimize:true});
    const photo=prepared.file;
    const ext={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'}[photo.type];
    if(!ext)throw Error('Unsupported converted image format.');
    uploadedPath='rooms/'+crypto.randomUUID()+'.'+ext;
    const {error:uploadError}=await supabase.storage.from('mwisho-gallery').upload(uploadedPath,photo,{upsert:false,contentType:photo.type});
    if(uploadError)throw uploadError;
    image_url=supabase.storage.from('mwisho-gallery').getPublicUrl(uploadedPath).data?.publicUrl||'';
    image_storage_path=uploadedPath;
   }
   const payload={
    category:draft.category,name,description,nightly_rate_kes:rate,
    max_guests:guests,amenities:[...new Set(amenities)],
    image_url,image_storage_path,is_published:!!draft.is_published,
    display_order:Number(draft.display_order)||100,updated_at:new Date().toISOString()
   };
   const query=selected?supabase.from('hotel_website_room_listings').update(payload).eq('id',selected):
     supabase.from('hotel_website_room_listings').insert(payload);
   const {error:saveError}=await query.select('id').single();
   if(saveError)throw saveError;
   setMessage(selected?'Room details updated.':'Room added successfully.');
   setSelected(null);setDraft({...EMPTY,category:filter});setFile(null);await refresh();
  }catch(err){
   setError(err?.message||String(err));
   if(uploadedPath)await supabase.storage.from('mwisho-gallery').remove([uploadedPath]).catch(()=>{});
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
      <p>KES {Number(room.nightly_rate_kes).toLocaleString('en-KE')} per night · Up to {room.max_guests} guests</p>
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
    <label>Rate (KES per night)<input required type="number" min="0" step="0.01" value={draft.nightly_rate_kes} onChange={e=>edit('nightly_rate_kes',e.target.value)}/></label>
    <label>Maximum guests<input type="number" min="1" max="30" value={draft.max_guests} onChange={e=>edit('max_guests',e.target.value)}/></label>
    <label>Description<textarea value={draft.description} rows={4} maxLength={1500} onChange={e=>edit('description',e.target.value)} placeholder="Describe this room and its features"/></label>
    <label>Amenities (separate with commas)<textarea value={draft.amenities} rows={3} onChange={e=>edit('amenities',e.target.value)} placeholder="Wi-Fi, Private bathroom, TV, Hot shower"/></label>
    <label>Room photo<input type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>setFile(e.target.files?.[0]||null)}/></label>
    <label>Or HTTPS photo link<input type="url" value={draft.image_url||''} onChange={e=>edit('image_url',e.target.value)} placeholder="https://..."/></label>
    <label>Display order<input type="number" value={draft.display_order} onChange={e=>edit('display_order',e.target.value)}/></label>
    <label><input type="checkbox" checked={!!draft.is_published} onChange={e=>edit('is_published',e.target.checked)}/> Publish on hotel website</label>
    <button className="mw-web-save" disabled={busy} type="submit">{busy?'Saving…':selected?'Save Room Changes':'Add Room Listing'}</button>
   </form>
  </div>
 </section>;
}
