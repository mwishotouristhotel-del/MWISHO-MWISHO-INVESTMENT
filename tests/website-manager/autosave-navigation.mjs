import React,{act} from 'react';
import {build} from 'esbuild';
import {createRoot} from 'react-dom/client';
import {JSDOM} from 'jsdom';
import {unlink} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {join} from 'node:path';
import assert from 'node:assert/strict';
const dom=new JSDOM('<!doctype html><div id="root"></div>',{url:'https://example.test'});
globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.localStorage=dom.window.localStorage;
Object.defineProperty(globalThis,'navigator',{configurable:true,value:dom.window.navigator});
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const dest='.website-autosave-smoke.mjs';
await build({entryPoints:['src/WebsiteManager.jsx'],bundle:true,format:'esm',platform:'node',
 outfile:dest,external:['react','react-dom'],loader:{'.css':'empty'},logLevel:'silent'});
const {default:WebsiteManager}=await import(pathToFileURL(join(process.cwd(),dest)).href);
const row={slug:'hero',title:'Taste Of Class',subtitle:'Welcome',description:'Hotel',image_url:'https://example.org/cover.jpg',enabled:true,placement:'hero',display_order:0};
const updates=[];
const supabase={from(name){
 return {
  select(){
   if(name==='hotel_website_settings')return Promise.resolve({data:[{key:'tagline',value:'Taste Of Class'}],error:null});
   return {order:async()=>({data:name==='hotel_website_content'?[{...row}]:[],error:null}),
    gte(){return {order:async()=>({data:[],error:null})}}};
  },
  update(patch){return {eq(key,slug){return {select(){return {single:async()=>{
   updates.push({slug,patch});Object.assign(row,patch);
   return {data:{slug},error:null};
  }}}}}};},
  upsert:async()=>({error:null})
 };
}};
const root=createRoot(document.getElementById('root'));
const render=async()=>{await act(async()=>{root.render(React.createElement(WebsiteManager,{supabase,userId:'admin-test'}));});await act(async()=>{await new Promise(r=>setTimeout(r,10));});};
function setReactValue(input,newValue){
 const prototype=Object.getPrototypeOf(input);
 Object.getOwnPropertyDescriptor(prototype,'value').set.call(input,newValue);
 input.dispatchEvent(new dom.window.Event('input',{bubbles:true}));
 input.dispatchEvent(new dom.window.Event('change',{bubbles:true}));
}
try{
 await render();
 const heading=[...document.querySelectorAll('input')].find(x=>x.value==='Taste Of Class');
 assert(heading,'editable hotel card title renders');
 await act(async()=>setReactValue(heading,'Taste Of Class Updated'));
 assert.equal(document.querySelector('.mw-web-editor input')?.value,'Taste Of Class Updated');
 const local=JSON.parse(localStorage.getItem('mwisho-website-edit-admin-test-card-drafts'));
 assert.equal(local.hero.title,'Taste Of Class Updated','browser draft captured immediately');
 await act(async()=>{await new Promise(resolve=>setTimeout(resolve,1200));});
 assert.equal(row.title,'Taste Of Class Updated','debounced server save applied');
 const cardUpdate=updates.find(x=>x.patch.title==='Taste Of Class Updated');
 assert(cardUpdate,'card was auto-saved to backend');
 assert(!Object.hasOwn(cardUpdate.patch,'image_url'),'text auto-save does not overwrite uploaded images');
 const settingsTab=[...document.querySelectorAll('.mw-web-tabs button')].find(x=>x.textContent.includes('Website Settings'));
 await act(async()=>settingsTab.click());
 assert(JSON.parse(localStorage.getItem('mwisho-website-edit-admin-test-tab'))==='settings');
 await act(async()=>root.unmount());
 const nextRoot=createRoot(document.getElementById('root'));
 await act(async()=>nextRoot.render(React.createElement(WebsiteManager,{supabase,userId:'admin-test'})));
 await act(async()=>{await new Promise(r=>setTimeout(r,10));});
 assert(document.querySelector('.mw-web-settings'),'website tab restored after reopening');
 await act(async()=>nextRoot.unmount());
 console.log('PASS: local draft, delayed save, uploaded-image isolation and website tab restored');
}finally{await unlink(dest).catch(()=>{});dom.window.close();}
