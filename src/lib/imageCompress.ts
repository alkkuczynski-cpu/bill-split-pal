/**
 * Strip data URL prefix from a base64 string.
 */
export function stripDataUrlPrefix(input: string): string {
  return input.replace(/^data:[^;]+;base64,/, "");
}

/**
 * Compress a data-URL image to JPEG at the given max dimension and quality.
 * Returns a data URL (image/jpeg;base64,...).
 * Falls back to the original if compression fails or the canvas API is unavailable.
 */
export function compressImage(
  dataUrl: string,
  maxDimension = 1600,
  quality = 0.7,
): Promise<string> {
  return new Promise((resolve) => {
    try {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;

        // Scale down if needed
        if (width > maxDimension || height > maxDimension) {
          const ratio = Math.min(maxDimension / width, maxDimension / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(dataUrl);
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);
        const compressed = canvas.toDataURL("image/jpeg", quality);

        console.log("[compress] Done", {
          originalKB: Math.round(dataUrl.length / 1024),
          compressedKB: Math.round(compressed.length / 1024),
          dimensions: `${width}x${height}`,
        });

        resolve(compressed);
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    } catch {
      resolve(dataUrl);
    }
  });
}
