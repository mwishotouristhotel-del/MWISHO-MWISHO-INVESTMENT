export function accommodationNights(checkIn,checkOut){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(checkIn||'')||!/^\d{4}-\d{2}-\d{2}$/.test(checkOut||''))return 0;
 const start=Date.parse(checkIn+'T00:00:00Z'),end=Date.parse(checkOut+'T00:00:00Z');
 return Number.isFinite(start)&&Number.isFinite(end)?Math.max(0,Math.round((end-start)/86400000)):0;
}
export function accommodationTotals(checkIn,checkOut,rate,payments=[]){
 const nights=accommodationNights(checkIn,checkOut);
 const total=Math.round(nights*Number(rate||0)*100)/100;
 const paid=Math.round(payments.reduce((sum,p)=>sum+Number(p.amount_kes||0),0)*100)/100;
 return {nights,total,paid,balance:Math.max(0,Math.round((total-paid)*100)/100)};
}
