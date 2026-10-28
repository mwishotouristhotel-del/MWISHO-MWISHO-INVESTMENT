import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';

const html=await readFile('hotel/index.html','utf8');
const admin=await readFile('src/WebsiteManager.jsx','utf8');
assert(admin.includes("'about-hotel'"),'About section appears in admin card catalog');
assert(html.includes("const aboutCard=map.get('about-hotel')"),'public mapping uses About record');
const dom=new JSDOM(html);
const image=dom.window.document.getElementById('mw-about-hotel-photo');
assert(image,'About image has unique and selectable element');
assert(image.getAttribute('src').includes('photo-placeholder'),'placeholder only until an Admin image is uploaded');
assert(dom.window.document.querySelector('#about .float-note strong'),'existing overlay preserved');
console.log('PASS: About photo is individually addressable, public card mapping exists, Admin card is listed');
