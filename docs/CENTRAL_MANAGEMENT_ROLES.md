# MWISHO MWISHO INVESTMENT — Organization-wide oversight roles

## Confirmed organization roles
The entire investment has central oversight by:
- **Director/Admin** — organization-level administration and oversight across all departments.
- **Manager** — organization-wide operational management across all departments.
- **Accounts** — consolidated finance, reconciliation and accounting oversight across departments.
- **Store Keeper** — organization-wide inventory oversight and authorized stock movements across departments.

These central roles are distinct from department roles (e.g. Hotel Manager, Liquor Manager, Hardware Manager). Central staff may also hold explicitly assigned departmental roles.

## Departments
- Hardware
- Hotel: Restaurant (2 counters), Bar (4 counters), Accommodation, Conference
- Liquor Store
- Dry Goods

## Proposed permission boundaries — owner confirmation required before activation
- Director/Admin: staff roles, business settings, full cross-department reports, privileged approvals and audit review.
- Central Manager: oversee all department operations, assign staff/counters, review exceptions and reports; cannot grant Director/Admin privileges.
- Accounts: view consolidated sales and payments, reconcile shifts and settlements, prepare financial reports; cannot silently modify completed sales or stock.
- Store Keeper: see cross-department stock balances, receive and transfer stock with documented source/destination and authorization; cannot record payments or change historical sales.
- Department roles are scoped to their department unless separately granted.
- Least privilege, RLS, auditable approvals and separation of duties are mandatory.
- Financial and inventory changes must use validated server-side operations, not direct client table writes.

## Current status
Specification only. No Supabase policies or staff accounts created yet. Verify MWISHO Supabase access before applying migrations.
