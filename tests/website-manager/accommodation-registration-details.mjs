import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');

test('check-in sends registration fields to server instead of discarding them',()=>{
 const workspace=read('../../src/AccommodationWorkspace.jsx');
 assert.match(workspace,/p_guest:fields/);
 assert.doesNotMatch(workspace,/\.\.\.persistedFields/);
 assert.match(workspace,/Email \(optional\)/);
 assert.doesNotMatch(workspace,/\['guest_name','guest_id_number','guest_phone','nationality','country_of_residence','county_of_residence','email'\]/);
});

test('server persists registration details alongside stay and optional email',()=>{
 const migration=read('../../supabase/migrations/20261101013000_accommodation_registration_details.sql');
 for(const field of ['address','arrival_time','reason_for_visit','accessibility_request','remarks']){
  assert.match(migration,new RegExp(`add column if not exists ${field} `));
  assert.match(migration,new RegExp(`p_guest->>'${field}'`));
 }
 assert.match(migration,/nullif\(trim\(p_guest->>'email'\),''\)/);
 assert.match(migration,/hotel_accommodation_can_reception\(\)/);
});

test('registration PDF includes the booked package and reprintable form details',()=>{
 const pdf=read('../../src/accommodationDocuments.js');
 for(const field of ['arrival_time','address','reason_for_visit','accessibility_request','package_key'])assert.match(pdf,new RegExp(`guest\\.${field}`));
 assert.match(pdf,/BOOKED PACKAGE:/);
 assert.match(pdf,/Bed & Breakfast/);
 assert.match(pdf,/Full Board/);
});
