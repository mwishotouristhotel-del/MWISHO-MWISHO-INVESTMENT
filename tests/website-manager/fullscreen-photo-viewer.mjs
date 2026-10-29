import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const html=await readFile('hotel/index.html','utf8');
const scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
assert(scripts.length,'Customer page script should exist');
for(const code of scripts)new Function(code); // Validate all inline handlers parse.
const script=scripts.join('\n');
assert(script.includes('function openFullPhoto(src,title,photos=[src],initialIndex=0)'));
assert(script.includes("image.addEventListener('click',openSelected)"));
assert(script.includes("button.addEventListener('click',()=>{index=i;setPhoto();openSelected();})"));
assert(script.includes("if(event.key==='ArrowLeft')")&&script.includes("if(event.key==='ArrowRight')"));
assert(script.includes("openFullPhoto(src,title);"));
assert(script.includes("image.closest('button,a')"));
assert(html.includes('.gallery-lightbox img{')&&html.includes('object-fit:contain'));
console.log('PASS: room images, thumbnails and gallery open accessible full-size viewer');
