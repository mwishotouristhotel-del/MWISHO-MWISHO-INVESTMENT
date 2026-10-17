# POS development roadmap

1. Foundation: department navigation, secure environment configuration and role design.
2. Authentication: administrator, manager, cashier, storekeeper and hotel staff roles, with verified RLS.
3. Catalog: products, variants, units, prices, taxes and department-specific stock.
4. Sales: atomic server-side checkout, payment validation, receipts, refunds and cash shifts.
5. Hotel: restaurant/bar orders, room inventory and bookings, conference reservations and charges.
6. Reporting: department totals, payments, stock movements and audit trail.

**Safety:** No database migrations or real financial transactions until MWISHO Supabase authorization is confirmed. Never use LEOGO credentials or database endpoints.
