# MWISHO POS — Department staff roles and permissions

## Hotel
- Manager: department oversight, reports, staff assignments and authorized approvals.
- Supervisor: shift supervision, exception escalation and operational oversight.
- Cashier: assigned-counter checkout, payments, receipts and cash-shift reconciliation.
- Head Waiter/Waitress: oversee restaurant/bar service and assigned waiters.
- Waiter/Waitress: capture and track guest orders; no payment confirmation or stock adjustments by default.

Hotel has four bar counters and two restaurant counters. Exactly one active cashier per counter; a cashier may be assigned multiple counters. Restaurant/bar order flow is proposed, pending owner confirmation.

## Liquor Store
- Manager: operations, staff, inventory and reports.
- Cashier: record sales and payment receipts.
- Confirmation & Handover Staff: independently verify order payment status and items, record handover with timestamp and actor.

## Hardware
- Manager: operations, inventory, reports and approvals.
- Supervisor: supervise order fulfillment and exceptions.
- Order-Taking Staff: create customer orders and line items.
- Confirmation & Releasing Staff: verify payment and goods, then record item release and recipient.

## Dry Goods
Staff roles and fulfillment workflow to be confirmed. Dry Goods remains an independent stock ledger even if a cashier also works in Liquor.

## Access-control design
- Authenticated staff identities, department-scoped memberships, role assignments, and counter assignments are separate records.
- Support multiple roles or department memberships only when explicitly granted by authorized management.
- Enforce one active cashier assignment per counter, but allow a cashier multiple active counters.
- Do not equate order creation with payment confirmation or goods release.
- All approvals, overrides, voids, refunds, stock movements and handovers must be auditable.
- Handover and release actions require verified payment or an explicit authorized exception; never rely solely on client flags.
- Authorization enforced server-side and via Supabase RLS; hiding buttons is insufficient.
- No schema applied until MWISHO Supabase access is verified.

## Proposed fulfillment statuses
DRAFT -> SUBMITTED -> AWAITING_PAYMENT -> PAID -> VERIFIED -> RELEASED / HANDED_OVER, with CANCELLED / REFUNDED controlled paths. Finalize exact status transitions and hotel kitchen/bar ticket routing before production.
