import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');

test('accommodation invoice and complimentary workflows require server authorization',()=>{
 const sql=read('../../supabase/migrations/20261101001000_accommodation_clearance_and_invoicing.sql');
 assert.match(sql,/hotel_accommodation_assert_stay_scope\(p_stay\)/);
 assert.match(sql,/hotel_accommodation_can_manage_all\(\)/);
 assert.match(sql,/requested_by=auth\.uid\(\)/);
 assert.match(sql,/status<>'checked_out'/);
 assert.match(sql,/unique references public\.hotel_accommodation_stays\(id\)/);
 assert.match(sql,/Use the approval or invoice workflow/);
 assert.match(sql,/p\.method<>'complimentary'/);
});

test('registration form and organization invoice are downloadable PDFs',()=>{
 const documents=read('../../src/accommodationDocuments.js');
 const view=read('../../src/AccommodationWorkspace.jsx');
 assert.match(documents,/GUEST REGISTRATION FORM/);
 assert.match(documents,/Guest Signature/);
 assert.match(documents,/Receptionist Signature/);
 assert.match(documents,/ACCOMMODATION INVOICE/);
 assert.match(view,/Download Guest Registration PDF/);
 assert.match(view,/Download Blank Form/);
});
