import assert from 'node:assert/strict';
import {roomPackageNightlyRate,accommodationTotals} from '../../src/accommodationMath.js';

const listing={max_guests:3,package_rates:{
 bed_only:{base_rate_kes:2500,extra_guest_kes:500},
 bed_breakfast:{base_rate_kes:3500,extra_guest_kes:750},
 half_board:{base_rate_kes:4500,extra_guest_kes:1000},
 full_board:{base_rate_kes:6000,extra_guest_kes:1500}
}};
assert.equal(roomPackageNightlyRate(listing,'bed_only',1),2500);
assert.equal(roomPackageNightlyRate(listing,'bed_breakfast',2),4250);
assert.equal(roomPackageNightlyRate(listing,'half_board',3),6500);
assert.equal(roomPackageNightlyRate(listing,'full_board',2),7500);
assert.equal(roomPackageNightlyRate(listing,'not_configured',1),null);
assert.equal(roomPackageNightlyRate(listing,'bed_only',4),null);
assert.equal(roomPackageNightlyRate(listing,'bed_only',0),null);
assert.deepEqual(accommodationTotals('2026-10-31','2026-11-02',7500,[{amount_kes:3000}]),{nights:2,total:15000,paid:3000,balance:12000});
