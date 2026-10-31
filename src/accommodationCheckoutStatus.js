const kenyaClock=(now)=>{
 const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Africa/Nairobi',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now);
 const values=Object.fromEntries(parts.map(({type,value})=>[type,value]));
 return {date:`${values.year}-${values.month}-${values.day}`,minuteOfDay:Number(values.hour)*60+Number(values.minute)};
};

// 10:00 a.m. East Africa Time on the expected departure date.
export function accommodationCheckoutStatus(stay,now=new Date()){
 if(stay.status!=='checked_in')return 'checked_out';
 const clock=kenyaClock(now);
 if(stay.expected_check_out_date<clock.date)return 'overdue';
 if(stay.expected_check_out_date===clock.date&&clock.minuteOfDay>=600)return 'due';
 return 'in_house';
}
