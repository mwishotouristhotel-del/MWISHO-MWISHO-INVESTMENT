import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const root=new URL('../../',import.meta.url);
const source=readFileSync(new URL('supabase/functions/hotel-accommodation-receipts/index.ts',root),'utf8');
const migration=readFileSync(new URL('supabase/migrations/20261103180000_accommodation_secure_receipts.sql',root),'utf8');
const ui=readFileSync(new URL('src/AccommodationReceiptActions.jsx',root),'utf8');

test('receipt snapshots and tokens are inaccessible through anonymous or ordinary authenticated table access',()=>{
 assert.match(migration,/enable row level security/);
 assert.match(migration,/revoke all on public\.hotel_accommodation_receipts from public,anon,authenticated/);
 assert.match(migration,/token_hash text not null unique/);
 assert.match(migration,/revoked_at timestamptz/);
});

test('public receipt download is token-gated, time-limited and revocable',()=>{
 assert.match(source,/crypto\.getRandomValues\(new Uint8Array\(32\)\)/);
 assert.match(source,/crypto\.subtle\.digest\('SHA-256'/);
 assert.match(source,/30\*86400000/);
 assert.match(source,/\.is\('revoked_at',null\)\.gt\('expires_at'/);
 assert.match(source,/cache-control':'private, no-store'/);
 assert.match(source,/auth\.getUser\(jwt\)/);
 assert.match(source,/hotel_accommodation_can_reception/);
});

test('receipt uses the supplied eTIMS URL as a QR, never treats unpaid invoices as paid',()=>{
 assert.match(source,/QRCode\.toDataURL\(row\.etims_url/);
 assert.match(source,/stay\.invoice_organization_name\?'INVOICE PENDING'/);
 assert.match(source,/PAYMENT \/ APPROVAL PENDING/);
 assert.match(source,/stay\.status!=='checked_out'/);
 assert.match(source,/balance>0/);
});

test('customer messaging provides WhatsApp, SMS and email without claiming queued messages were sent',()=>{
 assert.match(ui,/Share via WhatsApp/);
 assert.match(ui,/Send SMS link/);
 assert.match(ui,/Send Email/);
 assert.match(ui,/queued for delivery; not yet confirmed sent/);
 assert.match(source,/hotel_notification_outbox/);
 assert.match(source,/hotel_accommodation_receipt_delivery/);
});
