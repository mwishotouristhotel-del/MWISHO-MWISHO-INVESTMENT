# Hotel printer setup (not yet physically tested)

## What is implemented
- Waiter Restaurant/Bar menu cards, item preparation choice and free-text notes.
- One database transaction creates the order, kitchen/bar tickets and destination print jobs.
- Server-side printer device assignments, atomic job claim and acknowledgement.
- Windows Python ESC/POS RAW printer agent using the installed Windows printer name.

## Before testing
1. Create authorized MWISHO staff accounts and menu products. For example set a kitchen product's `preparation_options` to `["Dry Fry","Wet Fry","Stew","Boiled"]`. Prices come from the database, not this document.
2. Provision a **dedicated Supabase Auth user for each printer agent**, then insert its UUID in `public.hotel_print_devices.agent_user_id`. Do not share cashier credentials or use a service-role key.
3. Add a device record for each destination (counter/kitchen/bar), optionally limited to a counter. Set `windows_printer_name` to the exact name in Windows Settings > Printers.
4. Install Python and `pip install pywin32` on the Windows PC(s). Configure the five `MWISHO_*` environment variables listed at the top of `printing/windows_agent.py`. Protect these credentials and use dedicated low-privilege accounts.
5. Start `python printing/windows_agent.py` on each PC. Agents only poll their own device ID.
6. Verify receipt formatting, paper width, cutter commands and USB/network printer drivers on the physical hardware.

## Important safeguards and limitations
- Printing is **not automatic until an agent is installed and running**.
- 'Printed' currently means the Windows spooler accepted the job, not that paper was physically produced.
- The agent is a reference implementation, not a signed installer or Windows service.
- A failed job is marked failed; manager-controlled retry UI is not implemented yet. Expired 'printing' leases can be reclaimed up to five attempts.
- A crash after printing but before acknowledgement can result in a duplicate paper ticket. Match order numbers and audit reprints.
- Hardware compatibility, Windows service installation, printer discovery, automated tests and deployment are still pending.
- Never put a Supabase service-role key in a browser or Windows print agent.
- LEOGO resources must not be modified.
