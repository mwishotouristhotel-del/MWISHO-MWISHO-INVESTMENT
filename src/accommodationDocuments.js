import {jsPDF} from 'jspdf';
import websiteLogoSvg from '../hotel/assets/mwisho-logo.svg?raw';

// Use the same embedded PNG as the customer website's logo SVG (no redraw).
const websiteLogoPng=websiteLogoSvg.match(/href="(data:image\/png;base64,[^"]+)"/)?.[1];
export const SERIAL_BATCH_LIMIT=31;
export const registrationSerial=(number)=>String(number).padStart(5,'0');
export function validateRegistrationBatch(count,startNumber){
 const total=Number(count),first=Number(startNumber);
 if(!Number.isInteger(total)||total<1||total>SERIAL_BATCH_LIMIT)throw Error('Choose between 1 and 31 forms.');
 if(!Number.isSafeInteger(first)||first<1||first+total-1>999999)throw Error('Enter a starting serial between 1 and 999999.');
 return {total,first};
}

const page=(doc,title,subtitle)=>{
 doc.setDrawColor(86,41,122);doc.setLineWidth(1);doc.rect(10,10,190,277);
 doc.setFillColor(250,247,252);doc.rect(11,11,188,22,'F');
 doc.setFillColor(86,41,122);doc.rect(11,32,188,1.2,'F');
 doc.setTextColor(86,41,122);doc.setFont('helvetica','bold');doc.setFontSize(15);doc.text('MWISHO TOURIST HOTEL',17,20);
 doc.setFont('helvetica','italic');doc.setFontSize(9);doc.text('Taste of Class',17,26);
 if(websiteLogoPng)doc.addImage(websiteLogoPng,'PNG',155,12,38,17.23);
 doc.setTextColor(86,41,122);doc.setFont('helvetica','bold');doc.setFontSize(13);doc.text(title,15,43);
 doc.setFontSize(9);doc.setFont('helvetica','normal');doc.setTextColor(80,80,80);doc.text(subtitle,15,49);
};
const field=(doc,label,value,x,y,width=178)=>{
 doc.setFont('helvetica','bold');doc.setFontSize(9);doc.setTextColor(35,35,35);doc.text(label,x,y);
 const left=x+doc.getTextWidth(label)+2;
 doc.setDrawColor(160,160,160);doc.setLineWidth(.15);doc.line(left,y+1,x+width,y+1);
 if(value!==undefined&&value!==null&&String(value).trim()){
  doc.setFont('helvetica','normal');doc.text(String(value).slice(0,85),left+1,y-.5,{maxWidth:x+width-left-2});
 }
};
const text=(value)=>String(value??'').trim();

const drawGuestRegistration=(doc,{guest={},roomNumber='',paymentMethod='',reference='',receptionist='',serialNumber=null}={})=>{
 page(doc,'GUEST REGISTRATION FORM','Guest details and accommodation particulars');
 if(serialNumber!==null){
  doc.setFont('helvetica','bold');doc.setFontSize(9);doc.setTextColor(86,41,122);
  doc.text('FORM NO. '+registrationSerial(serialNumber),194,48,{align:'right'});
 }
 field(doc,'DATE:',guest.check_in_date||'',15,61,57);
 field(doc,'ARRIVAL TIME:',guest.arrival_time||'',77,61,58);
 field(doc,'ROOM NO:',roomNumber,140,61,55);
 field(doc,'Guest Name:',guest.guest_name,15,71);
 field(doc,'Address:',guest.address,15,81);
 field(doc,'Phone Number:',guest.guest_phone,15,91);
 field(doc,'ID Number / Passport No:',guest.guest_id_number,15,101,111);
 field(doc,'No. Pax:',guest.guest_count,132,101,63);
 field(doc,'Email:',guest.email,15,111);
 field(doc,'Vehicle Registration Number:',guest.vehicle_registration,15,121);
 field(doc,'Nationality:',guest.nationality,15,131);
 field(doc,'Country of Residence:',guest.country_of_residence,15,141,111);
 field(doc,'County:',guest.county_of_residence,132,141,63);
 field(doc,'Reason for Visiting:',guest.reason_for_visit,15,151);
 field(doc,'',null,15,158);
 field(doc,'Room Accessibility Request:',guest.accessibility_request,15,168);
 field(doc,'',null,15,175);
 const packageLabel={bed_only:'Bed Only',bed_breakfast:'Bed & Breakfast',half_board:'Half Board',full_board:'Full Board'}[guest.package_key]||guest.package_key;
 field(doc,'BOOKED PACKAGE:',packageLabel,15,182);
 field(doc,'CHECK-OUT DATE:',guest.expected_check_out_date,15,190,104);
 field(doc,'No. of Nights:',guest.nights,125,190,70);
 doc.setTextColor(86,41,122);doc.setFont('helvetica','bold');doc.setFontSize(10);doc.text('MODE OF PAYMENT',15,195);
 const methods=[['M-Pesa','mpesa','Ref No'],['Cash','cash','Receipt No'],['Credit Card / PDQ','card','Ref No'],['Invoice','invoice','Invoice No'],['Complimentary','complimentary','Approved By']];
 methods.forEach(([name,key,refLabel],i)=>{
  const y=203+i*8;doc.setFontSize(9);doc.setTextColor(30,30,30);doc.setFont('helvetica','normal');
  doc.text(name,15,y);doc.rect(63,y-3,4,4);if(paymentMethod===key)doc.text('X',64,y);
  field(doc,refLabel+':',paymentMethod===key?reference:'',78,y,117);
 });
 field(doc,'GUEST REMARKS:',guest.remarks,15,250);
 doc.setFont('helvetica','italic');doc.setFontSize(7);doc.setTextColor(80,80,80);
 doc.text('Guest information is handled confidentially for hotel operations, safety and applicable legal requirements.',15,259);
 doc.setDrawColor(80,80,80);doc.line(15,271,79,271);doc.line(127,271,195,271);
 doc.setFont('helvetica','normal');doc.setFontSize(8);doc.text('Guest Signature',15,276);doc.text('Receptionist Signature',127,276);
 if(receptionist)doc.text(text(receptionist),127,281);
 doc.setTextColor(86,41,122);doc.setFontSize(7);doc.text('mwishotouristhotel@gmail.com',105,284,{align:'center'});
};

