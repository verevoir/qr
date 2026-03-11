export interface PngOptions {
  /** Width and height of the output PNG in pixels. */
  size: number;
}

/**
 * Render an SVG string to a PNG Blob using the browser Canvas API.
 *
 * This is browser-only — it relies on `Image`, `document.createElement('canvas')`,
 * and `canvas.toBlob()`. Throws in environments where these APIs are unavailable.
 */
export function svgToPng(svgString: string, size: number): Promise<Blob> {
  if (!svgString || typeof svgString !== 'string') {
    throw new Error('svgToPng: svgString must be a non-empty string');
  }
  if (!Number.isFinite(size) || size <= 0) {
    throw new Error('svgToPng: size must be a positive finite number');
  }
  if (typeof document === 'undefined' || typeof Image === 'undefined') {
    throw new Error(
      'svgToPng: this function requires a browser environment (document and Image must be available)',
    );
  }

  return new Promise<Blob>((resolve, reject) => {
    const img = new Image();
    const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          URL.revokeObjectURL(url);
          reject(new Error('svgToPng: failed to get canvas 2d context'));
          return;
        }

        // White background (QR codes need contrast)
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, size, size);
        ctx.drawImage(img, 0, 0, size, size);
        URL.revokeObjectURL(url);

        canvas.toBlob((pngBlob) => {
          if (pngBlob) {
            resolve(pngBlob);
          } else {
            reject(new Error('svgToPng: canvas.toBlob returned null'));
          }
        }, 'image/png');
      } catch (err) {
        URL.revokeObjectURL(url);
        reject(err);
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('svgToPng: failed to load SVG into Image element'));
    };

    img.src = url;
  });
}

/**
 * Render an SVG string to PNG and trigger a browser download.
 *
 * Convenience wrapper around {@link svgToPng}.
 */
export async function downloadPng(
  svgString: string,
  size: number,
  filename: string = 'qr-code.png',
): Promise<void> {
  const blob = await svgToPng(svgString, size);
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  } finally {
    URL.revokeObjectURL(url);
  }
}
