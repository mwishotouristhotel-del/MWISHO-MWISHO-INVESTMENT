# MWISHO POS — Departments, counters and cashier assignment

## Confirmed requirements
- Separate stock ledgers for Hardware, Hotel, Liquor and Dry Goods.
- Hotel has four bar counters (Bar 1–4) and two restaurant counters (Restaurant 1–2), each with independent stock, sales and cashier reporting.
- Accommodation and Conference remain hotel services with booking/billing workflows.
- An authorized manager can assign or reassign a cashier to different counters at any time.
- Multiple cashiers may work simultaneously at the same counter, with separate cashier shifts, transactions, cash drawers/float records and reconciliation.

## Data model (planned)
- departments(id, name)
- counters(id, department_id, name, type, active)
- inventory_locations(id, department_id, counter_id nullable, name)
- products(id, department_id, sku, name, unit, active)
- stock_movements(id, product_id, from_location_id, to_location_id, quantity, reason, actor_id, created_at)
- cashier_assignments(id, cashier_id, counter_id, assigned_by, starts_at, ends_at)
- cashier_shifts(id, assignment_id, opening_float, closing_cash, status, opened_at, closed_at)
- sales(id, department_id, counter_id, cashier_id, shift_id, total, status, created_at)
- sale_items(id, sale_id, product_id, quantity, unit_price, total)
- payments(id, sale_id, method, amount, reference, created_at)

## Integrity rules
- Sales use server-verified active cashier assignments and open shifts; never trust client-provided counter identity.
- Cashier assignments are many-to-many over time; no uniqueness restriction on active counter_id. Prevent overlapping active shifts for the *same cashier* unless explicitly authorized.
- A counter change closes or hands over that cashier's previous shift according to manager policy, retaining its history and not affecting other cashiers at the counter.
- Every sale and payment references the individual cashier shift, not merely the counter. Cash reconciliation is per cashier shift; counter totals are aggregates across cashiers.
- No stock movement occurs merely because a cashier changes counter.
- Stock movements are atomic, audited and cannot silently make balances negative.
- Separate counter stock requires explicit authorized transfers and receipts.
- RLS must restrict cashiers to assigned counters; admins have consolidated reporting.
- Financial transactions and inventory deductions must commit atomically; refunds are audited reversals.

## Pending implementation
Supabase MWISHO project authorization is required before applying and testing migrations. Concurrent cashier access is confirmed. Shift handover policy and physical drawer handling require implementation/testing before activating checkout.
