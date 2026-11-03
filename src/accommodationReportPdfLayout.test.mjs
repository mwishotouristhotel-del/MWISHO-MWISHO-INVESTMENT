import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createServer} from 'vite';

const row={date:'2026-11-03',receptionist_on_duty:'Admin',occupied_room_nights:1,room_sales_kes:1000,cash_kes:3000,mpesa_kes:0,pdq_kes:0,other_kes:0,receipts_kes:3000,invoices_issued_kes:0,complimentary_kes:0,advance_remaining_kes:2000};
const guest={room_number:'R1',guest_name:'Example Guest',package_label:'Bed & Breakfast',guest_count:2,nights:3,received_kes:3000};
const payment={date:'2026-11-03',guest_name:'Example Guest',room_number:'R1',section:'regular',method:'cash',reference:'',amount_kes:3000};
const example={section:'regular',from:'2026-11-03',to:'2026-11-03',receptionist_on_duty:'Admin',generated_by:'Admin',generated_at:'2026-11-03T16:00:00Z',totals:{room_sales_kes:1000,occupied_room_nights:1,cash_kes:3000,mpesa_kes:0,pdq_kes:0,other_kes:0,receipts_kes:3000,invoices_issued_kes:0,complimentary_kes:0,advance_remaining_kes:2000},daily:[row],guests:[guest],paymentRows:[payment],invoiceRows:[]};

test('PDF compacts a short report to one page and expands for larger tables',async()=>{
 const vite=await createServer({server:{middlewareMode:true},appType:'custom',optimizeDeps:{noDiscovery:true}});
 try{
  const {downloadAccommodationReport}=await vite.ssrLoadModule('/src/accommodationReportExports.js');
  const short=await downloadAccommodationReport(example,'pdf-preview');
  assert.equal(short.getNumberOfPages(),1,'Short report should fit summary, tables and signatures on one A4 landscape page');
  assert.ok(short.internal.collections.addImage_images,'Official hotel logo must be embedded in the PDF');
  const long=await downloadAccommodationReport({...example,daily:Array.from({length:30},(_,i)=>({...row,date:`2026-11-${String(i+1).padStart(2,'0')}`})),guests:Array.from({length:160},(_,i)=>({...guest,room_number:`R${i+1}`})),paymentRows:Array.from({length:160},(_,i)=>({...payment,room_number:`R${i+1}`}))},'pdf-preview');
  assert.ok(long.getNumberOfPages()>1,'Long report should naturally continue onto additional pages');
  if(process.env.MWISHO_PDF_QA_DIR){
   fs.mkdirSync(process.env.MWISHO_PDF_QA_DIR,{recursive:true});
   for(const [kind,pdf] of [['short',short],['long',long]])fs.writeFileSync(`${process.env.MWISHO_PDF_QA_DIR}/${kind}.pdf`,Buffer.from(pdf.output('arraybuffer')));
  }
 }finally{await vite.close();}
});
