// Convert camera-sized photographs into reasonably sized website assets before upload.
// The original selected file is never modified, and unsupported browsers retain it.
export async function optimizeWebsitePhoto(file, maxDimension = 1600) {
  if (!file?.type?.startsWith('image/')) return file;
  if (typeof createImageBitmap !== 'function') return file;
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    // Even small-dimension PNG photos may be enormous; WebP can reduce their payload.
    if (scale === 1 && file.type === 'image/webp' && file.size < 350 * 1024) return file;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) return file;
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', 0.78));
    if (!blob || blob.type !== 'image/webp' || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.webp', { type: 'image/webp' });
  } finally {
    bitmap.close?.();
  }
}
