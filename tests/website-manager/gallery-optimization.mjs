import assert from 'node:assert/strict';
import {prepareGalleryUpload,MAX_GALLERY_DIMENSION} from '../../src/galleryUpload.js';

const original=new File([new Uint8Array(3*1024*1024)],'large-hotel-photo.jpg',{type:'image/jpeg'});
const jpegBytes=new Uint8Array(340*1024);
let bitmapWasClosed=false;
globalThis.createImageBitmap=async()=>({width:4000,height:3000,close:()=>{bitmapWasClosed=true;}});
globalThis.document={createElement:()=>({
 width:0,height:0,
 getContext:()=>({drawImage:()=>{}}),
 toBlob:(callback,type)=>callback(new Blob([jpegBytes],{type}))
})};
const faster=await prepareGalleryUpload(original,{optimize:true});
assert.equal(faster.optimized,true);
assert.equal(faster.file.type,'image/jpeg');
assert(faster.file.size<original.size);
assert.equal(faster.file.name,'large-hotel-photo.jpg');
assert(bitmapWasClosed,'bitmap resources released');

const preserved=await prepareGalleryUpload(original,{optimize:false});
assert.equal(preserved.file,original);
assert.equal(preserved.optimized,false);

const png=new File([new Uint8Array(4*1024*1024)],'image.png',{type:'image/png'});
const optimizedPng=await prepareGalleryUpload(png);
assert.equal(optimizedPng.file.type,'image/webp');
assert(optimizedPng.file.name.endsWith('.webp'));

const video=new File([new Uint8Array(2*1024*1024)],'video.mp4',{type:'video/mp4'});
const unchangedVideo=await prepareGalleryUpload(video);
assert.equal(unchangedVideo.file,video);
assert.equal(MAX_GALLERY_DIMENSION,1920);

console.log('PASS: compressed photos smaller, optional original retained, PNG MIME updated, videos untouched');
