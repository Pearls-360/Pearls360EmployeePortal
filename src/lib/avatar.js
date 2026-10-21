/**
 * Client-side resize/compress so avatar uploads stay under the API limit.
 * Reads the file as a data URL. Blob URLs are blocked by the production
 * image policy, which is why a photo previously failed with "Could not read that image."
 * @param {File} file
 * @param {{ maxSize?: number, quality?: number }} [opts]
 * @returns {Promise<string>} data URL (jpeg or png)
 */
export function prepareAvatar(file, { maxSize = 512, quality = 0.86 } = {}) {
  const type = (file.type || '').toLowerCase();
  const name = file.name.toLowerCase();
  if (type.includes('heic') || type.includes('heif') || /\.heic$|\.heif$/.test(name)) {
    return Promise.reject(new Error('Save this photo as a JPEG or PNG, then try again.'));
  }
  const allowed = /^image\/(jpeg|jpg|pjpeg|png|webp)$/.test(type) || /\.(jpe?g|png|webp)$/.test(name) || type === '';
  if (!allowed) return Promise.reject(new Error('Use a JPEG, PNG or WebP image.'));
  if (file.size > 8 * 1024 * 1024) return Promise.reject(new Error('Choose an image smaller than 8 MB.'));

  return readDataUrl(file).then((url) => new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const side = Math.min(img.width, img.height);
      const sx = (img.width - side) / 2;
      const sy = (img.height - side) / 2;
      const canvas = document.createElement('canvas');
      canvas.width = maxSize;
      canvas.height = maxSize;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Could not process this image.'));
        return;
      }
      ctx.drawImage(img, sx, sy, side, side, 0, 0, maxSize, maxSize);
      const mime = type === 'image/png' || name.endsWith('.png') ? 'image/png' : 'image/jpeg';
      const dataUrl = canvas.toDataURL(mime, quality);
      if (dataUrl.length > 700_000) {
        reject(new Error('That photo is still too large after compression. Try a simpler image.'));
        return;
      }
      resolve(dataUrl);
    };
    img.onerror = () => reject(new Error('Could not read that image. Use a JPEG, PNG or WebP.'));
    img.src = url;
  }));
}

/** @param {File} file */
function readDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Could not read that image.'));
    reader.readAsDataURL(file);
  });
}
