import React,{useEffect,useState} from 'react';
import './WebsiteConferencePackages.css';
export default function WebsiteConferencePackages({supabase}){
 const [packages,setPackages]=useState([]),[busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[error,setError]=useState('');
 const [expanded,setExpanded]=useState(null),[showAdd,setShowAdd]=useState(false);
 const [newItem,setNewItem]=useState({name:'',description:'',price_kes:'',price_unit:''});
 async function refresh(){
  const {data,error:e}=await supabase.from('hotel_website_conference_packages').select('*').order('display_order');
  if(e)setError(e.message);else{setPackages(data||[]);setError('');}
 }
 useEffect(()=>{refresh()},[supabase]);
 function edit(id,key,value){setPackages(xs=>xs.map(x=>x.id===id?{...x,[key]:value}:x));}
 async function save(item){
  setBusy(true);setError('');setNotice('');
  const payload={name:item.name.trim(),description:item.description||'',price_kes:item.price_kes===''?null:Number(item.price_kes),
   price_unit:item.price_unit||'',is_published:!!item.is_published,display_order:Number(item.display_order)||0,updated_at:new Date().toISOString()};
  if(!payload.name||payload.price_kes!==null&&(!Number.isFinite(payload.price_kes)||payload.price_kes<0)){setError('Enter a valid name and price.');setBusy(false);return;}
  const {error:e}=await supabase.from('hotel_website_conference_packages').update(payload).eq('id',item.id);
  if(e)setError(e.message);else{setNotice('Conference package saved.');setExpanded(null);await refresh();}
  setBusy(false);
 }
 async function add(e){
  e.preventDefault();if(!newItem.name.trim())return;
  setBusy(true);setError('');
  const {error:e2}=await supabase.from('hotel_website_conference_packages').insert({
   ...newItem,name:newItem.name.trim(),price_kes:newItem.price_kes===''?null:Number(newItem.price_kes),
   is_published:true,display_order:packages.length*10+10
  });
  if(e2)setError(e2.message);else{setNewItem({name:'',description:'',price_kes:'',price_unit:''});setNotice('Package added.');setShowAdd(false);await refresh();}
  setBusy(false);
 }
 return <section className="mw-conference-editor">
  <div className="mw-conf-package-intro"><div><span>MWISHO TOURIST HOTEL · TASTE OF CLASS</span><h3>Conference Packages & Services</h3><p>Beautifully presented packages, with rates and inclusions ready to manage. Unpriced services invite a quotation request.</p></div><button type="button" onClick={()=>setShowAdd(v=>!v)} aria-expanded={showAdd}>{showAdd?'Close form':'+ New package'}</button></div>
  {error&&<p role="alert" style={{color:'#aa2233'}}>{error}</p>}{notice&&<p role="status" style={{color:'#187a50'}}>{notice}</p>}
  {packages.length===0&&<p className="mw-conf-no-packages">No conference packages yet. Add one to get started.</p>}
  <div className="mw-conf-package-grid">{packages.map((item,index)=><article key={item.id} className="mw-conf-package-card">
   <div className="mw-conf-package-cover"><span aria-hidden="true">{['✦','◈','✧','◆'][index%4]}</span><small className={item.is_published?'published':'unpublished'}>{item.is_published?'● Published':'○ Hidden'}</small></div>
   <div className="mw-conf-package-summary"><small>PACKAGE {String(index+1).padStart(2,'0')}</small><h4>{item.name||'Untitled package'}</h4><p>{item.description||'Add package inclusions and details.'}</p><div className="mw-conf-package-rate"><strong>{item.price_kes==null||item.price_kes===''?'Quotation on request':`KSh ${Number(item.price_kes).toLocaleString('en-KE',{maximumFractionDigits:2})}`}</strong>{item.price_unit&&<span>{item.price_unit}</span>}</div><button type="button" className="mw-conf-package-toggle" onClick={()=>setExpanded(v=>v===item.id?null:item.id)} aria-expanded={expanded===item.id} aria-controls={`mw-conf-edit-${item.id}`}>{expanded===item.id?'Close details':'Edit package'} <span aria-hidden="true">{expanded===item.id?'⌃':'↗'}</span></button></div>
   {expanded===item.id&&<div className="mw-conf-package-edit" id={`mw-conf-edit-${item.id}`}>
   <label>Package / Service Name<input value={item.name} onChange={e=>edit(item.id,'name',e.target.value)} maxLength={100}/></label>
   <label>Description<textarea rows={2} maxLength={800} value={item.description||''} onChange={e=>edit(item.id,'description',e.target.value)}/></label>
   <div className="mw-conf-package-fields">
    <label>Price (KES, optional)<input type="number" min="0" step="0.01" value={item.price_kes??''} onChange={e=>edit(item.id,'price_kes',e.target.value)}/></label>
    <label>Price unit<input placeholder="per person / per day" maxLength={40} value={item.price_unit||''} onChange={e=>edit(item.id,'price_unit',e.target.value)}/></label>
    <label>Display order<input type="number" value={item.display_order} onChange={e=>edit(item.id,'display_order',e.target.value)}/></label>
   </div>
   <label className="mw-conf-package-publish"><input type="checkbox" checked={item.is_published} onChange={e=>edit(item.id,'is_published',e.target.checked)}/> Show on customer website</label>
   <button type="button" disabled={busy} onClick={()=>save(item)}>Save Package</button>
   </div>}
  </article>)}</div>
  {showAdd&&<form onSubmit={add} className="mw-conf-package-add">
   <h4>Add Conference Package / Service</h4>
   <label>Name<input required maxLength={100} value={newItem.name} onChange={e=>setNewItem(x=>({...x,name:e.target.value}))}/></label>
   <label>Description<textarea maxLength={800} value={newItem.description} onChange={e=>setNewItem(x=>({...x,description:e.target.value}))}/></label>
   <label>Price (KES, optional)<input type="number" min="0" step="0.01" value={newItem.price_kes} onChange={e=>setNewItem(x=>({...x,price_kes:e.target.value}))}/></label>
   <label>Price unit<input placeholder="per person / per day" value={newItem.price_unit} onChange={e=>setNewItem(x=>({...x,price_unit:e.target.value}))}/></label>
   <button disabled={busy}>Add Package</button>
  </form>}
 </section>;
}
