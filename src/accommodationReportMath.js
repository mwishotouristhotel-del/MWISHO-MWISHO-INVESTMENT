// Revenue is allocated to booked nights, while receipts remain on the day paid.
// Invoice and complimentary clearances are never treated as cash received.
const DAY=86400000;
const PACKAGE_LABELS={bed_only:'Bed Only',bed_breakfast:'Bed & Breakfast',half_board:'Half Board',full_board:'Full Board'};
const cents=value=>Math.round((Number(value)||0)*100);
const dayNumber=date=>Date.parse(String(date).slice(0,10)+'T00:00:00Z')/DAY;
const fromDay=number=>new Date(number*DAY).toISOString().slice(0,10);
export const nairobiDate=timestamp=>new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Nairobi',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(timestamp));
export const bookedNights=stay=>Math.max(1,dayNumber(stay.expected_check_out_date)-dayNumber(stay.check_in_date));
// Filter both ledger events and stays to the same reception before computing totals.
// The server RPC already restricts receptionists to their assigned section.
export function scopeAccommodationReport(data,section){
 if(!['regular','vvip'].includes(section))throw Error('Choose a valid reception section.');
 const stays=(data?.stays||[]).filter(stay=>stay.section===section);
 const ids=new Set(stays.map(stay=>stay.id));
 return {stays,payments:(data?.payments||[]).filter(payment=>ids.has(payment.stay_id)),invoices:(data?.invoices||[]).filter(invoice=>ids.has(invoice.stay_id))};
}
export const nightSales=(stay,date)=>{
 const index=dayNumber(date)-dayNumber(stay.check_in_date),nights=bookedNights(stay);
 if(index<0||index>=nights)return 0;
 const total=cents(stay.total_kes),each=Math.floor(total/nights),remainder=total-each*nights;
 return (each+(index<remainder?1:0))/100;
};
const earnedThrough=(stay,date)=>{
 const nights=bookedNights(stay),days=Math.max(0,Math.min(nights,dayNumber(date)-dayNumber(stay.check_in_date)+1));
 const amount=cents(stay.total_kes),each=Math.floor(amount/nights),remainder=amount-each*nights;
 return (each*days+Math.min(days,remainder))/100;
};
const total=sum=>Math.round(sum*100)/100;
const sum=(rows,fn)=>total(rows.reduce((n,row)=>n+fn(row),0));
export function buildAccommodationReport(data,{from,to,today=nairobiDate(new Date())}){
 if(!from||!to||to<from||dayNumber(to)-dayNumber(from)>366)throw Error('Choose a valid report period of at most 367 days.');
 const stays=data?.stays||[],payments=data?.payments||[],invoices=data?.invoices||[];
 const staffNames=rows=>[...new Set(rows.map(s=>String(s.checkin_staff_name||'').trim()).filter(Boolean))].sort().join(', ')||'No check-ins';
 const paymentsByStay=new Map(),invoicesByStay=new Map();
 for(const p of payments){if(!paymentsByStay.has(p.stay_id))paymentsByStay.set(p.stay_id,[]);paymentsByStay.get(p.stay_id).push({...p,day:nairobiDate(p.received_at)});}
 for(const i of invoices){if(!invoicesByStay.has(i.stay_id))invoicesByStay.set(i.stay_id,[]);invoicesByStay.get(i.stay_id).push(i);}
 const guests=stays.filter(s=>s.check_in_date<=to&&s.expected_check_out_date>from).map(s=>{
  const paid=paymentsByStay.get(s.id)||[],billed=invoicesByStay.get(s.id)||[];
  return {...s,package_label:PACKAGE_LABELS[s.package_key]||s.package_key||'Bed Only',guest_count:Number(s.guest_count)||1,nights:bookedNights(s),days_in_period:Math.max(0,Math.min(dayNumber(s.expected_check_out_date),dayNumber(to)+1)-Math.max(dayNumber(s.check_in_date),dayNumber(from))),
   received_kes:sum(paid.filter(p=>p.method!=='complimentary'),p=>Number(p.amount_kes)),complimentary_kes:sum(paid.filter(p=>p.method==='complimentary'),p=>Number(p.amount_kes)),
   invoiced_kes:sum(billed,i=>Number(i.amount_kes)),outstanding_kes:Math.max(0,total(Number(s.total_kes)-sum(paid,p=>Number(p.amount_kes))))};
 });
 const daily=[];
 for(let d=dayNumber(from);d<=dayNumber(to);d++){
  const date=fromDay(d),byDate=payments.filter(p=>nairobiDate(p.received_at)===date);
  const amountFor=method=>sum(byDate.filter(p=>p.method===method),p=>Number(p.amount_kes));
  const roomSales=sum(stays,s=>nightSales(s,date));
  const occupiedNights=stays.filter(s=>nightSales(s,date)>0).length;
  const advanceRemaining=sum(stays,s=>{
   const paid=sum((paymentsByStay.get(s.id)||[]).filter(p=>p.day<=date&&p.method!=='complimentary'),p=>Number(p.amount_kes));
   return Math.max(0,total(paid-earnedThrough(s,date)));
  });
  const cash=amountFor('cash'),mpesa=amountFor('mpesa'),pdq=amountFor('card'),bank=amountFor('bank')+amountFor('other');
  const relevantStays=stays.filter(s=>nightSales(s,date)>0||s.check_in_date===date||byDate.some(p=>p.stay_id===s.id));
  daily.push({date,section:'All permitted receptions',receptionist_on_duty:staffNames(relevantStays),room_sales_kes:roomSales,occupied_room_nights:occupiedNights,
   cash_kes:cash,mpesa_kes:mpesa,pdq_kes:pdq,other_kes:bank,
   receipts_kes:total(cash+mpesa+pdq+bank),complimentary_kes:amountFor('complimentary'),
   invoices_issued_kes:sum(invoices.filter(i=>i.invoice_date===date),i=>Number(i.amount_kes)),
   advance_remaining_kes:advanceRemaining,is_future:date>today});
 }
 const paymentRows=payments.filter(p=>{const date=nairobiDate(p.received_at);return date>=from&&date<=to;}).map(p=>{
  const stay=stays.find(s=>s.id===p.stay_id);
  return {date:nairobiDate(p.received_at),guest_name:stay?.guest_name||'',room_number:stay?.room_number||'',section:stay?.section||'',
   method:p.method,reference:p.reference||'',amount_kes:Number(p.amount_kes)};
 });
 const invoiceRows=invoices.filter(i=>i.invoice_date>=from&&i.invoice_date<=to).map(i=>{
  const stay=stays.find(s=>s.id===i.stay_id);
  return {...i,guest_name:stay?.guest_name||'',room_number:stay?.room_number||'',section:stay?.section||''};
 });
 const totals=Object.fromEntries(['room_sales_kes','occupied_room_nights','cash_kes','mpesa_kes','pdq_kes','other_kes','receipts_kes','complimentary_kes','invoices_issued_kes'].map(key=>[key,sum(daily,row=>row[key])]));
 totals.advance_remaining_kes=daily.at(-1)?.advance_remaining_kes||0;
 return {from,to,daily,guests,paymentRows,invoiceRows,totals,receptionist_on_duty:staffNames(stays)};
}
