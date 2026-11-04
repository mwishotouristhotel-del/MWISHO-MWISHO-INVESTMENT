import {jsPDF} from 'jspdf';
import websiteLogoSvg from '../hotel/assets/mwisho-logo.svg?raw';

const logo=websiteLogoSvg.match(/href="(data:image\/png;base64,[^"]+)"/)?.[1];
const purple=[76,38,108],blue=[71,145,184],yellow=[252,219,92],red=[170,63,82];
const money=value=>Number(value||0).toLocaleString('en-KE',{minimumFractionDigits:2,maximumFractionDigits:2});
const clean=value=>String(value??'').trim();

// Shared document template: the photographed hotel invoice is a layout reference,
// while tax, payment accounts and legal terms are supplied from actual records.
export function printHotelInvoice({reference,invoiceDate,client,clientAddress='',clientPin='',deliveryDates='',purchaseOrder='',deliveryNote='',issuerPin='',category='',rows=[],subtotal,vatAmount=0,terms='',paymentDetails='',filename='MWISHO-Invoice.pdf'}){
 const doc=new jsPDF({format:'a4',unit:'mm'});
 const frame=()=>{
  doc.setDrawColor(...purple);doc.setLineWidth(.45);doc.rect(9,9,192,279);
  if(logo)doc.addImage(logo,'PNG',15,13,39,18);
  doc.setFont('times','bold');doc.setFontSize(21);doc.setTextColor(44,32,44);doc.text('MWISHO TOURIST HOTEL',122,23,{align:'center'});
  doc.setFont('helvetica','bold');doc.setFontSize(8);doc.setTextColor(...purple);doc.text('BAR & RESTAURANTS : CONFERENCE : ACCOMMODATION',105,37,{align:'center'});
  doc.setFillColor(...blue);doc.roundedRect(59,40,92,12,2,2,'F');doc.setTextColor(255,255,255);doc.setFontSize(13);doc.text('PAYMENT INVOICE',105,48,{align:'center'});
  doc.setFillColor(...yellow);doc.roundedRect(13,55,80,10,2,2,'F');doc.roundedRect(118,55,79,10,2,2,'F');
  doc.setTextColor(49,39,53);doc.setFontSize(8.5);doc.text(issuerPin?'PIN NO: '+clean(issuerPin):'MWISHO INVESTMENT',17,61.5);
  doc.text('REF: '+clean(reference).slice(0,30),121,61.5);
 };
 const footer=()=>{
  for(let p=1;p<=doc.getNumberOfPages();p++){
   doc.setPage(p);doc.setFont('helvetica','normal');doc.setFontSize(7.1);doc.setTextColor(...purple);
   doc.text('Email: mwishotouristhotel@gmail.com  |  Phone: 0745396385',105,275,{align:'center'});
   doc.text('P.O.BOX 35-40600 | Siaya Town, Along Kisumu-Luanda-Siaya Road',105,280,{align:'center'});
   doc.text('Opposite Shell Petrol Station',105,284,{align:'center'});
   if(doc.getNumberOfPages()>1)doc.text(`Page ${p} of ${doc.getNumberOfPages()}`,195,285,{align:'right'});
  }
 };
 let y=0;
 const addPage=()=>{doc.addPage();frame();doc.setTextColor(48,42,54);doc.setFont('helvetica','bold');doc.setFontSize(8);doc.text('INVOICE '+clean(reference)+' - CONTINUED',15,74);y=83;};
 const ensure=(height)=>{if(y+height>264)addPage();};
 const tableHeader=()=>{
  ensure(15);doc.setFillColor(...yellow);doc.rect(14,y,182,11,'F');doc.setDrawColor(...purple);doc.setLineWidth(.2);doc.rect(14,y,182,11);
  for(const x of [32,108,139,159])doc.line(x,y,x,y+11);
  doc.setFont('helvetica','bold');doc.setFontSize(8);doc.setTextColor(54,39,56);
  doc.text('QTY',23,y+7,{align:'center'});doc.text('DESCRIPTION',70,y+7,{align:'center'});doc.text('COST / ITEM',123.5,y+7,{align:'center'});doc.text('DAYS',149,y+7,{align:'center'});doc.text('AMOUNT (KSh)',177,y+7,{align:'center'});y+=11;
 };
 const block=(heading,value)=>{
  if(!clean(value))return;ensure(11);doc.setFont('helvetica','bold');doc.setFontSize(9);doc.setTextColor(...purple);doc.text(heading,15,y+4);y+=9;
  doc.setFont('helvetica','normal');doc.setFontSize(8.4);doc.setTextColor(45,43,48);
  for(const para of clean(value).split(/\r?\n/)){
   const lines=doc.splitTextToSize(para||' ',177);
   for(const line of lines){ensure(4.7);doc.text(line,15,y);y+=4.7;}
  }
  y+=6;
 };
 frame();
 doc.setDrawColor(...red);doc.setLineWidth(.8);doc.roundedRect(13,69,184,39,4,4);
 doc.setFont('helvetica','bold');doc.setFontSize(8.5);doc.setTextColor(54,42,55);
 doc.text('Mr/Mrs/Org:',17,76);doc.setFont('helvetica','normal');doc.text(clean(client).slice(0,85),42,76,{maxWidth:148});
 if(clientAddress){doc.setFontSize(7.5);doc.text(clean(clientAddress).slice(0,105),17,82,{maxWidth:176});}
 doc.setFont('helvetica','bold');doc.setFontSize(8);doc.text('Invoice Date:',17,88);doc.setFont('helvetica','normal');doc.text(clean(invoiceDate),43,88);
 doc.setFont('helvetica','bold');doc.text('Goods / Service Dates:',86,88);doc.setFont('helvetica','normal');doc.text(clean(deliveryDates).slice(0,32)||'-',127,88);
 doc.setFont('helvetica','bold');doc.text('P.O. Number:',17,96);doc.setFont('helvetica','normal');doc.text(clean(purchaseOrder)||'-',43,96);
 doc.setFont('helvetica','bold');doc.text('Delivery Note:',86,96);doc.setFont('helvetica','normal');doc.text(clean(deliveryNote)||'-',117,96);
 if(clientPin){doc.setFont('helvetica','bold');doc.setFontSize(7.2);doc.text('Customer PIN: '+clean(clientPin),17,103);}
 y=113;tableHeader();
 for(const row of rows){
  const description=doc.splitTextToSize(clean(row.description),74);
  const height=Math.max(9,description.length*4.2+3);
  if(y+height>252){addPage();tableHeader();}
  doc.setDrawColor(184,168,189);doc.setLineWidth(.18);doc.rect(14,y,182,height);
  for(const x of [32,108,139,159])doc.line(x,y,x,y+height);
  doc.setTextColor(42,40,45);doc.setFont('helvetica','normal');doc.setFontSize(8);
  doc.text(clean(row.quantity??1),23,y+5,{align:'center'});
  doc.text(description,35,y+5);doc.text(money(row.unitPrice),136,y+5,{align:'right'});
  doc.text(clean(row.days??''),149,y+5,{align:'center'});doc.text(money(row.amount),193,y+5,{align:'right'});
  y+=height;
 }
 // Financial values come from saved invoice data; no automatic VAT assumption.
 const sub=Number(subtotal??rows.reduce((n,r)=>n+Number(r.amount||0),0));
 const vat=Number(vatAmount)||0;
 ensure(35);y+=4;
 for(const [label,value,highlight] of [['SUB-TOTAL KSh',sub,false],[vat?'VAT KSh':'VAT (NOT APPLIED)',vat,false],['TOTAL KSh',sub+vat,true]]){
  doc.setFillColor(...(highlight?yellow:[247,242,248]));doc.rect(108,y,88,9,'F');doc.setDrawColor(152,130,166);doc.rect(108,y,88,9);
  doc.setFont('helvetica','bold');doc.setFontSize(8.8);doc.setTextColor(...purple);doc.text(label,111,y+6);doc.text(money(value),193,y+6,{align:'right'});y+=9;
 }
 y+=7;
 block('INVOICE TERMS & CONDITIONS',terms);
 block('APPROVED PAYMENT METHODS',paymentDetails);
 ensure(20);doc.setFont('helvetica','normal');doc.setFontSize(8);doc.setTextColor(80,70,80);
 doc.text('Prepared by: _________________________',15,y+4);
 doc.text('Authorized Signature / Stamp: __________________________',91,y+4);y+=14;
 footer();doc.save(filename);
 return doc;
}
