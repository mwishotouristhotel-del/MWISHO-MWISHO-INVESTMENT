import React,{useEffect,useMemo,useState} from 'react';
import {accommodationTotals,roomPackageNightlyRate} from './accommodationMath.js';
import {downloadGuestRegistration,downloadBlankRegistrationBatch} from './accommodationDocuments.js';
import AccommodationBilling from './AccommodationBilling.jsx';
import AccommodationStayCard from './AccommodationStayCard.jsx';
import {accommodationCheckoutStatus} from './accommodationCheckoutStatus.js';
import {prefillReturningGuest} from './accommodationGuestPrefill.js';
import {buildAccommodationReport} from './accommodationReportMath.js';
import {downloadAccommodationReport} from './accommodationReportExports.js';
import './AccommodationWorkspace.css';

const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Nairobi',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const nextDay=value=>{const d=new Date(value+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+1);return d.toISOString().slice(0,10)};
const money=n=>'KSh '+Number(n||0).toLocaleString('en-KE',{minimumFractionDigits:2,maximumFractionDigits:2});
const PACKAGES=[['bed_only','Bed Only'],['bed_breakfast','Bed & Breakfast'],['half_board','Half Board'],['full_board','Full Board']];
const initialGuest=()=>({guest_type:'walk_in',organization_id:'',guest_name:'',guest_id_number:'',guest_phone:'',address:'',arrival_time:'',reason_for_visit:'',accessibility_request:'',remarks:'',nationality:'Kenyan',country_of_residence:'Kenya',county_of_residence:'',email:'',vehicle_registration:'',room_id:'',listing_id:'',package_key:'bed_only',guest_count:1,check_in_date:today(),expected_check_out_date:nextDay(today()),initial_payment:'',payment_method:'cash',payment_reference:''});

