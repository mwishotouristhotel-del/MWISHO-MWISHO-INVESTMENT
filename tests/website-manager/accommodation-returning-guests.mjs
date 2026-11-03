import test from 'node:test';
import assert from 'node:assert/strict';
import {prefillReturningGuest} from '../../src/accommodationGuestPrefill.js';

test('previous identity is editable and new stay-specific details remain unchanged',()=>{
 const current={guest_name:'',guest_phone:'',guest_type:'organization',organization_id:'new-org',room_id:'new-room',package_key:'full_board',arrival_time:'15:00',reason_for_visit:'New event',initial_payment:'3000'};
 const result=prefillReturningGuest(current,{guest_name:'Returning Guest',guest_phone:'0712345678',guest_type:'walk_in',room_id:'old-room',package_key:'bed_only',arrival_time:'09:00',initial_payment:'9999'});
 assert.equal(result.guest_name,'Returning Guest');
 assert.equal(result.guest_phone,'0712345678');
 for(const field of ['guest_type','organization_id','room_id','package_key','arrival_time','reason_for_visit','initial_payment']) assert.equal(result[field],current[field]);
 result.guest_phone='0700000000';
 assert.equal(result.guest_phone,'0700000000');
});
