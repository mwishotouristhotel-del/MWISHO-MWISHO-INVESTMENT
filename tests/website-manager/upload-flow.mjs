import {build} from 'esbuild';
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {JSDOM} from 'jsdom';
import {writeFile,readFile,unlink} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {join} from 'node:path';
import assert from 'node:assert/strict';

const env=new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>',{url:'https://localhost/'});
globalThis.window=env.window;globalThis.document=env.window.document;
globalThis.navigator=env.window.navigator;globalThis.HTMLElement=env.window.HTMLElement;
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
globalThis.crypto=globalThis.crypto??{randomUUID:()=>String(Date.now())};
const dest='.website-manager-upload-test.mjs';
await build({entryPoints:['src/WebsiteManager.jsx'],bundle:true,platform:'node',format:'esm',outfile:dest,external:['react','react-dom'],loader:{'.css':'empty'},logLevel:'silent'});
const {default:WebsiteManager}=await import(pathToFileURL(join(process.cwd(),dest)).href);
const rows=[
 {slug:'hero',title:'Taste Of Class',subtitle:'Welcome',description:'Hotel',image_url:'',enabled:true,placement:'hero',display_order:0},
 {slug:'restaurant',title:'Enjoy every bite',subtitle:'Dining',description:'Food',image_url:'',enabled:true,placement:'dining',display_order:40},
 {slug:'vvip-rooms',title:'VVIP Rooms',subtitle:'Rooms',description:'Luxury',image_url:'https://example.com/previous.jpg',enabled:true,placement:'rooms',display_order:20},
];
const state={rows:rows.map(x=>({...x})),uploads:[],updates:[],failUpload:false};
function queryFor(name){
 return {
  select(){
   return {
    order:async()=>({data:name==='hotel_website_content'?state.rows.map(x=>({...x})):[],error:null}),
    gte(){return {order:async()=>({data:[],error:null})}}
   };
  },
  update(fields){return {eq(col,value){return {select(){return {single:async()=>{
   state.updates.push({slug:value,fields});
   let row=state.rows.find(r=>r.slug===value);
   if(!row)return {data:null,error:{message:'Card not found'}};
   Object.assign(row,fields);
   return {data:{slug:value,image_url:row.image_url},error:null};
  }}}}}};}
 };
}
const supabase={
 from:queryFor,
 storage:{from:()=>({
  async upload(name,file){state.uploads.push({name,file});return {error:state.failUpload?{message:'simulated storage failure'}:null};},
  getPublicUrl(name){return {data:{publicUrl:'https://cdn.example.com/'+name}}}
 })}
};
const root=createRoot(document.getElementById('root'));
const flush=async()=>{await act(async()=>{await new Promise(resolve=>setTimeout(resolve,0));});};
try{
 await act(async()=>{root.render(React.createElement(WebsiteManager,{supabase}));});
 await flush();
 async function chooseCard(title){const b=[...document.querySelectorAll('.mw-web-list button')].find(b=>b.textContent.includes(title));assert(b,'card '+title+' is selectable');await act(async()=>{b.click();});}
 async function uploadCard(slug,name){
   const input=document.querySelector('input[type=file]');
   assert(input,'file input displayed');
   const file=new env.window.File(['sample-bytes'],name,{type:'image/jpeg'});
   Object.defineProperty(input,'files',{configurable:true,value:[file]});
   await act(async()=>{input.dispatchEvent(new env.window.Event('change',{bubbles:true}));});
   await flush();
   assert(state.rows.find(r=>r.slug===slug).image_url.includes(slug+'-'),'public URL persisted to '+slug);
   assert(document.querySelector('.mw-web-preview img')?.getAttribute('src')?.includes(slug+'-'),'preview updates to '+slug);
   assert(!document.querySelector('.mw-web-image-failure'),'no upload error on success');
 }
 await uploadCard('hero','cover.jpg');
 await chooseCard('Enjoy every bite');
 await uploadCard('restaurant','restaurant.jpg');
 await chooseCard('VVIP Rooms');
 await uploadCard('vvip-rooms','vvip-new.jpg');
 assert.equal(state.uploads.length,3);
 assert.equal(state.updates.length,3);
 state.failUpload=true;
 await chooseCard('Taste Of Class');
 const previous=state.rows.find(r=>r.slug==='hero').image_url;
 const input=document.querySelector('input[type=file]');
 Object.defineProperty(input,'files',{configurable:true,value:[new env.window.File(['data'],'error.jpg',{type:'image/jpeg'})]});
 await act(async()=>{input.dispatchEvent(new env.window.Event('change',{bubbles:true}));});await flush();
 assert.equal(state.rows.find(r=>r.slug==='hero').image_url,previous,'failed upload never replaces saved cover');
 assert(document.querySelector('.mw-web-image-failure')?.textContent.includes('simulated storage failure'),'failure displayed alongside picker');
 console.log('PASS: hero, restaurant, VVIP uploads save correct URL; preview updates; failures do not corrupt prior image');
}finally{
 await act(async()=>root.unmount());await unlink(dest).catch(()=>{});env.window.close();
}
