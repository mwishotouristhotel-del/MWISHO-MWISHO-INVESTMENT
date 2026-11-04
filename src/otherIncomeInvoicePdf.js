import {jsPDF} from 'jspdf';
import websiteLogoSvg from '../hotel/assets/mwisho-logo.svg?raw';

const logo=websiteLogoSvg.match(/href="(data:image\/png;base64,[^"]+)"/)?.[1];
const money=n=>Number(n||0).toLocaleString('en-KE',{minimumFractionDigits:2,maximumFractionDigits:2});
export function downloadOtherIncomeInvoice({invoice,items,terms='',accounts=[]}){
 const doc=new jsPDF({unit:'mm',format:'a4'});
 const header=(continued=false)=>{
  doc.setDrawColor(86,41,122);doc.setLineWidth(.7);doc.rect(10,10,190,277);
  doc.setFillColor(250,247,252);doc.rect(11,11,188,25,'F');
  doc.setFont('helvetica','bold');doc.setTextColor(86,41,122);doc.setFontSize(14);doc.text('MWISHO TOURIST HOTEL',17,20);
  doc.setFontSize(7.5);doc.text('BAR & RESTAURANTS : CONFERENCE : ACCOMMODATION',17,27);
  if(logo)doc.addImage(logo,'PNG',157,12,35,16);
  doc.setFillColor(86,41,122);doc.rect(11,37,188,1,'F');
  doc.setFontSize(12);doc.text('OTHER MWISHO INVESTMENT INVOICE'+(continued?' (CONTINUED)':''),15,47);
 };
 const foot=()=>{for(let p=1;p<=doc.getNumberOfPages();p++){doc.setPage(p);doc.setFont('helvetica','normal');doc.setFontSize(7);doc.setTextColor(86,41,122);doc.text('Email: mwishotouristhotel@gmail.com  |  Phone: 0745396385',105,273,{align:'center'});doc.text('P.O.BOX 35-40600  |  Siaya Town, Along Kisumu-Luanda-Siaya Road',105,278,{align:'center'});doc.text('Opposite Shell Petrol Station',105,283,{align:'center'});}};
 header();doc.setFontSize(9);doc.setTextColor(45,45,45);
 const info=[['Invoice Ref',invoice.invoice_number],['Category',invoice.category],['Bill To',invoice.bill_to],['Contact',invoice.contact],['Address',invoice.address],['KRA PIN',invoice.kra_pin],['Invoice Date',invoice.invoice_date],['Due Date',invoice.due_date],['Description',invoice.description]];
 let y=57;
 for(const [k,v] of info){if(!v)continue;doc.setFont('helvetica','bold');doc.text(k+':',15,y);doc.setFont('helvetica','normal');const lines=doc.splitTextToSize(String(v),136);doc.text(lines,56,y);y+=Math.max(6,lines.length*4.4);}
 y+=5;
 const newPage=()=>{doc.addPage();header(true);y=58;};
 if(y>236)newPage();
 doc.setFillColor(244,236,249);doc.rect(15,y-6,180,9,'F');doc.setFont('helvetica','bold');doc.setTextColor(86,41,122);doc.text('DESCRIPTION',18,y);doc.text('QTY',120,y,{align:'right'});doc.text('UNIT PRICE',154,y,{align:'right'});doc.text('AMOUNT',191,y,{align:'right'});y+=9;
 for(const item of items){const lines=doc.splitTextToSize(String(item.description),91);const height=Math.max(9,lines.length*4.5+4);if(y+height>258)newPage();doc.setFont('helvetica','normal');doc.setFontSize(8);doc.setTextColor(35,35,35);doc.text(lines,18,y);doc.text(String(item.quantity),120,y,{align:'right'});doc.text(money(item.unit_price_kes),154,y,{align:'right'});doc.text(money(item.amount_kes),191,y,{align:'right'});doc.setDrawColor(226,219,230);doc.line(15,y+height-4,195,y+height-4);y+=height;}
 if(y>246)newPage();doc.setFont('helvetica','bold');doc.setFontSize(11);doc.setTextColor(86,41,122);doc.text('TOTAL DUE: KSh '+money(invoice.total_kes),191,y+6,{align:'right'});y+=15;
 const block=(heading,value)=>{if(!String(value||'').trim())return;if(y>248)newPage();doc.setFont('helvetica','bold');doc.setFontSize(9);doc.setTextColor(86,41,122);doc.text(heading,15,y);y+=5;doc.setFont('helvetica','normal');doc.setFontSize(8);doc.setTextColor(45,45,45);for(const line of doc.splitTextToSize(String(value),177)){if(y>261)newPage();doc.text(line,15,y);y+=4.5;}y+=6;};
 block('INVOICE TERMS & CONDITIONS',terms);
 block('APPROVED PAYMENT ACCOUNTS',accounts.map(a=>a.label+' - '+a.details).join('\n\n'));
 foot();doc.save('MWISHO-Other-Income-Invoice-'+String(invoice.invoice_number).replace(/[^a-z0-9-]/gi,'-')+'.pdf');
}
