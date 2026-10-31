import React,{useEffect,useMemo,useState} from 'react';
import {accommodationTotals,roomPackageNightlyRate} from './accommodationMath.js';
import {downloadGuestRegistration} from './accommodationDocuments.js';
import AccommodationBilling from './AccommodationBilling.jsx';
import './AccommodationWorkspace.css';

const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Nairobi',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const nextDay=value=>{const d=new Date(value+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+1);return d.toISOString().slice(0,10)};
const money=n=>'KSh '+Number(n||0).toLocaleString('en-KE',{minimumFractionDigits:2,maximumFractionDigits:2});
const PACKAGES=[['bed_only','Bed Only'],['bed_breakfast','Bed & Breakfast'],['half_board','Half Board'],['full_board','Full Board']];
const initialGuest=()=>({guest_name:'',guest_id_number:'',guest_phone:'',address:'',arrival_time:'',reason_for_visit:'',accessibility_request:'',remarks:'',nationality:'Kenyan',country_of_residence:'Kenya',county_of_residence:'',email:'',vehicle_registration:'',room_id:'',listing_id:'',package_key:'bed_only',guest_count:1,check_in_date:today(),expected_check_out_date:nextDay(today()),initial_payment:'',payment_method:'cash',payment_reference:''});

export default function AccommodationWorkspace({supabase,canReception=true,canAdmin=false}){
 const [rooms,setRooms]=useState([]),[stays,setStays]=useState([]),[payments,setPayments]=useState([]);
 const [receptionSection,setReceptionSection]=useState(null),[salesRows,setSalesRows]=useState([]);
 const [reportFrom,setReportFrom]=useState(()=>today().slice(0,7)+'-01'),[reportTo,setReportTo]=useState(today);
 const [roomForm,setRoomForm]=useState({room_number:'',category:'regular',nightly_rate_kes:'',listing_id:''});
 const [guest,setGuest]=useState(initialGuest),[paymentDraft,setPaymentDraft]=useState({}),[roomRates,setRoomRates]=useState([]);
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const room=rooms.find(r=>r.id===guest.room_id);
 const selectedListing=roomRates.find(r=>r.id===guest.listing_id);
 const availableListings=roomRates.filter(r=>r.category===room?.category);
 const nightlyRate=selectedListing?roomPackageNightlyRate(selectedListing,guest.package_key,guest.guest_count):room?.nightly_rate_kes;
 const totals=accommodationTotals(guest.check_in_date,guest.expected_check_out_date,nightlyRate);
 const activeRoomIds=new Set(stays.filter(s=>s.status==='checked_in').map(s=>s.room_id));
 const roomOptions=rooms.filter(r=>r.active&&r.housekeeping_status==='ready'&&!activeRoomIds.has(r.id));
 const roomName=id=>rooms.find(r=>r.id===id)?.room_number||'Unknown';
 const refresh=async()=>{
  const queries=[supabase.from('hotel_accommodation_rooms').select('*').order('room_number')];
  if(canReception)queries.push(supabase.from('hotel_accommodation_stays').select('*').order('created_at',{ascending:false}).limit(300),supabase.from('hotel_accommodation_payments').select('*').order('received_at',{ascending:false}).limit(1000));
  if(canReception)queries.push(supabase.from('hotel_website_room_listings').select('id,name,category,nightly_rate_kes,package_rates,max_guests').order('name'));
  const results=await Promise.all(queries);
  const failed=results.find(r=>r.error);if(failed){setError(failed.error.message);return;}
  setRooms(results[0].data||[]);
  if(canReception){setStays(results[1].data||[]);setPayments(results[2].data||[]);}
  if(canReception)setRoomRates(results.at(-1).data||[]);
  if(canReception){
   const [sectionResult,salesResult]=await Promise.all([
    supabase.rpc('hotel_accommodation_reception_section'),
    supabase.rpc('hotel_accommodation_section_sales',{p_start:reportFrom,p_end:reportTo})
   ]);
   if(sectionResult.error||salesResult.error){setError((sectionResult.error||salesResult.error).message);return;}
   setReceptionSection(sectionResult.data);setSalesRows(salesResult.data||[]);
  }
 };
 useEffect(()=>{refresh()},[canReception,canAdmin,reportFrom,reportTo]);
 const act=async(fn,success)=>{setBusy(true);setError('');setNotice('');try{await fn();setNotice(success);await refresh()}catch(e){setError(e.message||'Action failed')}finally{setBusy(false)}};
 const createRoom=e=>{e.preventDefault();act(async()=>{
  const {error:e}=await supabase.from('hotel_accommodation_rooms').insert({...roomForm,listing_id:roomForm.listing_id||null,nightly_rate_kes:Number(roomForm.nightly_rate_kes)});
  if(e)throw e;setRoomForm({room_number:'',category:'regular',nightly_rate_kes:'',listing_id:''});
 },'Room added. It is ready for reception.')};
 const checkIn=e=>{e.preventDefault();act(async()=>{
  if(totals.nights<1||totals.nights>365)throw Error('Check-out must be 1–365 nights after check-in.');
  if(!roomOptions.some(r=>r.id===guest.room_id))throw Error('Choose an available, cleaned room.');
  if(availableListings.length&&!selectedListing)throw Error('Choose a website room type and package.');
  if(selectedListing&&(selectedListing.category!==room.category||nightlyRate===null||guest.guest_count<1||guest.guest_count>selectedListing.max_guests))throw Error('Choose a valid room package and guest count.');
  const initial=Number(guest.initial_payment||0);
  if(initial<0||initial>totals.total)throw Error('Initial payment must be between zero and the total charge.');
  const {initial_payment,payment_method,payment_reference,room_id,listing_id,package_key,guest_count,check_in_date,expected_check_out_date,...fields}=guest;
  // The legacy stay ledger has no columns for the additional paper-form fields.
  // Keep them on the downloadable form; persist only fields accepted by the check-in RPC.
  const {address,arrival_time,reason_for_visit,accessibility_request,remarks,...persistedFields}=fields;
  const {error:e}=await supabase.rpc('hotel_accommodation_checkin_package',{
   p_room:room_id,p_listing:listing_id||null,p_package:listing_id?package_key:'bed_only',p_guests:listing_id?Number(guest_count):1,
   p_guest:persistedFields,p_check_in:check_in_date,p_check_out:expected_check_out_date,
   p_initial_payment:initial,p_method:payment_method,p_reference:payment_reference||null
  });
  if(e)throw e;
  setGuest(initialGuest());
 },'Guest checked in. Any unpaid amount remains on the account.')};
 const addPayment=stay=>act(async()=>{
  const draft=paymentDraft[stay.id]||{};const amount=Number(draft.amount||0);
  const existing=payments.filter(p=>p.stay_id===stay.id);
  const balance=accommodationTotals(stay.check_in_date,stay.expected_check_out_date,stay.nightly_rate_kes,existing).balance;
  if(!(amount>0)||amount>balance)throw Error('Enter a payment greater than zero and no more than the outstanding balance.');
  const {error:e}=await supabase.rpc('hotel_accommodation_record_payment',{p_stay:stay.id,p_amount:amount,p_method:draft.method||'cash',p_reference:draft.reference||null});
  if(e)throw e;setPaymentDraft(x=>({...x,[stay.id]:{method:'cash',amount:'',reference:''}}));
 },'Accommodation payment recorded.');
 const checkOut=stay=>{
  const due=accommodationTotals(stay.check_in_date,stay.expected_check_out_date,stay.nightly_rate_kes,payments.filter(p=>p.stay_id===stay.id)).balance;
  if(!window.confirm('Check out '+stay.guest_name+' from room '+roomName(stay.room_id)+'? '+(due?'Outstanding balance: '+money(due)+'. ':'')+'Room will require cleaning.'))return;
  act(async()=>{
   const {error:e}=await supabase.rpc('hotel_accommodation_checkout',{p_stay:stay.id});
   if(e)throw e;
  },'Guest checked out. Room is awaiting cleaning.');
 };
 const updateHousekeeping=(room,status)=>act(async()=>{
  if(activeRoomIds.has(room.id))throw Error('An occupied room cannot be marked ready.');
  const {error:e}=await supabase.from('hotel_accommodation_rooms').update({housekeeping_status:status}).eq('id',room.id);
  if(e)throw e;
 },'Room status updated.');
 return <article className="mw-accommodation">
  <div className="mw-accommodation-head"><div><h2>Accommodation Management</h2><p>{receptionSection==='vvip'?'VVIP Reception':receptionSection==='regular'?'Regular Reception':'VVIP and Regular / Standard'} • Reception • Housekeeping</p></div><button type="button" disabled={busy} onClick={refresh}>Refresh</button></div>
  {error&&<p role="alert" className="error">{error}</p>}{notice&&<p role="status" className="success">{notice}</p>}
  <div className="mw-accommodation-stats"><div><strong>{rooms.length}</strong><span>Total rooms</span></div><div><strong>{activeRoomIds.size}</strong><span>Occupied</span></div><div><strong>{roomOptions.length}</strong><span>Ready & available</span></div><div><strong>{rooms.filter(r=>r.housekeeping_status!=='ready').length}</strong><span>Housekeeping / Maintenance</span></div></div>
  {canReception&&<>
   <section className="mw-accommodation-panel"><h3>Accommodation Sales by Reception</h3><p className="muted">Based on guest check-in dates. Payments and balances include subsequent payments against those stays.</p><div className="mw-accommodation-grid"><label>From<input type="date" value={reportFrom} max={reportTo} onChange={e=>setReportFrom(e.target.value)}/></label><label>To<input type="date" value={reportTo} min={reportFrom} onChange={e=>setReportTo(e.target.value)}/></label></div><div className="mw-accommodation-stats">{salesRows.map(row=><div key={row.section}><strong>{row.section==='vvip'?'VVIP Reception':'Regular Reception'}</strong><span>{row.stay_count} check-ins</span><span>Billed: {money(row.charged_kes)}</span><span>Received: {money(row.paid_kes)}</span><span>Outstanding: {money(row.balance_kes)}</span></div>)}{!salesRows.length&&<p>No accommodation stays for the selected period.</p>}</div></section>
   {canAdmin&&<details className="mw-accommodation-panel"><summary>Add a numbered room</summary><form onSubmit={createRoom} className="mw-accommodation-grid"><label>Room number<input required maxLength={30} value={roomForm.room_number} onChange={e=>setRoomForm(v=>({...v,room_number:e.target.value}))}/></label><label>Category<select value={roomForm.category} onChange={e=>setRoomForm(v=>({...v,category:e.target.value}))}><option value="vvip">VVIP</option><option value="regular">Regular / Standard</option></select></label><label>Link to existing website room listing (optional)<select value={roomForm.listing_id} onChange={e=>{const listing=roomRates.find(x=>x.id===e.target.value);setRoomForm(v=>({...v,listing_id:e.target.value,category:listing?.category==='vvip'?'vvip':v.category,nightly_rate_kes:listing?String(listing.nightly_rate_kes):v.nightly_rate_kes}))}}><option value="">No website listing linked</option>{roomRates.filter(x=>['vvip','regular'].includes(x.category)).map(x=><option key={x.id} value={x.id}>{x.name} — {money(x.nightly_rate_kes)}/night</option>)}</select></label><label>Rate per night (KSh)<input required type="number" min="0" step="0.01" value={roomForm.nightly_rate_kes} onChange={e=>setRoomForm(v=>({...v,nightly_rate_kes:e.target.value}))}/></label><button className="primary" disabled={busy}>Add room</button></form><p className="muted">Use the same rates as the existing website room listings where applicable.</p>{roomRates.length>0&&<small>Website rates: {roomRates.map(x=>x.name+' — '+money(x.nightly_rate_kes)).join(' | ')}</small>}</details>}
   <section className="mw-accommodation-panel"><h3>Guest Check-In</h3><form onSubmit={checkIn} className="mw-accommodation-grid">
    {[['guest_name','Guest Name'],['guest_id_number','Guest ID Number'],['guest_phone','Guest Phone Number'],['address','Guest Address (form)'],['arrival_time','Arrival Time (form)'],['nationality','Nationality'],['country_of_residence','Country of Residence'],['county_of_residence','County of Residence'],['email','Email'],['vehicle_registration','Vehicle Registration (optional)'],['reason_for_visit','Reason for Visit (form)'],['accessibility_request','Accessibility Request (form)'],['remarks','Guest Remarks (form)']].map(([key,label])=><label key={key}>{label}<input required={['guest_name','guest_id_number','guest_phone','nationality','country_of_residence','county_of_residence'].includes(key)} type={key==='email'?'email':key==='arrival_time'?'time':'text'} value={guest[key]} onChange={e=>setGuest(v=>({...v,[key]:e.target.value}))}/></label>)}
    <label>Assigned Room<select required value={guest.room_id} onChange={e=>{const chosen=rooms.find(r=>r.id===e.target.value);const listing=roomRates.find(r=>r.id===chosen?.listing_id);setGuest(v=>({...v,room_id:e.target.value,listing_id:listing?.id||'',package_key:listing?.package_rates?.bed_only?'bed_only':PACKAGES.find(([k])=>listing?.package_rates?.[k])?.[0]||'bed_only',guest_count:1}))}}><option value="">Choose available room</option>{roomOptions.map(r=><option key={r.id} value={r.id}>{r.room_number} — {r.category==='vvip'?'VVIP':'Regular / Standard'}</option>)}</select></label>
    {room&&<label>Website Room Type<select required={availableListings.length>0} value={guest.listing_id} onChange={e=>{const listing=roomRates.find(x=>x.id===e.target.value);setGuest(v=>({...v,listing_id:e.target.value,package_key:listing?.package_rates?.bed_only?'bed_only':PACKAGES.find(([k])=>listing?.package_rates?.[k])?.[0]||'bed_only',guest_count:1}))}}><option value="">{availableListings.length?'Choose room type':'No website room type configured — standard rate'}</option>{availableListings.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>}
    {selectedListing&&<><label>Room Package<select required value={guest.package_key} onChange={e=>setGuest(v=>({...v,package_key:e.target.value}))}>{PACKAGES.filter(([key])=>selectedListing.package_rates?.[key]).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label><label>Number of Guests<select value={guest.guest_count} onChange={e=>setGuest(v=>({...v,guest_count:Number(e.target.value)}))}>{Array.from({length:selectedListing.max_guests},(_,i)=><option key={i+1} value={i+1}>{i+1} guest{i?'s':''}</option>)}</select></label></>}
    <label>Check-In Date<input type="date" required value={guest.check_in_date} onChange={e=>setGuest(v=>({...v,check_in_date:e.target.value}))}/></label><label>Expected Check-Out Date<input type="date" required min={nextDay(guest.check_in_date)} value={guest.expected_check_out_date} onChange={e=>setGuest(v=>({...v,expected_check_out_date:e.target.value}))}/></label>
    <div className="mw-accommodation-calculation"><b>{totals.nights} night(s)</b><span>Rate: {nightlyRate===null?'Choose package':money(nightlyRate)} per night</span><strong>Total: {money(totals.total)}</strong></div>
    <label>Amount paid now (KSh; partial allowed)<input type="number" min="0" max={totals.total} step="0.01" value={guest.initial_payment} onChange={e=>setGuest(v=>({...v,initial_payment:e.target.value}))}/></label><label>Payment method<select value={guest.payment_method} onChange={e=>setGuest(v=>({...v,payment_method:e.target.value}))}><option value="cash">Cash</option><option value="mpesa">M-Pesa</option><option value="card">Credit Card / PDQ</option></select></label><label>Payment reference<input value={guest.payment_reference} required={Number(guest.initial_payment)>0&&['mpesa','card'].includes(guest.payment_method)} onChange={e=>setGuest(v=>({...v,payment_reference:e.target.value}))}/></label>
    <div className="mw-accommodation-calculation"><span>Paid now: {money(guest.initial_payment)}</span><strong>Balance: {money(Math.max(0,totals.total-Number(guest.initial_payment||0)))}</strong></div><button type="button" onClick={()=>downloadGuestRegistration({guest:{...guest,nights:totals.nights},roomNumber:room?.room_number||'',paymentMethod:guest.payment_method,reference:guest.payment_reference})}>Download Guest Registration PDF</button><button type="button" onClick={()=>downloadGuestRegistration()}>Download Blank Form</button><button className="primary" disabled={busy||!guest.room_id||totals.nights<1||(availableListings.length>0&&!selectedListing)||nightlyRate===null}>Check In Guest</button>
   </form></section>
   <section className="mw-accommodation-panel"><h3>Guest Register & Checkout</h3>{stays.map(stay=>{const paid=payments.filter(p=>p.stay_id===stay.id),t=accommodationTotals(stay.check_in_date,stay.expected_check_out_date,stay.nightly_rate_kes,paid),draft=paymentDraft[stay.id]||{};return <div className="mw-accommodation-stay" key={stay.id}><div><strong>{stay.guest_name}</strong><span>{stay.status==='checked_in'?'In house':'Checked out'} • Room {roomName(stay.room_id)} • {stay.check_in_date} → {stay.expected_check_out_date} • {t.nights} nights</span><span>{roomRates.find(x=>x.id===stay.listing_id)?.name||'Standard room rate'} • {PACKAGES.find(([key])=>key===stay.package_key)?.[1]||'Bed Only'} • {stay.guest_count||1} guest(s)</span><span>Total {money(t.total)} · Paid {money(t.paid)} · <b>Balance {money(t.balance)}</b></span><button type="button" onClick={()=>downloadGuestRegistration({guest:{...stay,nights:t.nights},roomNumber:roomName(stay.room_id),paymentMethod:paid.at(-1)?.method||'',reference:paid.at(-1)?.reference||''})}>Download Registration Form</button></div>{stay.status==='checked_in'&&<div className="mw-accommodation-actions"><input aria-label="Payment amount" type="number" min="0.01" max={t.balance} step="0.01" placeholder="Payment KSh" value={draft.amount||''} onChange={e=>setPaymentDraft(v=>({...v,[stay.id]:{...draft,amount:e.target.value}}))}/><select aria-label="Payment method" value={draft.method||'cash'} onChange={e=>setPaymentDraft(v=>({...v,[stay.id]:{...draft,method:e.target.value}}))}><option value="cash">Cash</option><option value="mpesa">M-Pesa</option><option value="card">Credit Card / PDQ</option></select><input aria-label="Payment reference" placeholder="Reference" required={['mpesa','card'].includes(draft.method)} value={draft.reference||''} onChange={e=>setPaymentDraft(v=>({...v,[stay.id]:{...draft,reference:e.target.value}}))}/><button disabled={busy||t.balance<=0} onClick={()=>addPayment(stay)}>Record Payment</button><button className="primary" disabled={busy} onClick={()=>checkOut(stay)}>Check Out</button></div>}</div>})}{!stays.length&&<p>No guest stays recorded yet.</p>}</section>
   <AccommodationBilling supabase={supabase} stays={stays} payments={payments} rooms={rooms} canAdmin={canAdmin} refresh={refresh}/>
  </>}
  <section className="mw-accommodation-panel"><h3>Room Attendants / Housekeeping</h3><div className="mw-accommodation-rooms">{rooms.map(r=><div key={r.id} className="mw-accommodation-room"><strong>{r.room_number} • {r.category==='vvip'?'VVIP':'Regular / Standard'}</strong><span>{activeRoomIds.has(r.id)?'Occupied':r.housekeeping_status}</span><label>Room condition<select disabled={busy||activeRoomIds.has(r.id)} value={r.housekeeping_status} onChange={e=>updateHousekeeping(r,e.target.value)}><option value="dirty">Awaiting cleaning</option><option value="cleaning">Cleaning in progress</option><option value="inspection">Ready for inspection</option><option value="ready">Clean / Ready</option><option value="maintenance">Maintenance</option></select></label></div>)}</div>{!rooms.length&&<p>Admin must add numbered rooms before reception can check in guests.</p>}</section>
 </article>;
}
