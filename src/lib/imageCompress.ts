/**
 * Resize and compress an image to reduce upload size for receipt scanning.
 * Max 1200px on longest side, JPEG at 70% quality.
 * Returns a clean base64 string WITHOUT the data URL prefix.
 */
export function compressImage(dataUrl: string, maxDim = 1200, quality = 0.7): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          const ratio = Math.min(maxDim / width, maxDim / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("Canvas not supported"));
        ctx.drawImage(img, 0, 0, width, height);
        const result = canvas.toDataURL("image/jpeg", quality);
        // Strip data URL prefix and return raw base64
        const raw = stripDataUrlPrefix(result);
        if (!raw || raw.length < 100) {
          return reject(new Error("Compression produced empty output"));
        }
        resolve(raw);
      } catch (e) {
        reject(e);
      }
    };
    img.onerror = () => reject(new Error("Failed to load image for compression"));
    img.src = dataUrl;
  });
}

/**
 * Strip data URL prefix from a base64 string.
 * Handles data:image/jpeg;base64, data:image/png;base64, etc.
 * Returns raw base64 string.
 */
export function stripDataUrlPrefix(input: string): string {
  return input.replace(/^data:[^;]+;base64,/, "");
}

/**
 * Validate that a string looks like valid base64.
 */
export function isValidBase64(str: string): boolean {
  if (!str || str.length < 100) return false;
  // Check it only contains valid base64 characters
  return /^[A-Za-z0-9+/\n\r]+=*$/.test(str.trim());
}
