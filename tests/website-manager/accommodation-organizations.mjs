import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const migration=read('../../supabase/migrations/20261103090000_accommodation_organizations.sql');
const workspace=read('../../src/AccommodationWorkspace.jsx');
const billing=read('../../src/AccommodationBilling.jsx');

test('saved organization directory is normalized and receptionist-only',()=>{
 assert.match(migration,/create unique index if not exists hotel_accommodation_organization_name_key/);
 assert.match(migration,/lower\(btrim\(name\)\)/);
 assert.match(migration,/enable row level security/);
 assert.match(migration,/hotel_accommodation_can_reception\(\)/);
 assert.match(migration,/revoke all on public.hotel_accommodation_organizations from public,anon,authenticated/);
 assert.match(migration,/hotel_accommodation_register_organization/);
});

test('organization guest is linked to an existing organization without changing original check-in pricing and access logic',()=>{
 assert.match(migration,/guest_type='walk_in' and organization_id is null/);
 assert.match(migration,/guest_type='organization' and organization_id is not null/);
 assert.match(migration,/hotel_accommodation_checkin_package\(/);
 assert.match(migration,/update public.hotel_accommodation_stays\s+set guest_type=v_type,organization_id=v_org/);
 assert.match(migration,/Organization is not registered/);
 assert.match(workspace,/hotel_accommodation_checkin_grouped/);
 assert.match(workspace,/guest_type:'organization'/);
 assert.match(workspace,/organization_id:current.organization_id/);
});

test('check-in can search/add organizations and invoice can select room group',()=>{
 assert.match(workspace,/Walk-in Guest/);
 assert.match(workspace,/Organization Guest/);
 assert.match(workspace,/Search saved organizations/);
 assert.match(workspace,/Save & Select/);
 assert.match(workspace,/\.ilike\('name'/);
 assert.match(billing,/organizationNameForStay/);
 assert.match(billing,/Select all eligible rooms for/);
 assert.match(migration,/hotel_accommodation_guard_invoice_organization/);
});
