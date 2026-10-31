import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const sql=readFileSync(new URL('../../supabase/migrations/20261031210000_accommodation_reception_separation.sql',import.meta.url),'utf8');
const ui=readFileSync(new URL('../../src/AccommodationWorkspace.jsx',import.meta.url),'utf8');
const adminUi=readFileSync(new URL('../../src/main.jsx',import.meta.url),'utf8');

test('receptionists require exactly one named reception assignment',()=>{
 assert.match(sql,/count\(\*\)=1/);
 assert.match(sql,/VVIP Reception/);
 assert.match(sql,/Regular Reception/);
 assert.match(sql,/hotel_reception_staff_area_guard/);
 assert.match(sql,/Reception is not assigned to this accommodation section/);
 assert.match(adminUi,/staffInvite\.role!=='receptionist'/);
 assert.match(adminUi,/v\.role==='receptionist'\?\[area\.id\]/);
});
test('guest, room, and payment records cannot cross reception categories',()=>{
 assert.match(sql,/hotel_reception_stay_insert_guard/);
 assert.match(sql,/hotel_reception_stay_checkout_guard/);
 assert.match(sql,/hotel_reception_payment_insert_guard/);
 assert.match(sql,/category=\(select public\.hotel_accommodation_reception_section\(\)\)/);
 assert.match(sql,/hotel_payments_reception_read/);
});
test('sales reports are scoped on server, not just filtered in UI',()=>{
 assert.match(sql,/create or replace function public\.hotel_accommodation_section_sales/);
 assert.match(sql,/r\.category=public\.hotel_accommodation_reception_section\(\)/);
 assert.match(ui,/rpc\('hotel_accommodation_section_sales'/);
 assert.match(ui,/Accommodation Sales by Reception/);
});
