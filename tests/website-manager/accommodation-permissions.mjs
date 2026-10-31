import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const sql=readFileSync(new URL('../../supabase/migrations/20261030210000_hotel_accommodation_reception.sql',import.meta.url),'utf8');
const ui=readFileSync(new URL('../../src/AccommodationWorkspace.jsx',import.meta.url),'utf8');

test('guest identity records are restricted to reception, not public or housekeeping',()=>{
 assert.match(sql,/alter table public\.hotel_accommodation_stays enable row level security/i);
 assert.match(sql,/create policy hotel_stays_reception_read[^;]*hotel_accommodation_can_reception/s);
 assert.doesNotMatch(sql,/grant\s+(?:select,)?insert\s+on\s+public\.hotel_accommodation_stays\s+to authenticated/i);
 assert.doesNotMatch(sql,/grant\s+update\s*\([^)]*\)\s+on\s+public\.hotel_accommodation_stays\s+to authenticated/i);
});
test('payments and checkout use server-authorized atomic operations',()=>{
 assert.match(sql,/create or replace function public\.hotel_accommodation_checkin/s);
 assert.match(sql,/create or replace function public\.hotel_accommodation_record_payment/s);
 assert.match(sql,/v_paid\+p_amount>v_stay\.total_kes/);
 assert.match(sql,/hotel_accommodation_guard_housekeeping/);
 assert.match(ui,/rpc\('hotel_accommodation_checkin'/);
 assert.match(ui,/rpc\('hotel_accommodation_record_payment'/);
 assert.match(ui,/rpc\('hotel_accommodation_checkout'/);
});