export function downloadGuestRegistration(options={}){
 const doc=new jsPDF({unit:'mm',format:'a4'});
 drawGuestRegistration(doc,options);
 doc.save(`Mwisho-Guest-Registration-${text(options.roomNumber||'blank').replace(/[^a-z0-9-]/gi,'-')}.pdf`);
}

export function downloadBlankRegistrationBatch({count=1,startNumber=1}={}){
 const {total,first}=validateRegistrationBatch(count,startNumber);
 const doc=new jsPDF({unit:'mm',format:'a4'});
 for(let index=0;index<total;index++){
  if(index)doc.addPage();
  drawGuestRegistration(doc,{serialNumber:first+index});
 }
 const last=first+total-1;
 doc.save(`Mwisho-Guest-Registration-Forms-${registrationSerial(first)}-${registrationSerial(last)}.pdf`);
}

export function downloadAccommodationInvoice({invoice,items}){
 const doc=new jsPDF({unit:'mm',format:'a4'});
 page(doc,'ACCOMMODATION INVOICE',`Invoice ${invoice.invoice_number||''} - ${invoice.invoice_date||''}`);
 field(doc,'Bill To:',invoice.organization_name,15,62);
 field(doc,'Organization Address:',invoice.organization_address,15,72);
 field(doc,'KRA PIN:',invoice.kra_pin,15,82,110);
 field(doc,'Payment Terms:',invoice.payment_terms,15,92);
 doc.setFillColor(244,236,249);doc.rect(15,102,180,10,'F');
 doc.setFont('helvetica','bold');doc.setFontSize(9);doc.setTextColor(55,32,70);
 doc.text('ROOM',18,109);doc.text('GUEST',48,109);doc.text('STAY DATES',112,109);doc.text('KSh',188,109,{align:'right'});
 let y=119;
 for(const item of items){
  if(y>245){doc.addPage();page(doc,'ACCOMMODATION INVOICE (continued)',invoice.invoice_number||'');y=60;}
  doc.setFont('helvetica','normal');doc.setFontSize(8);doc.setTextColor(35,35,35);
  doc.text(text(item.room_number),18,y);doc.text(text(item.guest_name).slice(0,30),48,y);
  doc.text(`${item.check_in_date} - ${item.expected_check_out_date}`,112,y);
  doc.text(Number(item.amount_kes||0).toLocaleString('en-KE',{minimumFractionDigits:2}),188,y,{align:'right'});
  doc.setDrawColor(230,230,230);doc.line(15,y+3,195,y+3);y+=12;
 }
 const amount=items.reduce((sum,i)=>sum+Number(i.amount_kes||0),0);
 doc.setFont('helvetica','bold');doc.setFontSize(11);doc.setTextColor(86,41,122);
 doc.text(`TOTAL DUE: KSh ${amount.toLocaleString('en-KE',{minimumFractionDigits:2})}`,188,Math.min(264,y+5),{align:'right'});
 doc.save(`Mwisho-Invoice-${text(invoice.invoice_number||'draft').replace(/[^a-z0-9-]/gi,'-')}.pdf`);
}
