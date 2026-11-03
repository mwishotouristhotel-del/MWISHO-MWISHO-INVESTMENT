import React,{useEffect,useState} from 'react';
import './AccommodationHousekeepingChecklist.css';

export default function AccommodationHousekeepingChecklist({supabase,rooms,canAdmin=false}){
 const [items,setItems]=useState([]),[inspections,setInspections]=useState([]);
 const [answers,setAnswers]=useState({}),[notes,setNotes]=useState({}),[newItem,setNewItem]=useState('');
 const [busy,setBusy]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const reload=async()=>{
  const [list,history]=await Promise.all([
   supabase.from('hotel_accommodation_inspection_items').select('id,label,active,sort_order').order('sort_order').order('label'),
   supabase.from('hotel_accommodation_room_inspections').select('id,room_id,inspected_at,result,checks,notes').order('inspected_at',{ascending:false}).limit(300)
  ]);
  if(list.error||history.error){setError((list.error||history.error).message);return;}
  setItems(list.data||[]);setInspections(history.data||[]);setError('');
 };
 useEffect(()=>{reload()},[supabase]);
 const activeItems=items.filter(item=>item.active);
 const lastInspection=roomId=>inspections.find(row=>row.room_id===roomId);
 const save=async room=>{
  const values=answers[room.id]||{};
  if(activeItems.some(item=>typeof values[item.id]!=='boolean')){setError('Mark every checklist item OK or Needs attention before saving.');return;}
  setBusy(room.id);setError('');setNotice('');
  try{
   const checks=activeItems.map(item=>({item_id:item.id,passed:values[item.id]}));
   const {error:saveError}=await supabase.rpc('hotel_accommodation_save_room_inspection',{p_room:room.id,p_checks:checks,p_notes:notes[room.id]||''});
   if(saveError)throw saveError;
   setAnswers(current=>({...current,[room.id]:{}}));setNotes(current=>({...current,[room.id]:''}));
   await reload();setNotice('Inspection saved for room '+room.room_number+'. Room readiness has not been changed.');
  }catch(e){setError(e.message||'Could not save inspection')}finally{setBusy('')}
 };
 const manage=async(item,active)=>{
  const label=item?.label||newItem.trim();
  if(!item&&(label.length<2||label.length>120)){setError('Enter a checklist item between 2 and 120 characters.');return;}
  setBusy('admin');setError('');setNotice('');
  try{
   const {error:e}=await supabase.rpc('hotel_accommodation_manage_inspection_item',{p_item:item?.id||null,p_label:label,p_active:active});
   if(e)throw e;
   if(!item)setNewItem('');await reload();setNotice(item?'Checklist item updated.':'Checklist item added to every room.');
  }catch(e){setError(e.message||'Could not update checklist')}finally{setBusy('')}
 };
 return <section className="mw-housekeeping-checklists" aria-label="Room inspection checklists">
  <h3>☑ Room Checklist & Inspection</h3>
  <p className="muted">Inspect each room separately. Mark every item OK or Needs attention, then save the inspection. Previous inspection records remain available; saving does not automatically mark a room ready.</p>
  {error&&<p className="error" role="alert">{error}</p>}{notice&&<p className="success" role="status">{notice}</p>}
  {canAdmin&&<details className="mw-housekeeping-admin"><summary>⚙ Manage inspection items (Admin)</summary>
   <div className="mw-housekeeping-add"><input aria-label="New inspection item" maxLength={120} value={newItem} placeholder="Add a checklist item" onChange={e=>setNewItem(e.target.value)}/><button type="button" disabled={!!busy||!newItem.trim()} onClick={()=>manage(null,true)}>Add item</button></div>
   <ul>{items.map(item=><li key={item.id}><span>{item.label}{!item.active?' (inactive)':''}</span><div><button type="button" disabled={!!busy} onClick={()=>{const label=window.prompt('Checklist item name',item.label)?.trim();if(label&&label!==item.label)manage({...item,label},item.active)}}>Rename</button> <button type="button" disabled={!!busy} onClick={()=>manage(item,!item.active)}>{item.active?'Deactivate':'Reactivate'}</button></div></li>)}</ul>
  </details>}
  <div className="mw-housekeeping-room-list">{rooms.filter(room=>room.active).map(room=>{
   const last=lastInspection(room.id),values=answers[room.id]||{},answered=activeItems.filter(item=>typeof values[item.id]==='boolean').length;
   return <details key={room.id} className="mw-housekeeping-inspect-room">
    <summary><strong>Room {room.room_number}</strong><span>{room.category==='vvip'?'VVIP':'Regular'} · {last?last.result==='passed'?'Last inspection: All OK':'Last inspection: Needs attention':'Not yet inspected'}</span></summary>
    {last&&<><p className="muted">Last inspected: {new Date(last.inspected_at).toLocaleString('en-KE',{timeZone:'Africa/Nairobi'})}. {last.notes||''}</p><details className="mw-housekeeping-history"><summary>View last inspection results</summary><ul>{(last.checks||[]).map((check,index)=><li key={check.item_id||index}>{check.label}: <strong>{check.passed?'OK':'Needs attention'}</strong></li>)}</ul></details></>}
    <p className="mw-housekeeping-progress">{answered} of {activeItems.length} checks completed</p>
    <div className="mw-housekeeping-check-grid">{activeItems.map(item=><label key={item.id}><span>{item.label}</span><select value={typeof values[item.id]==='boolean'?String(values[item.id]):''} onChange={e=>setAnswers(current=>{const next={...(current[room.id]||{})};if(e.target.value==='')delete next[item.id];else next[item.id]=e.target.value==='true';return {...current,[room.id]:next};})}><option value="">Not checked</option><option value="true">✓ OK</option><option value="false">⚠ Needs attention</option></select></label>)}</div>
    <label className="mw-housekeeping-notes">Inspection notes (optional)<textarea maxLength={2000} rows={2} value={notes[room.id]||''} onChange={e=>setNotes(current=>({...current,[room.id]:e.target.value}))}/></label>
    <button type="button" disabled={!!busy||!activeItems.length||answered!==activeItems.length} onClick={()=>save(room)}>{busy===room.id?'Saving…':'Save Room Inspection'}</button>
   </details>;
  })}</div>
  {!rooms.some(room=>room.active)&&<p>No active rooms available for inspection.</p>}
 </section>;
}
