import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {accommodationCheckoutStatus} from '../../src/accommodationCheckoutStatus.js';

const stay={status:'checked_in',expected_check_out_date:'2026-11-01'};
test('checkout is due from 10:00 AM Nairobi time on the scheduled date',()=>{
 assert.equal(accommodationCheckoutStatus(stay,new Date('2026-11-01T06:59:00Z')),'in_house');
 assert.equal(accommodationCheckoutStatus(stay,new Date('2026-11-01T07:00:00Z')),'due');
 assert.equal(accommodationCheckoutStatus(stay,new Date('2026-11-02T01:00:00Z')),'overdue');
 assert.equal(accommodationCheckoutStatus({...stay,status:'checked_out'},new Date('2026-11-02T01:00:00Z')),'checked_out');
});

test('pending complimentary checkout is auditable and management-only to approve',()=>{
 const sql=readFileSync(new URL('../../supabase/migrations/20261101023000_accommodation_checkout_intents.sql',import.meta.url),'utf8');
 assert.match(sql,/hotel_accommodation_assert_stay_scope\(p_stay\)/);
 assert.match(sql,/stated_approver_name/);
 assert.match(sql,/stated_approver_designation/);
 assert.match(sql,/requested_by\)/);
 assert.match(sql,/v_request.requested_by=auth.uid\(\)/);
 assert.match(sql,/hotel_accommodation_can_manage_all\(\)/);
 assert.match(sql,/status not in \('checked_in','checked_out'\)/);
 assert.match(sql,/invoice_organization_name/);
 assert.match(sql,/hotel_accommodation_guard_invoice_organization/);
});

test('checkout choices use dedicated server-side flows',()=>{
 const workspace=readFileSync(new URL('../../src/AccommodationWorkspace.jsx',import.meta.url),'utf8');
 const card=readFileSync(new URL('../../src/AccommodationStayCard.jsx',import.meta.url),'utf8');
 assert.match(workspace,/hotel_accommodation_checkout_complimentary/);
 assert.match(workspace,/hotel_accommodation_checkout_invoice/);
 assert.match(card,/Complimentary approval/);
 assert.match(card,/Organization invoice/);
 assert.match(card,/Stated approving person's name/);
});
