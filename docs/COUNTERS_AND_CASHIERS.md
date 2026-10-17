# MWISHO POS — Departments, counters and cashier assignment

## Confirmed requirements
- Separate stock ledgers for Hardware, Hotel, Liquor and Dry Goods.
- Hotel has four bar counters (Bar 1–4) and two restaurant counters (Restaurant 1–2), each with independent stock, sales and cashier reporting.
- Accommodation and Conference remain hotel services with booking/billing workflows.
- An authorized manager can assign or reassign a cashier to different counters at any time.
- Exactly one active cashier is allowed per counter at a time. A cashier may be assigned to and operate multiple counters, including counters in different departments, subject to manager authorization.
- Examples: a hotel cashier can operate a Bar counter and a Restaurant counter; a liquor-store cashier can operate Liquor and Dry Goods counters.

## Data model (planned)
- departments(id, name)
- counters(id, department_id, name, type, active)
- inventory_locations(id, department_id, counter_id nullable, name)
- products(id, department_id, sku, name, unit, active)
- stock_movements(id, product_id, from_location_id, to_location_id, quantity, reason, actor_id, created_at)
- cashier_assignments(id, cashier_id, counter_id, assigned_by, starts_at, ends_at); enforce at most one active assignment per counter, but allow multiple active assignments for a cashier
- cashier_shifts(id, assignment_id, opening_float, closing_cash, status, opened_at, closed_at)
- sales(id, department_id, counter_id, cashier_id, shift_id, total, status, created_at)
- sale_items(id, sale_id, product_id, quantity, unit_price, total)
- payments(id, sale_id, method, amount, reference, created_at)

## Integrity rules
- Sales use server-verified active cashier assignments and open shifts; never trust client-provided counter identity.
- Enforce uniqueness of active counter assignment by counter_id (one cashier per counter). Do not impose uniqueness by cashier_id: a cashier can operate multiple counters concurrently.
- Manager reassignment must end the previous counter assignment before assigning a replacement cashier; preserve sales and shift history.
- Every sale and payment references the selected counter, department, cashier and shift. A cashier must explicitly select an assigned counter for each transaction; inventory and reporting follow that counter. Cash reconciliation is per counter and cashier shift, even if one cashier serves multiple counters.
- No stock movement occurs merely because a cashier changes counter.
- Stock movements are atomic, audited and cannot silently make balances negative.
- Separate counter stock requires explicit authorized transfers and receipts.
- RLS must restrict cashiers to assigned counters; admins have consolidated reporting.
- Financial transactions and inventory deductions must commit atomically; refunds are audited reversals.

## Pending implementation
Supabase MWISHO project authorization is required before applying and testing migrations. Confirmed: one cashier per counter at any given time; one cashier may serve multiple counters. Shift handover policy and physical drawer handling require implementation/testing before activating checkout.
