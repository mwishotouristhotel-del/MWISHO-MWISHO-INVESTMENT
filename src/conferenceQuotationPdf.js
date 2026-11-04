import {jsPDF} from 'jspdf';
import autoTable from 'jspdf-autotable';
import hotelLogoUrl from '../hotel/assets/mwisho-logo.svg';

const money=value=>Number(value||0).toLocaleString('en-KE',{minimumFractionDigits:2,maximumFractionDigits:2});
const clean=value=>String(value??'').trim();
async function logoData(){
 const image=new Image();image.crossOrigin='anonymous';image.src=hotelLogoUrl;
 await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=reject;});
 const canvas=document.createElement('canvas');canvas.width=450;canvas.height=180;
 canvas.getContext('2d').drawImage(image,0,0,450,180);
 return canvas.toDataURL('image/png');
}
export async function downloadConferenceQuotation(quote,lines,vatRate,terms,paymentDetails){
 const valid=lines.filter(x=>clean(x.description));
 if(!valid.length)throw Error('Add at least one quotation item.');
 if(valid.some(x=>![x.unitPrice,x.pax,x.days].every(v=>Number.isFinite(Number(v))&&Number(v)>=0)))throw Error('Check item prices and quantities.');
 const doc=new jsPDF({format:'a4',unit:'mm'}),pageWidth=210;
 try{doc.addImage(await logoData(),'PNG',84,8,42,17);}catch{doc.setFontSize(15);doc.text('MWISHO TOURIST HOTEL',105,17,{align:'center'});}
 doc.setFont('helvetica','bold');doc.setFontSize(9);doc.setTextColor(86,41,122);
 doc.text('BAR & RESTAURANTS : CONFERENCE : ACCOMMODATION',105,31,{align:'center'});
 doc.setDrawColor(130,50,120);doc.line(14,35,196,35);
 doc.setFont('helvetica','bold');doc.setFontSize(14);doc.text('QUOTATION',105,43,{align:'center'});
 const refYear=new Intl.DateTimeFormat('en',{year:'numeric',timeZone:'Africa/Nairobi'}).format(new Date(quote.created_at));
 const reference=quote.reference||'MTH'+refYear+'-'+quote.id.replace(/-/g,'').slice(0,10).toUpperCase();
 doc.setFontSize(9);doc.text('Quotation Reference: '+reference,14,52);
 doc.text('Prepared: '+new Date().toLocaleDateString('en-KE',{timeZone:'Africa/Nairobi'}),196,52,{align:'right'});
 doc.text('ATTN: '+clean(quote.organization_name),14,61);
 doc.setFont('helvetica','normal');doc.text('Dear '+clean(quote.contact_person)+',',14,68);
 doc.text('Thank you for your enquiry. Please find our quotation below.',14,74);
 const schedule='Event: '+clean(quote.event_date)+' '+clean(quote.event_start_time).slice(0,5)+' to '+clean(quote.event_end_date||quote.event_date)+' '+clean(quote.event_end_time).slice(0,5);
 doc.text(doc.splitTextToSize(schedule,180),14,81);
 const subtotal=valid.reduce((sum,x)=>sum+Number(x.unitPrice)*Number(x.pax)*Number(x.days),0);
 const vat=subtotal*Number(vatRate||0)/100;
 autoTable(doc,{startY:92,margin:{left:14,right:14,bottom:35},theme:'grid',
  head:[['Item / Description','Rate (KSh)','Pax / Qty','Days','Total (KSh)']],
  body:valid.map(x=>[clean(x.description),money(x.unitPrice),String(x.pax),String(x.days),money(Number(x.unitPrice)*Number(x.pax)*Number(x.days))]),
  styles:{fontSize:8,cellPadding:3},headStyles:{fillColor:[92,41,145]},
  columnStyles:{0:{cellWidth:77},1:{halign:'right'},2:{halign:'right'},3:{halign:'right'},4:{halign:'right'}}});
 let y=doc.lastAutoTable.finalY+7;
 const ensure=needed=>{if(y+needed>269){
  doc.addPage();doc.setFont('helvetica','bold');doc.setFontSize(9);doc.setTextColor(86,41,122);
  doc.text('MWISHO TOURIST HOTEL',105,17,{align:'center'});
  doc.text('BAR & RESTAURANTS : CONFERENCE : ACCOMMODATION',105,25,{align:'center'});
  doc.setDrawColor(130,50,120);doc.line(14,29,196,29);
  doc.text('QUOTATION (CONTINUED)',105,37,{align:'center'});y=48;
 }};
 ensure(28);doc.setFont('helvetica','bold');doc.setFontSize(10);
 for(const [label,amount] of [['SUB-TOTAL',subtotal],['VAT ('+Number(vatRate||0)+'%)',vat],['GRAND TOTAL',subtotal+vat]]){
  doc.text(label,126,y);doc.text('KSh '+money(amount),195,y,{align:'right'});y+=7;
 }
 doc.setFont('helvetica','normal');doc.setFontSize(9);
 for(const [heading,value] of [['Package / service details',quote.requirements],['Terms and inclusions',terms],['Payment information',paymentDetails]]){
  if(!clean(value))continue;
  const wrapped=doc.splitTextToSize(clean(value),181);
  ensure(10);
  doc.setFont('helvetica','bold');doc.text(heading,14,y);y+=5;
  doc.setFont('helvetica','normal');
  for(const line of wrapped){ensure(5);doc.text(line,14,y);y+=4.5;}
  y+=4;
 }
 ensure(33);doc.text('Prepared by: __________________________',14,y+5);
 doc.text('Authorized signature: ___________________',14,y+14);
 doc.text('Date: __________________',14,y+23);
 doc.setDrawColor(115,67,141);doc.roundedRect(134,y,60,28,2,2);doc.text('HOTEL STAMP',164,y+15,{align:'center'});
 const pages=doc.getNumberOfPages();for(let p=1;p<=pages;p++){
  doc.setPage(p);doc.setFontSize(8);doc.setTextColor(90);
  doc.setTextColor(86,41,122);
  doc.text('Email: mwishotouristhotel@gmail.com  |  Phone: 0745396385',105,273,{align:'center'});
  doc.text('Address: P.O.BOX 35-40600',105,277,{align:'center'});
  doc.text('Location: Siaya Town, Along Kisumu-Luanda-Siaya Road',105,281,{align:'center'});
  doc.text('Opposite Shell Petrol Station',105,285,{align:'center'});
  doc.text('Page '+p+' of '+pages,196,292,{align:'right'});
 }
 doc.save('MWISHO-Quotation-'+reference+'.pdf');
}
