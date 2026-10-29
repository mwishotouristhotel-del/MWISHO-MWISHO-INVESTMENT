import React,{useEffect,useState} from 'react';
export default function WebsiteRoomRequests({supabase}){
 const [requests,setRequests]=useState([]),[rooms,setRooms]=useState([]),[busy,setBusy]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState('');
 async function refresh(){
  const [a,b]=await Promise.all([
   supabase.from('hotel_website_room_requests').select('*').order('created_at',{ascending:false}).limit(150),
   supabase.from('hotel_website_room_listings').select('id,name,category').order('name')
  ]);
  if(a.error||b.error)setError(a.error?.message||b.error?.message||'Request data unavailable');
  else {setRequests(a.data||[]);setRooms(b.data||[]);setError('');}
 }
 useEffect(()=>{refresh();},[supabase]);
 async function update(request,patch){
  setBusy(request.id);setError('');setNotice('');
  const {data,error:e}=await supabase.from('hotel_website_room_requests')
   .update({...patch,updated_at:new Date().toISOString()}).eq('id',request.id).select('id').single();
  if(e||!data)setError(e?.message||'Staff update not saved');
  else {setNotice('Request updated for staff review.');await refresh();supabase.functions.invoke('hotel-notifications',{body:{action:'dispatch'}}).catch(()=>{});}
  setBusy('');
 }
 return <section className="mw-room-requests">
  <h3>Accommodation Availability & Similar-Room Requests</h3>
  <p>Website requests are not confirmed bookings. Check physical room allocations before marking a room available, then contact the guest directly. The Accommodation POS will provide live availability in a later integration.</p>
  <button type="button" onClick={refresh}>Refresh Requests</button>
  {error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
  {!requests.length&&<p>No accommodation requests received yet.</p>}
  <div className="mw-request-cards">
  {requests.map(item=><article key={item.id}>
    <h4>{rooms.find(r=>r.id===item.room_id)?.name||'Room'} — {item.request_kind==='similar_room'?'Similar room requested':'Availability check'}</h4>
    <p><strong>Dates:</strong> {item.check_in} to {item.check_out} • {item.guests} guests</p>
    <p><strong>Guest:</strong> {item.customer_name} • {item.customer_contact}</p>
    <label>Status
      <select value={item.status} disabled={busy===item.id} onChange={e=>update(item,{status:e.target.value})}>
       <option value="pending">Pending verification</option>
       <option value="available">Availability confirmed by staff</option>
       <option value="unavailable">Unavailable</option>
       <option value="alternative_suggested">Alternative suggested</option>
       <option value="closed">Closed</option>
      </select>
    </label>
    <label>Recommended room / staff notes
      <textarea defaultValue={item.recommendation||''} key={item.id+(item.updated_at||'')} maxLength={1000} rows={2}
       onBlur={e=>{if(e.target.value!==item.recommendation)update(item,{recommendation:e.target.value})}}/>
    </label>
    <small>Contact the guest to confirm the booking or offer an alternative. A status change does not reserve inventory.</small>
  </article>)}
  </div>
 </section>;
}
