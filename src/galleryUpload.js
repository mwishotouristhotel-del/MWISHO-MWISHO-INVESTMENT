const IMAGE_TYPES=new Set(['image/jpeg','image/png','image/webp']);
export const PHOTO_OPTIMIZE_THRESHOLD=1024*1024;
export const MAX_GALLERY_DIMENSION=1920;

/** Reduce transfer size of large images without introducing a new upload-size cap.
 * Keeps the source file intact; returns the original if optimization is unsupported
 * or does not reduce bytes. Image format and filename are updated together.
 */
export async function prepareGalleryUpload(file,{optimize=true}={}){
 if(!optimize||!IMAGE_TYPES.has(file.type)||file.size<=PHOTO_OPTIMIZE_THRESHOLD)
  return {file,optimized:false};
 if(typeof createImageBitmap!=='function'||typeof document==='undefined')
  return {file,optimized:false};
 let bitmap;
 try{
  bitmap=await createImageBitmap(file);
  const scale=Math.min(1,MAX_GALLERY_DIMENSION/Math.max(bitmap.width,bitmap.height));
  const width=Math.max(1,Math.round(bitmap.width*scale));
  const height=Math.max(1,Math.round(bitmap.height*scale));
  const canvas=document.createElement('canvas');
  canvas.width=width;canvas.height=height;
  const context=canvas.getContext('2d');
  if(!context)return {file,optimized:false};
  context.drawImage(bitmap,0,0,width,height);
  // WebP retains transparency from PNG; JPEG is safe for photographic JPGs.
  const preferred=file.type==='image/png'?'image/webp':file.type;
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,preferred,0.78));
  if(!blob||blob.size>=file.size||!IMAGE_TYPES.has(blob.type))
   return {file,optimized:false};
  const extension=blob.type==='image/webp'?'webp':blob.type==='image/jpeg'?'jpg':'png';
  const stem=file.name.replace(/\.[^.]*$/,'')||'hotel-photo';
  return {file:new File([blob],stem+'.'+extension,{type:blob.type}),optimized:true};
 }catch{
  // A browser that cannot decode a particular image may still upload it unchanged.
  return {file,optimized:false};
 }finally{bitmap?.close?.();}
}
