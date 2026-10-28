import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {pathToFileURL} from 'node:url';
import {unlink} from 'node:fs/promises';
const html=await readFile('hotel/index.html','utf8');
const backend=await readFile('supabase/functions/hotel-website-public/index.ts','utf8');
assert(html.includes('mwFoodMpesaCode')&&html.includes('Submit Payment for Verification'));
assert(html.includes("action:'submit_food_payment'"));
assert(html.includes('!foodOrderingEnabled||!foodCart.size'));
assert(backend.includes('submit_food_payment')&&backend.includes('pending_verification'));
assert(backend.includes('products.length!==distinctIds.length'));
assert(backend.includes('mpesa_till_number'));
assert(!backend.includes('insert({status:\'paid\''),'no automatic payment approval');
const dest='.food-payments-test.mjs';
await build({entryPoints:['src/WebsiteFoodPayments.jsx'],outfile:dest,bundle:true,
 platform:'node',format:'esm',external:['react','react-dom'],logLevel:'silent'});
try{
 const {default:Manager}=await import(pathToFileURL(process.cwd()+'/'+dest).href);
 const markup=renderToStaticMarkup(React.createElement(Manager,{supabase:{from:()=>{throw new Error('No DB calls during server render');}}}));
 assert(markup.includes('Pending M-Pesa Verification'));
 assert(markup.includes('Approved for Kitchen Handover'));
 assert(markup.includes('Official Buy Goods Till Number'));
}finally{await unlink(dest).catch(()=>{});}
console.log('PASS: verified-till gate, backend repricing, pending-only submissions and Admin review rendering');
