import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const page=readFileSync(new URL('../../hotel/index.html',import.meta.url),'utf8');
for(const id of ['rooms','dining','promotions','ticket-tracking','gallery','testimonials','contact']){
 assert(page.includes('id="'+id+'"'),`Destination ${id} exists`);
}
for(const target of ['regular','vvip','food','conference','quotation','promotions','ticket-tracking','gallery','testimonials','write-review','contact']){
 assert(page.includes("'"+target+"'"),`Mobile shortcut ${target} exists`);
}
assert(page.includes("nav.append(guestShortcuts)"));
assert(page.includes("nav.classList.remove('open')"));
assert(page.includes("toggle.setAttribute('aria-expanded','false')"));
assert(page.includes("document.getElementById('mwOpenConferenceQuote')?.click()"));
assert(page.includes("#navlinks.open{max-height:"));
console.log('PASS: customer mobile shortcuts target existing website functions and close menu.');
