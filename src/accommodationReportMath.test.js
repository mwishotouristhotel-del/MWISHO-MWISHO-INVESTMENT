import test from 'node:test';
import assert from 'node:assert/strict';
import {buildAccommodationReport,nightSales} from './accommodationReportMath.js';

const stay={id:'a',guest_name:'Guest',room_number:'V1',section:'vvip',check_in_date:'2026-11-03',expected_check_out_date:'2026-11-06',total_kes:3000};
test('three paid nights earn one night at a time and unwind the advance',()=>{
 const report=buildAccommodationReport({stays:[stay],payments:[{stay_id:'a',method:'cash',amount_kes:3000,received_at:'2026-11-03T08:00:00Z'}],invoices:[]},{from:'2026-11-03',to:'2026-11-05',today:'2026-11-03'});
 assert.deepEqual(report.daily.map(x=>x.room_sales_kes),[1000,1000,1000]);
 assert.deepEqual(report.daily.map(x=>x.advance_remaining_kes),[2000,1000,0]);
 assert.deepEqual(report.daily.map(x=>x.cash_kes),[3000,0,0]);
 assert.equal(report.guests[0].nights,3);
});
test('M-Pesa, PDQ, invoices and complimentary stay distinct from cash',()=>{
 const report=buildAccommodationReport({stays:[stay],payments:[
  {stay_id:'a',method:'mpesa',amount_kes:500,received_at:'2026-11-03T08:00:00Z'},
  {stay_id:'a',method:'card',amount_kes:800,received_at:'2026-11-03T08:00:00Z'},
  {stay_id:'a',method:'complimentary',amount_kes:700,received_at:'2026-11-03T08:00:00Z'}],
  invoices:[{stay_id:'a',invoice_date:'2026-11-03',amount_kes:1000,invoice_number:'INV-1'}]},
  {from:'2026-11-03',to:'2026-11-03'});
 assert.equal(report.totals.receipts_kes,1300);
 assert.equal(report.totals.complimentary_kes,700);
 assert.equal(report.totals.invoices_issued_kes,1000);
 assert.equal(report.totals.cash_kes,0);
});
test('nightly cents reconcile exactly with total booking',()=>{
 const booking={...stay,total_kes:100.01};
 assert.equal(Number(['2026-11-03','2026-11-04','2026-11-05'].reduce((sum,date)=>sum+nightSales(booking,date),0).toFixed(2)),100.01);
});
