import React,{useEffect,useState} from 'react';
export default function WebsiteConferencePackages({supabase}){
 const [packages,setPackages]=useState([]),[busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[error,setError]=useState('');
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
  if(e)setError(e.message);else{setNotice('Conference package saved.');await refresh();}
  setBusy(false);
 }
 async function add(e){
  e.preventDefault();if(!newItem.name.trim())return;
  setBusy(true);setError('');
  const {error:e2}=await supabase.from('hotel_website_conference_packages').insert({
   ...newItem,name:newItem.name.trim(),price_kes:newItem.price_kes===''?null:Number(newItem.price_kes),
   is_published:true,display_order:packages.length*10+10
  });
  if(e2)setError(e2.message);else{setNewItem({name:'',description:'',price_kes:'',price_unit:''});setNotice('Package added.');await refresh();}
  setBusy(false);
 }
 return <section className="mw-conference-editor">
  <h3>Conference Packages & Services</h3><p>Edit package names, descriptions, rates and visibility. Empty prices appear as “Request a quotation” on the customer website.</p>
  {error&&<p role="alert" style={{color:'#aa2233'}}>{error}</p>}{notice&&<p role="status" style={{color:'#187a50'}}>{notice}</p>}
  <div style={{display:'grid',gap:12}}>{packages.map(item=><article key={item.id} style={{border:'1px solid #e1d6ed',padding:14,borderRadius:12,display:'grid',gap:10}}>
   <label>Package / Service Name<input value={item.name} onChange={e=>edit(item.id,'name',e.target.value)} maxLength={100}/></label>
   <label>Description<textarea rows={2} maxLength={800} value={item.description||''} onChange={e=>edit(item.id,'description',e.target.value)}/></label>
   <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(140px,1fr))',gap:10}}>
    <label>Price (KES, optional)<input type="number" min="0" step="0.01" value={item.price_kes??''} onChange={e=>edit(item.id,'price_kes',e.target.value)}/></label>
    <label>Price unit<input placeholder="per person / per day" maxLength={40} value={item.price_unit||''} onChange={e=>edit(item.id,'price_unit',e.target.value)}/></label>
    <label>Display order<input type="number" value={item.display_order} onChange={e=>edit(item.id,'display_order',e.target.value)}/></label>
   </div>
   <label style={{display:'flex',alignItems:'center',gap:8}}><input type="checkbox" checked={item.is_published} onChange={e=>edit(item.id,'is_published',e.target.checked)}/> Show on customer website</label>
   <button type="button" disabled={busy} onClick={()=>save(item)}>Save Package</button>
  </article>)}</div>
  <form onSubmit={add} style={{display:'grid',gap:10,padding:14,marginTop:20,border:'1px solid #e1d6ed',borderRadius:12}}>
   <h4>Add Conference Package / Service</h4>
   <label>Name<input required maxLength={100} value={newItem.name} onChange={e=>setNewItem(x=>({...x,name:e.target.value}))}/></label>
   <label>Description<textarea maxLength={800} value={newItem.description} onChange={e=>setNewItem(x=>({...x,description:e.target.value}))}/></label>
   <label>Price (KES, optional)<input type="number" min="0" step="0.01" value={newItem.price_kes} onChange={e=>setNewItem(x=>({...x,price_kes:e.target.value}))}/></label>
   <label>Price unit<input placeholder="per person / per day" value={newItem.price_unit} onChange={e=>setNewItem(x=>({...x,price_unit:e.target.value}))}/></label>
   <button disabled={busy}>Add Package</button>
  </form>
 </section>;
}