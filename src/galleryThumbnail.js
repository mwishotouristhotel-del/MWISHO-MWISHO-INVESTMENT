/** Build a small WebP preview independently of the original hotel photograph. */
export async function createGalleryThumbnail(file){
 if(!file||!file.type.startsWith('image/'))return null;
 if(typeof createImageBitmap!=='function'||typeof document==='undefined')return null;
 let bitmap;
 try {
  bitmap=await createImageBitmap(file);
  const scale=Math.min(1,700/Math.max(bitmap.width,bitmap.height));
  const canvas=document.createElement('canvas');
  canvas.width=Math.max(1,Math.round(bitmap.width*scale));
  canvas.height=Math.max(1,Math.round(bitmap.height*scale));
  const ctx=canvas.getContext('2d');
  if(!ctx)return null;
  ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',0.68));
  if(!blob||blob.type!=='image/webp')return null;
  return blob;
 }catch{return null}
 finally{bitmap?.close?.()}
}
