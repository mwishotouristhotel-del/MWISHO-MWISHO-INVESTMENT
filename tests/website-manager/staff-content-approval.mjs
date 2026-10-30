import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sql=readFileSync(new URL('../../supabase/migrations/20261030_hotel_website_staff_approval_queue.sql',import.meta.url),'utf8');
const ui=readFileSync(new URL('../../src/WebsiteStaffTasks.jsx',import.meta.url),'utf8');
const portal=readFileSync(new URL('../../src/websiteTasksMain.jsx',import.meta.url),'utf8');
test('staff proposal tables have RLS and staff cannot update submitted proposals directly',()=>{
 assert.match(sql,/alter table public\.hotel_website_staff_permissions enable row level security/i);
 assert.match(sql,/alter table public\.hotel_website_staff_submissions enable row level security/i);
 assert.doesNotMatch(sql,/create policy \w+ on public\.hotel_website_staff_submissions for update/i);
 assert.match(sql,/staff_id=\(select auth\.uid\(\)\)/);
});
test('publication action can only follow approval and never mutates public website tables',()=>{
 assert.match(sql,/p_action='published' and v_status<>'approved'/);
 assert.match(sql,/not public\.hotel_website_is_admin\(\)/);
 assert.doesNotMatch(sql,/update public\.hotel_website_(gallery|content|promotions|settings)/i);
 assert.match(ui,/Approval itself does not publish/);
});
test('staff portal uses existing username and PIN login and requires active staff',()=>{
 assert.match(portal,/mwisho-username-login/);
 assert.match(portal,/my_pos_access/);
 assert.match(portal,/!access\.active/);
});
