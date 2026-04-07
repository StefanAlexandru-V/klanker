import { extractText, isSupported, supportedTypesLabel } from './fileParser.js';

export const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
export const MAX_SIZE = 10 * 1024 * 1024;

/**
 * Reads a File as a base64 data URL.
 * @param {File} file
 * @returns {Promise<string>}
 */
export function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(/** @type {string} */ (reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * @param {number} bytes
 * @returns {string}
 */
export function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

/**
 * Process a FileList into pending files and images arrays.
 * @param {FileList} fileList
 * @param {Array<{name: string, content: string, size: number}>} existingFiles
 * @param {Array<{name: string, dataUrl: string, size: number}>} existingImages
 * @returns {Promise<{files: Array<{name: string, content: string, size: number}>, images: Array<{name: string, dataUrl: string, size: number}>, error: string}>}
 */
export async function processFiles(fileList, existingFiles, existingImages) {
  const skipped = [];
  const newFiles = [...existingFiles];
  const newImages = [...existingImages];

  for (const file of fileList) {
    if (file.size > MAX_SIZE) {
      skipped.push(`${file.name} (too large, max 10 MB)`);
      continue;
    }

    if (IMAGE_TYPES.has(file.type)) {
      if (newImages.some((i) => i.name === file.name)) continue;
      try {
        const dataUrl = await readAsDataUrl(file);
        newImages.push({ name: file.name, dataUrl, size: file.size });
      } catch {
        skipped.push(`${file.name} (could not read image)`);
      }
      continue;
    }

    if (newFiles.some((f) => f.name === file.name)) continue;
    if (!isSupported(file)) {
      skipped.push(`${file.name} (unsupported type)`);
      continue;
    }
    try {
      const result = await extractText(file);
      if (!result.content.trim()) {
        skipped.push(`${file.name} (no text content found)`);
        continue;
      }
      newFiles.push(result);
    } catch (err) {
      skipped.push(`${file.name} (${err.message})`);
    }
  }

  const error = skipped.length > 0
    ? `Skipped: ${skipped.join(', ')}. Supported: images, ${supportedTypesLabel()}`
    : '';

  return { files: newFiles, images: newImages, error };
}
