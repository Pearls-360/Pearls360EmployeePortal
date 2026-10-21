/**
 * Client-side resize/compress so avatar uploads stay under the API limit.
 * @param {File} file
 * @param {{ maxSize?: number, quality?: number }} [opts]
 * @returns {Promise<string>} data URL (jpeg/png/webp)
 */
export function prepareAvatar(file, { maxSize = 400, quality = 0.85 } = {}) {
  if (!/^image\/(jpeg|png|webp)$/i.test(file.type)) {
    return Promise.reject(new Error('Use a JPEG, PNG or WebP image.'));
  }
  if (file.size > 8 * 1024 * 1024) {
    return Promise.reject(new Error('Choose an image smaller than 8 MB.'));
  }

  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Could not process this image.'));
        return;
      }
      ctx.drawImage(img, 0, 0, w, h);
      const mime = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
      const dataUrl = canvas.toDataURL(mime, quality);
      if (dataUrl.length > 700_000) {
        reject(new Error('That photo is still too large after compression. Try a simpler image.'));
        return;
      }
      resolve(dataUrl);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read that image.'));
    };
    img.src = url;
  });
}
