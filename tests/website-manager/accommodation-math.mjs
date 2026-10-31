import test from 'node:test';
import assert from 'node:assert/strict';
import {accommodationNights,accommodationTotals} from '../../src/accommodationMath.js';

test('counts calendar nights including month boundaries',()=>{
 assert.equal(accommodationNights('2026-10-30','2026-11-02'),3);
 assert.equal(accommodationNights('2026-10-30','2026-10-30'),0);
 assert.equal(accommodationNights('2026-11-02','2026-10-30'),0);
});
test('partial payments accumulate against the booked room rate',()=>{
 assert.deepEqual(accommodationTotals('2026-10-30','2026-11-02',3500,[{amount_kes:4000},{amount_kes:1500}]),{nights:3,total:10500,paid:5500,balance:5000});
});