export default function AccommodationWorkspace({supabase,canReception=true,canAdmin=false}){
 const [rooms,setRooms]=useState([]),[stays,setStays]=useState([]),[payments,setPayments]=useState([]);
 const [receptionSection,setReceptionSection]=useState(null),[salesRows,setSalesRows]=useState([]);
 const [dailyReport,setDailyReport]=useState(null),[reportError,setReportError]=useState(''),[reportExporting,setReportExporting]=useState('');
 const [reportFrom,setReportFrom]=useState(()=>today().slice(0,7)+'-01'),[reportTo,setReportTo]=useState(today);
 const [roomForm,setRoomForm]=useState({room_number:'',category:'regular',nightly_rate_kes:'',listing_id:''});
 const [guest,setGuest]=useState(initialGuest),[paymentDraft,setPaymentDraft]=useState({}),[roomRates,setRoomRates]=useState([]);
 const [organizations,setOrganizations]=useState([]),[organizationSearch,setOrganizationSearch]=useState(''),[newOrganizationName,setNewOrganizationName]=useState('');
 const [returningSearch,setReturningSearch]=useState(''),[returningMatches,setReturningMatches]=useState([]),[returningBusy,setReturningBusy]=useState(false),[returningError,setReturningError]=useState('');
 const [checkoutDraft,setCheckoutDraft]=useState({}),[clockNow,setClockNow]=useState(()=>new Date());
 const [blankCopies,setBlankCopies]=useState(1),[blankStart,setBlankStart]=useState(1);
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const room=rooms.find(r=>r.id===guest.room_id);
 const selectedListing=roomRates.find(r=>r.id===guest.listing_id);
 const availableListings=roomRates.filter(r=>r.category===room?.category);
 const selectedOrganization=organizations.find(o=>o.id===guest.organization_id);
 const matchingOrganizations=organizations.filter(o=>o.name.toLowerCase().includes(organizationSearch.trim().toLowerCase())).slice(0,75);
 const nightlyRate=selectedListing?roomPackageNightlyRate(selectedListing,guest.package_key,guest.guest_count):room?.nightly_rate_kes;
 const totals=accommodationTotals(guest.check_in_date,guest.expected_check_out_date,nightlyRate);
 const activeRoomIds=new Set(stays.filter(s=>s.status==='checked_in').map(s=>s.room_id));
 const checkoutDueCount=stays.filter(s=>['due','overdue'].includes(accommodationCheckoutStatus(s,clockNow))).length;
 const roomOptions=rooms.filter(r=>r.active&&r.housekeeping_status==='ready'&&!activeRoomIds.has(r.id));
 const roomName=id=>rooms.find(r=>r.id===id)?.room_number||'Unknown';
 const refresh=async()=>{
  const queries=[supabase.from('hotel_accommodation_rooms').select('*').order('room_number')];
  if(canReception)queries.push(supabase.from('hotel_accommodation_stays').select('*').order('created_at',{ascending:false}).limit(300),supabase.from('hotel_accommodation_payments').select('*').order('received_at',{ascending:false}).limit(1000));
  if(canReception)queries.push(supabase.from('hotel_website_room_listings').select('id,name,category,nightly_rate_kes,package_rates,max_guests').order('name'));
  if(canReception)queries.push(supabase.from('hotel_accommodation_organizations').select('id,name').order('name').limit(1000));
  const results=await Promise.all(queries);
  const failed=results.find(r=>r.error);if(failed){setError(failed.error.message);return;}
  setRooms(results[0].data||[]);
  if(canReception){setStays(results[1].data||[]);setPayments(results[2].data||[]);}
  if(canReception){setRoomRates(results[3].data||[]);setOrganizations(results[4].data||[]);}
  if(canReception){
   const [sectionResult,salesResult,dailyResult]=await Promise.all([
    supabase.rpc('hotel_accommodation_reception_section'),
    supabase.rpc('hotel_accommodation_section_sales',{p_start:reportFrom,p_end:reportTo}),
    supabase.rpc('hotel_accommodation_daily_reception_report',{p_start:reportFrom,p_end:reportTo})
   ]);
   if(sectionResult.error||salesResult.error){setError((sectionResult.error||salesResult.error).message);return;}
   setReceptionSection(sectionResult.data);setSalesRows(salesResult.data||[]);
   if(dailyResult.error){setDailyReport(null);setReportError(dailyResult.error.message)}
   else{try{setDailyReport(buildAccommodationReport(dailyResult.data,{from:reportFrom,to:reportTo}));setReportError('')}
    catch(e){setDailyReport(null);setReportError(e.message)}}
  }
 };
 useEffect(()=>{refresh()},[canReception,canAdmin,reportFrom,reportTo]);
 const exportReport=async format=>{
  setReportExporting(format);setReportError('');
  try{await downloadAccommodationReport(dailyReport,format)}catch(e){setReportError(e.message||'Could not export the report')}
  finally{setReportExporting('')}
 };
 useEffect(()=>{
  const query=returningSearch.trim();
  if(!canReception||query.length<3){setReturningMatches([]);setReturningBusy(false);setReturningError('');return;}
  let cancelled=false;
  setReturningBusy(true);setReturningError('');
  const timer=setTimeout(async()=>{
   const {data,error:e}=await supabase.rpc('hotel_accommodation_find_returning_guests',{p_query:query});
   if(cancelled)return;
   setReturningMatches(e?[]:data||[]);setReturningError(e?e.message:'');setReturningBusy(false);
  },350);
  return()=>{cancelled=true;clearTimeout(timer)};
 },[returningSearch,canReception,supabase]);
 useEffect(()=>{
  const search=organizationSearch.trim();if(!canReception||search.length<2)return;
  let cancelled=false;
  const timer=setTimeout(async()=>{
   const {data,error:e}=await supabase.from('hotel_accommodation_organizations').select('id,name').ilike('name',`%${search}%`).order('name').limit(75);
   if(!cancelled&&!e&&data)setOrganizations(previous=>{const merged=new Map(previous.map(o=>[o.id,o]));data.forEach(o=>merged.set(o.id,o));return [...merged.values()].sort((a,b)=>a.name.localeCompare(b.name));});
  },250);
  return ()=>{cancelled=true;clearTimeout(timer)};
 },[organizationSearch,canReception,supabase]);
 useEffect(()=>{const timer=setInterval(()=>setClockNow(new Date()),60000);return ()=>clearInterval(timer)},[]);
 const act=async(fn,success)=>{setBusy(true);setError('');setNotice('');try{await fn();setNotice(success);await refresh()}catch(e){setError(e.message||'Action failed')}finally{setBusy(false)}};
 const createRoom=e=>{e.preventDefault();act(async()=>{
  const {error:e}=await supabase.from('hotel_accommodation_rooms').insert({...roomForm,listing_id:roomForm.listing_id||null,nightly_rate_kes:Number(roomForm.nightly_rate_kes)});
  if(e)throw e;setRoomForm({room_number:'',category:'regular',nightly_rate_kes:'',listing_id:''});
 },'Room added. It is ready for reception.')};
 const registerOrganization=()=>act(async()=>{
  const name=newOrganizationName.trim();
  if(name.length<2||name.length>180)throw Error('Enter an organization name between 2 and 180 characters.');
  const {data:id,error:e}=await supabase.rpc('hotel_accommodation_register_organization',{p_name:name});
  if(e)throw e;
  const {data:registered,error:lookupError}=await supabase.from('hotel_accommodation_organizations').select('id,name').eq('id',id).single();
  if(lookupError)throw lookupError;
  setOrganizations(current=>[...current.filter(x=>x.id!==id),registered].sort((a,b)=>a.name.localeCompare(b.name)));
  setGuest(current=>({...current,guest_type:'organization',organization_id:id}));
  setOrganizationSearch(registered.name);setNewOrganizationName('');
 },'Organization saved and selected for this check-in.');
 const checkIn=e=>{e.preventDefault();act(async()=>{
  if(totals.nights<1||totals.nights>365)throw Error('Check-out must be 1–365 nights after check-in.');
  if(!roomOptions.some(r=>r.id===guest.room_id))throw Error('Choose an available, cleaned room.');
  if(availableListings.length&&!selectedListing)throw Error('Choose a website room type and package.');
  if(selectedListing&&(selectedListing.category!==room.category||nightlyRate===null||guest.guest_count<1||guest.guest_count>selectedListing.max_guests))throw Error('Choose a valid room package and guest count.');
  if(guest.guest_type==='organization'&&!guest.organization_id)throw Error('Select a saved organization or register a new one before check-in.');
  const initial=Number(guest.initial_payment||0);
  if(initial<0||initial>totals.total)throw Error('Initial payment must be between zero and the total charge.');
  const {initial_payment,payment_method,payment_reference,room_id,listing_id,package_key,guest_count,check_in_date,expected_check_out_date,...fields}=guest;
  const {error:e}=await supabase.rpc('hotel_accommodation_checkin_grouped',{
   p_room:room_id,p_listing:listing_id||null,p_package:listing_id?package_key:'bed_only',p_guests:listing_id?Number(guest_count):1,
   p_guest:fields,p_check_in:check_in_date,p_check_out:expected_check_out_date,
   p_initial_payment:initial,p_method:payment_method,p_reference:payment_reference||null
  });
  if(e)throw e;
  // Keep the group and stay dates selected for the next guest in the same party.
  setGuest(current=>current.guest_type==='organization'?{...initialGuest(),guest_type:'organization',organization_id:current.organization_id,check_in_date:current.check_in_date,expected_check_out_date:current.expected_check_out_date}:initialGuest());
  setReturningSearch('');setReturningMatches([]);
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
  const draft=checkoutDraft[stay.id]||{},mode=draft.mode||'standard';
  if(mode==='complimentary'){
   if(due<=0){setError('This bill has no outstanding complimentary amount.');return;}
   if(!draft.approverName?.trim()||!draft.designation?.trim()||!draft.reason?.trim()){setError('Enter the stated approver name, designation, and complimentary reason.');return;}
  }
  if(mode==='invoice'&&(due<=0||!draft.organization?.trim())){setError('Enter an organization name for a bill with an outstanding balance.');return;}
  const explanation=mode==='complimentary'?'A complimentary approval request will remain pending after the guest leaves. No complimentary payment will be posted until management approves.':mode==='invoice'?'The unpaid balance will remain under the named organization until an invoice is issued.':'Room will require cleaning.';
  if(!window.confirm('Check out '+stay.guest_name+' from room '+roomName(stay.room_id)+'? '+(due?'Outstanding balance: '+money(due)+'. ':'')+explanation))return;
  act(async()=>{
   const rpc=mode==='complimentary'?'hotel_accommodation_checkout_complimentary':mode==='invoice'?'hotel_accommodation_checkout_invoice':'hotel_accommodation_checkout';
   const params=mode==='complimentary'?{p_stay:stay.id,p_amount:due,p_reason:draft.reason,p_approver_name:draft.approverName,p_approver_designation:draft.designation}:mode==='invoice'?{p_stay:stay.id,p_organization:draft.organization}:{p_stay:stay.id};
   const {error:e}=await supabase.rpc(rpc,params);
   if(e)throw e;
   setCheckoutDraft(v=>{const next={...v};delete next[stay.id];return next});
  },mode==='complimentary'?'Guest checked out; complimentary request awaits independent management approval.':mode==='invoice'?'Guest checked out; organization invoice awaits issuance.':'Guest checked out. Room is awaiting cleaning.');
 };
 const updateHousekeeping=(room,status)=>act(async()=>{
  if(activeRoomIds.has(room.id))throw Error('An occupied room cannot be marked ready.');
  const {error:e}=await supabase.from('hotel_accommodation_rooms').update({housekeeping_status:status}).eq('id',room.id);
  if(e)throw e;
 },'Room status updated.');
 return <article className="mw-accommodation">
  <div className="mw-accommodation-head"><div><h2>Accommodation Management</h2><p>{receptionSection==='vvip'?'VVIP Reception':receptionSection==='regular'?'Regular Reception':'VVIP and Regular / Standard'} • Reception • Housekeeping</p></div><button type="button" disabled={busy} onClick={refresh}>Refresh</button></div>
  {error&&<p role="alert" className="error">{error}</p>}{notice&&<p role="status" className="success">{notice}</p>}
  <nav aria-label="Accommodation functions" className="mw-accommodation-function-grid">
   {[
    ['guest-checkin','🛎️','Guest Check-In','Register arrivals and print guest forms','purple'],
    ['guest-register','🧳','Guest Register & Checkout','Check due departures and clear bills','pink'],
    ['accommodation-billing','🧾','Billing & Approvals','Complimentary requests and group invoices','gold'],
    ['accommodation-housekeeping','🧹','Housekeeping','Rooms awaiting cleaning or inspection','sky'],
    ['accommodation-reports','📊','Reception Sales','Your section’s sales and balances','purple']
   ].map(([target,icon,title,description,tone])=><button key={target} type="button" className={`mw-accommodation-function-card tone-${tone}`} onClick={()=>document.getElementById(target)?.scrollIntoView({behavior:'smooth',block:'start'})}><span className="mw-function-icon" aria-hidden="true">{icon}</span><strong>{title}</strong><span>{description}</span><span className="mw-function-open">Open function →</span></button>)}
  </nav>
  <div className="mw-accommodation-stats"><div><strong>{rooms.length}</strong><span>Total rooms</span></div><div><strong>{activeRoomIds.size}</strong><span>Occupied</span></div><div><strong>{roomOptions.length}</strong><span>Ready & available</span></div><div><strong>{rooms.filter(r=>r.housekeeping_status!=='ready').length}</strong><span>Housekeeping / Maintenance</span></div></div>
  {checkoutDueCount>0&&<div className="mw-checkout-alert" role="status"><strong>⏰ {checkoutDueCount} room{checkoutDueCount===1?'':'s'} due for checkout</strong><span>Default checkout time is 10:00 a.m. East Africa Time. Review the departure cards below.</span><button type="button" onClick={()=>document.getElementById('guest-register')?.scrollIntoView({behavior:'smooth'})}>View departures</button></div>}
  {canReception&&<>
   <span id="accommodation-reports" className="mw-accommodation-anchor"/>
   <section className="mw-accommodation-panel"><h3>Accommodation Sales by Reception</h3><p className="muted">Based on guest check-in dates. Payments and balances include subsequent payments against those stays.</p><div className="mw-accommodation-grid"><label>From<input type="date" value={reportFrom} max={reportTo} onChange={e=>setReportFrom(e.target.value)}/></label><label>To<input type="date" value={reportTo} min={reportFrom} onChange={e=>setReportTo(e.target.value)}/></label></div><div className="mw-accommodation-stats">{salesRows.map(row=><div key={row.section}><strong>{row.section==='vvip'?'VVIP Reception':'Regular Reception'}</strong><span>{row.stay_count} check-ins</span><span>Billed: {money(row.charged_kes)}</span><span>Received: {money(row.paid_kes)}</span><span>Outstanding: {money(row.balance_kes)}</span></div>)}{!salesRows.length&&<p>No accommodation stays for the selected period.</p>}</div></section>
   <section className="mw-accommodation-panel" aria-label="Daily room sales and reception reports">
    <h3>📊 Daily Room Sales & Reception Cashflow</h3>
    <p className="muted">Each booked night is recognised on its own day. A guest paying three nights upfront creates one day's room sale today and an advance for the remaining nights; that advance reduces as nights pass. Payment methods are recorded on the actual payment date.</p>
    <div className="mw-accommodation-actions">
     <button type="button" disabled={!dailyReport||!!reportExporting} onClick={()=>exportReport('pdf')}>{reportExporting==='pdf'?'Preparing PDF…':'⬇ Download PDF Report'}</button>
     <button type="button" disabled={!dailyReport||!!reportExporting} onClick={()=>exportReport('excel')}>{reportExporting==='excel'?'Preparing Excel…':'⬇ Download Excel Report'}</button>
    </div>
    {reportError&&<p role="alert" className="error">{reportError}</p>}
    {dailyReport&&<>
     <div className="mw-accommodation-stats">
      <div><strong>{money(dailyReport.totals.room_sales_kes)}</strong><span>Earned room sales</span></div>
      <div><strong>{money(dailyReport.totals.receipts_kes)}</strong><span>Payments received</span></div>
      <div><strong>{money(dailyReport.totals.cash_kes)}</strong><span>Cash received</span></div>
      <div><strong>{money(dailyReport.totals.advance_remaining_kes)}</strong><span>Advance for future nights</span></div>
      <div><strong>{money(dailyReport.totals.invoices_issued_kes)}</strong><span>Invoices issued</span></div>
      <div><strong>{money(dailyReport.totals.complimentary_kes)}</strong><span>Complimentary clearance</span></div>
     </div>
     <p className="muted">Cash at hand here means cash received from accommodation before float, expenses, withdrawals or transfers. It is not a reconciled physical cash drawer balance. Invoices and complimentary clearances are non-cash.</p>
     <div className="mw-report-table-wrap"><table className="mw-report-table"><thead><tr><th>Date</th><th>Room nights</th><th>Room sales</th><th>Cash</th><th>M-Pesa</th><th>PDQ</th><th>Other</th><th>Invoice</th><th>Complimentary</th><th>Advance remaining</th></tr></thead><tbody>
      {dailyReport.daily.map(row=><tr key={row.date}><td>{row.date}{row.is_future?' (scheduled)':''}</td><td>{row.occupied_room_nights}</td><td>{money(row.room_sales_kes)}</td><td>{money(row.cash_kes)}</td><td>{money(row.mpesa_kes)}</td><td>{money(row.pdq_kes)}</td><td>{money(row.other_kes)}</td><td>{money(row.invoices_issued_kes)}</td><td>{money(row.complimentary_kes)}</td><td>{money(row.advance_remaining_kes)}</td></tr>)}
     </tbody></table></div>
     <details><summary>Guest & room occupancy ({dailyReport.guests.length})</summary><div className="mw-report-table-wrap"><table className="mw-report-table"><thead><tr><th>Guest</th><th>Room</th><th>Reception</th><th>Check-in</th><th>Booked checkout</th><th>Days booked</th><th>Booked total</th><th>Received</th><th>Outstanding</th></tr></thead><tbody>
      {dailyReport.guests.map(stay=><tr key={stay.id}><td>{stay.guest_name}</td><td>{stay.room_number}</td><td>{stay.section}</td><td>{stay.check_in_date}</td><td>{stay.expected_check_out_date}</td><td>{stay.nights}</td><td>{money(stay.total_kes)}</td><td>{money(stay.received_kes)}</td><td>{money(stay.outstanding_kes)}</td></tr>)}
     </tbody></table></div></details>
    </>}
   </section>
   {canAdmin&&<details className="mw-accommodation-panel"><summary>Add a numbered room</summary><form onSubmit={createRoom} className="mw-accommodation-grid"><label>Room number<input required maxLength={30} value={roomForm.room_number} onChange={e=>setRoomForm(v=>({...v,room_number:e.target.value}))}/></label><label>Category<select value={roomForm.category} onChange={e=>setRoomForm(v=>({...v,category:e.target.value}))}><option value="vvip">VVIP</option><option value="regular">Regular / Standard</option></select></label><label>Link to existing website room listing (optional)<select value={roomForm.listing_id} onChange={e=>{const listing=roomRates.find(x=>x.id===e.target.value);setRoomForm(v=>({...v,listing_id:e.target.value,category:listing?.category==='vvip'?'vvip':v.category,nightly_rate_kes:listing?String(listing.nightly_rate_kes):v.nightly_rate_kes}))}}><option value="">No website listing linked</option>{roomRates.filter(x=>['vvip','regular'].includes(x.category)).map(x=><option key={x.id} value={x.id}>{x.name} — {money(x.nightly_rate_kes)}/night</option>)}</select></label><label>Rate per night (KSh)<input required type="number" min="0" step="0.01" value={roomForm.nightly_rate_kes} onChange={e=>setRoomForm(v=>({...v,nightly_rate_kes:e.target.value}))}/></label><button className="primary" disabled={busy}>Add room</button></form><p className="muted">Use the same rates as the existing website room listings where applicable.</p>{roomRates.length>0&&<small>Website rates: {roomRates.map(x=>x.name+' — '+money(x.nightly_rate_kes)).join(' | ')}</small>}</details>}
   <section id="guest-checkin" className="mw-accommodation-panel"><h3>🛎️ Guest Check-In</h3>
    <details className="mw-accommodation-print-batch"><summary>Download blank, serial-numbered guest registration forms</summary><div className="mw-accommodation-grid">
     <label>Number of copies (1-31)<input type="number" min="1" max="31" step="1" value={blankCopies} onChange={e=>setBlankCopies(e.target.value)}/></label>
     <label>Starting form serial number<input type="number" min="1" max="999999" step="1" value={blankStart} onChange={e=>setBlankStart(e.target.value)}/></label>
     <button type="button" onClick={()=>{try{downloadBlankRegistrationBatch({count:blankCopies,startNumber:blankStart});setError('')}catch(e){setError(e.message)}}}>Download Numbered Forms (PDF)</button>
    </div><p className="muted">Each copy is one A4 page with the same hotel logo. Serial numbers run consecutively within this download. Record the last number used before printing another batch to avoid duplicates.</p></details>
    <form onSubmit={checkIn} className="mw-accommodation-grid">
    <div className="mw-organization-checkin-card">
     <div className="mw-organization-checkin-heading"><span aria-hidden="true">👥</span><div><strong>Guest Category</strong><small>Choose how this accommodation stay should be registered</small></div></div>
     <div className="mw-organization-type-options">
      <label className={guest.guest_type==='walk_in'?'selected':''}><input type="radio" name="guest_type" value="walk_in" checked={guest.guest_type==='walk_in'} onChange={()=>setGuest(v=>({...v,guest_type:'walk_in',organization_id:''}))}/>🚶 Walk-in Guest</label>
      <label className={guest.guest_type==='organization'?'selected':''}><input type="radio" name="guest_type" value="organization" checked={guest.guest_type==='organization'} onChange={()=>setGuest(v=>({...v,guest_type:'organization'}))}/>🏢 Organization Guest</label>
     </div>
     {guest.guest_type==='organization'&&<div className="mw-organization-picker">
      <label>Search saved organizations<input type="search" value={organizationSearch} placeholder="Search by organization name" onChange={e=>setOrganizationSearch(e.target.value)}/></label>
      <label>Select organization<select required value={guest.organization_id} onChange={e=>setGuest(v=>({...v,organization_id:e.target.value}))}><option value="">Choose a saved organization</option>{matchingOrganizations.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}{selectedOrganization&&!matchingOrganizations.some(o=>o.id===selectedOrganization.id)&&<option value={selectedOrganization.id}>{selectedOrganization.name}</option>}</select></label>
      <div className="mw-organization-create"><label>Add new organization<input value={newOrganizationName} maxLength={180} placeholder="Official organization / group name" onChange={e=>setNewOrganizationName(e.target.value)}/></label><button type="button" disabled={busy||newOrganizationName.trim().length<2} onClick={registerOrganization}>Save & Select</button></div>
      {selectedOrganization&&<p className="mw-organization-selected">✓ Selected: <strong>{selectedOrganization.name}</strong>. After checking in this guest, the organization stays selected for the next guest in the group.</p>}
     </div>}
    </div>
    <div className="mw-returning-guest-card">
     <div className="mw-organization-checkin-heading"><span aria-hidden="true">🔎</span><div><strong>Returning Guest • Saved Details</strong><small>Search by ID number, phone number or name. Select the correct guest to prefill editable fields.</small></div></div>
     <label>Find previous guest<input type="search" autoComplete="off" value={returningSearch} placeholder="Name (3+ letters), ID or phone (6+ digits)" onChange={e=>setReturningSearch(e.target.value)}/></label>
     {/^[+0-9\s()-]+$/.test(returningSearch.trim())&&returningSearch.replace(/\D/g,'').length<6&&<p className="muted">Enter at least 6 digits to search by ID or phone.</p>}
     {returningBusy&&<p role="status" className="muted">Searching guest records…</p>}
     {returningError&&<p role="alert" className="error">Guest lookup unavailable: {returningError}</p>}
     {!returningBusy&&!returningError&&returningSearch.trim().length>=3&&(!/^[+0-9\s()-]+$/.test(returningSearch.trim())||returningSearch.replace(/\D/g,'').length>=6)&&!returningMatches.length&&<p className="muted">No previous guest found. Continue with new guest details below.</p>}
     {!!returningMatches.length&&<div className="mw-returning-results" aria-label="Returning guest matches">{returningMatches.map((match,index)=><div className="mw-returning-result" key={`${match.guest_id_number}-${match.guest_phone}-${index}`}><div><strong>{match.guest_name}</strong><small>ID ending {String(match.guest_id_number||'').slice(-4)||'—'} • Phone ending {String(match.guest_phone||'').slice(-4)||'—'} • Last visit {match.last_visit||'—'}</small></div><button type="button" onClick={()=>{setGuest(current=>prefillReturningGuest(current,match));setReturningSearch('');setReturningMatches([]);setNotice('Saved details loaded. Review and edit before check-in.')}}>Use details</button></div>)}</div>}
    </div>
    {[['guest_name','Guest Name'],['guest_id_number','Guest ID Number'],['guest_phone','Guest Phone Number'],['address','Guest Address'],['arrival_time','Arrival Time'],['nationality','Nationality'],['country_of_residence','Country of Residence'],['county_of_residence','County of Residence'],['email','Email (optional)'],['vehicle_registration','Vehicle Registration (optional)'],['reason_for_visit','Reason for Visit'],['accessibility_request','Accessibility Request'],['remarks','Guest Remarks']].map(([key,label])=><label key={key}>{label}<input required={['guest_name','guest_id_number','guest_phone','nationality','country_of_residence','county_of_residence'].includes(key)} type={key==='email'?'email':key==='arrival_time'?'time':'text'} value={guest[key]} onChange={e=>setGuest(v=>({...v,[key]:e.target.value}))}/></label>)}
    <label>Assigned Room<select required value={guest.room_id} onChange={e=>{const chosen=rooms.find(r=>r.id===e.target.value);const listing=roomRates.find(r=>r.id===chosen?.listing_id);setGuest(v=>({...v,room_id:e.target.value,listing_id:listing?.id||'',package_key:listing?.package_rates?.bed_only?'bed_only':PACKAGES.find(([k])=>listing?.package_rates?.[k])?.[0]||'bed_only',guest_count:1}))}}><option value="">Choose available room</option>{roomOptions.map(r=><option key={r.id} value={r.id}>{r.room_number} — {r.category==='vvip'?'VVIP':'Regular / Standard'}</option>)}</select></label>
    {room&&<label>Website Room Type<select required={availableListings.length>0} value={guest.listing_id} onChange={e=>{const listing=roomRates.find(x=>x.id===e.target.value);setGuest(v=>({...v,listing_id:e.target.value,package_key:listing?.package_rates?.bed_only?'bed_only':PACKAGES.find(([k])=>listing?.package_rates?.[k])?.[0]||'bed_only',guest_count:1}))}}><option value="">{availableListings.length?'Choose room type':'No website room type configured — standard rate'}</option>{availableListings.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>}
    {selectedListing&&<><label>Room Package<select required value={guest.package_key} onChange={e=>setGuest(v=>({...v,package_key:e.target.value}))}>{PACKAGES.filter(([key])=>selectedListing.package_rates?.[key]).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label><label>Number of Guests<select value={guest.guest_count} onChange={e=>setGuest(v=>({...v,guest_count:Number(e.target.value)}))}>{Array.from({length:selectedListing.max_guests},(_,i)=><option key={i+1} value={i+1}>{i+1} guest{i?'s':''}</option>)}</select></label></>}
    <label>Check-In Date<input type="date" required value={guest.check_in_date} onChange={e=>setGuest(v=>({...v,check_in_date:e.target.value}))}/></label><label>Expected Check-Out Date<input type="date" required min={nextDay(guest.check_in_date)} value={guest.expected_check_out_date} onChange={e=>setGuest(v=>({...v,expected_check_out_date:e.target.value}))}/></label>
    <div className="mw-accommodation-calculation"><b>{totals.nights} night(s)</b><span>Rate: {nightlyRate===null?'Choose package':money(nightlyRate)} per night</span><strong>Total: {money(totals.total)}</strong></div>
    <label>Amount paid now (KSh; partial allowed)<input type="number" min="0" max={totals.total} step="0.01" value={guest.initial_payment} onChange={e=>setGuest(v=>({...v,initial_payment:e.target.value}))}/></label><label>Payment method<select value={guest.payment_method} onChange={e=>setGuest(v=>({...v,payment_method:e.target.value}))}><option value="cash">Cash</option><option value="mpesa">M-Pesa</option><option value="card">Credit Card / PDQ</option></select></label><label>Payment reference<input value={guest.payment_reference} required={Number(guest.initial_payment)>0&&['mpesa','card'].includes(guest.payment_method)} onChange={e=>setGuest(v=>({...v,payment_reference:e.target.value}))}/></label>
    <div className="mw-accommodation-calculation"><span>Paid now: {money(guest.initial_payment)}</span><strong>Balance: {money(Math.max(0,totals.total-Number(guest.initial_payment||0)))}</strong></div><button type="button" onClick={()=>downloadGuestRegistration({guest:{...guest,organization_name:selectedOrganization?.name||'',nights:totals.nights},roomNumber:room?.room_number||'',paymentMethod:guest.payment_method,reference:guest.payment_reference})}>Download Guest Registration PDF</button><button className="primary" disabled={busy||!guest.room_id||totals.nights<1||(availableListings.length>0&&!selectedListing)||nightlyRate===null}>Check In Guest</button>
   </form></section>
   <section id="guest-register" className="mw-accommodation-panel"><h3>🧳 Guest Register & Checkout</h3><p className="muted">Default checkout: 10:00 a.m. East Africa Time. Invoice and complimentary departures remain accountable until processed.</p><div className="mw-accommodation-guest-grid">{stays.map(stay=>{const paid=payments.filter(p=>p.stay_id===stay.id),t=accommodationTotals(stay.check_in_date,stay.expected_check_out_date,stay.nightly_rate_kes,paid);return <AccommodationStayCard key={stay.id} stay={stay} supabase={supabase} roomNumber={roomName(stay.room_id)} listingName={roomRates.find(x=>x.id===stay.listing_id)?.name||'Standard room rate'} organizationName={organizations.find(o=>o.id===stay.organization_id)?.name||''} packageLabel={PACKAGES.find(([key])=>key===stay.package_key)?.[1]||'Bed Only'} totals={t} paymentDraft={paymentDraft[stay.id]||{}} checkoutDraft={checkoutDraft[stay.id]||{}} clockNow={clockNow} busy={busy} onPaymentChange={next=>setPaymentDraft(v=>({...v,[stay.id]:next}))} onCheckoutChange={next=>setCheckoutDraft(v=>({...v,[stay.id]:next}))} onRecordPayment={()=>addPayment(stay)} onCheckout={()=>checkOut(stay)} onDownload={()=>downloadGuestRegistration({guest:{...stay,organization_name:organizations.find(o=>o.id===stay.organization_id)?.name||'',nights:t.nights},roomNumber:roomName(stay.room_id),paymentMethod:paid.at(-1)?.method||'',reference:paid.at(-1)?.reference||''})}/>})}{!stays.length&&<p>No guest stays recorded yet.</p>}</div></section>
   <AccommodationBilling supabase={supabase} stays={stays} payments={payments} rooms={rooms} organizations={organizations} canAdmin={canAdmin} refresh={refresh}/>
  </>}
  <section id="accommodation-housekeeping" className="mw-accommodation-panel"><h3>🧹 Room Attendants / Housekeeping</h3><div className="mw-accommodation-rooms">{rooms.map(r=><div key={r.id} className="mw-accommodation-room"><strong>{r.room_number} • {r.category==='vvip'?'VVIP':'Regular / Standard'}</strong><span>{(()=>{const stay=stays.find(s=>s.room_id===r.id&&s.status==='checked_in');const status=stay?accommodationCheckoutStatus(stay,clockNow):null;return status==='due'?'Due for checkout':status==='overdue'?'Overdue for checkout':stay?'Occupied':r.housekeeping_status})()}</span><label>Room condition<select disabled={busy||activeRoomIds.has(r.id)} value={r.housekeeping_status} onChange={e=>updateHousekeeping(r,e.target.value)}><option value="dirty">Awaiting cleaning</option><option value="cleaning">Cleaning in progress</option><option value="inspection">Ready for inspection</option><option value="ready">Clean / Ready</option><option value="maintenance">Maintenance</option></select></label></div>)}</div>{!rooms.length&&<p>Admin must add numbered rooms before reception can check in guests.</p>}</section>
 </article>;
}
