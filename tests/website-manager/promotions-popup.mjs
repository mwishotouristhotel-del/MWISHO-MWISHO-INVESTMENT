import assert from 'node:assert/strict';
import {readFile,writeFile,unlink} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {join} from 'node:path';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';

const output='./.website-promotions-smoke.mjs';
await build({entryPoints:['src/WebsitePromotionsManager.jsx'],bundle:true,platform:'node',format:'esm',outfile:output,external:['react','react-dom'],loader:{'.css':'empty'},logLevel:'silent'});
try{
 const {default:Manager}=await import(pathToFileURL(join(process.cwd(),output)).href);
 const html=renderToStaticMarkup(React.createElement(Manager,{supabase:{from:()=>{throw new Error('Do not access network while server-rendering');}}}));
 assert(html.includes('Upcoming Events'));
 assert(html.includes('Activate popup'));
 assert(html.includes('Upcoming Hotel Events'));
 assert(html.includes('Advertisement'));
}finally{await unlink(output).catch(()=>{});}

const page=await readFile('hotel/index.html','utf8');
const responsePromos=mode=>[
 {id:'promo-test',kind:'event',title:'Friday Live Music',description:'At MWISHO',media_type:'image',
  media_url:'https://example.org/poster.jpg',action_label:'Discover',action_url:'https://example.org/',
  popup_enabled:true,popup_mode:mode,display_order:0}
];
async function browserScenario(mode){
 const dom=new JSDOM(page,{url:'https://mwishotouristhotel-del.github.io/MWISHO-MWISHO-INVESTMENT/hotel/',runScripts:'outside-only',pretendToBeVisual:true});
 const {window}=dom;
 const script=[...window.document.querySelectorAll('script')].find(x=>x.textContent.includes('MWISHO website: isolated public content'));
 assert(script,'public website dynamic script exists');
 new Function(script.textContent);
 window.fetch=async(url,options)=>({ok:true,json:async()=>({cards:[],gallery:[],settings:{},promotions:responsePromos(mode)})});
 const timers=new Map();let timerId=0;
 window.setInterval=(callback)=>{timers.set(++timerId,callback);return timerId;};
 window.clearInterval=id=>timers.delete(id);
 window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
 window.HTMLDialogElement.prototype.close=function(){this.open=false;};
 window.eval(script.textContent);
 for(let i=0;i<12;i++)await Promise.resolve();
 const card=window.document.querySelector('#mw-promotion-grid .mw-promotion-card');
 assert(card,'event visible in public site');
 assert(card.textContent.includes('Friday Live Music'));
 const popup=window.document.querySelector('.mw-promotion-popup');
 assert(popup&&popup.open,'popup opened for published event');
 if(mode==='five_seconds'){
  assert(popup.textContent.includes('15 seconds'),'15 second countdown visible');
  for(let n=0;n<15;n++)for(const fn of [...timers.values()])fn();
  assert(!window.document.querySelector('.mw-promotion-popup'),'countdown auto-dismisses popup');
 }else{
  assert(!popup.textContent.includes('Closes automatically'),'manual popup has no countdown');
  assert.equal(timers.size,0,'manual popup has no timer');
  window.document.querySelector('.mw-promotion-popup-close').click();
  assert(!window.document.querySelector('.mw-promotion-popup'),'manual popup can be closed');
 }
 dom.window.close();
}
await browserScenario('five_seconds');
await browserScenario('manual');
console.log('PASS: Admin renders both modes; public event cards display; countdown and manual popups dismiss correctly');
