/**
 * `@verevoir/qr/qrcode/web` — browser extensions to the node-qrcode shim.
 *
 * Adds `toCanvas` and `toDataURL` matching `node-qrcode`'s browser API.
 * Re-exports the universal shim so a single import gives the full
 * surface.
 */

import { toString, create, type QRCodeOptions } from './index.js';
import { svgToPng } from '../png.js';

export { create, toString };
export type { QRCodeOptions };

/**
 * Render the QR code into the given `<canvas>` element. Returns the
 * canvas for chaining. Signature matches `node-qrcode.toCanvas`.
 */
export async function toCanvas(
  canvas: HTMLCanvasElement,
  text: string,
  options: QRCodeOptions & { size?: number } = {},
): Promise<HTMLCanvasElement> {
  const size = options.size ?? options.width ?? canvas.width ?? 256;
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('toCanvas: failed to acquire 2d context on canvas');
  }
  const svg = await toString(text, options);
  const blob = await svgToPng(svg, size);
  const img = new Image();
  const url = URL.createObjectURL(blob);
  try {
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () =>
        reject(new Error('toCanvas: failed to load rendered PNG'));
      img.src = url;
    });
    ctx.drawImage(img, 0, 0, size, size);
  } finally {
    URL.revokeObjectURL(url);
  }
  return canvas;
}

/**
 * Render the QR code to a PNG `data:` URL using the browser canvas
 * pipeline. Matches `node-qrcode.toDataURL` in the browser.
 */
export async function toDataURL(
  text: string,
  options: QRCodeOptions & { size?: number } = {},
): Promise<string> {
  const svg = await toString(text, options);
  const size = options.size ?? options.width ?? 256;
  const blob = await svgToPng(svg, size);
  return await blobToDataUrl(blob);
}

export default { create, toString, toCanvas, toDataURL };

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('blobToDataUrl: FileReader failed'));
    reader.readAsDataURL(blob);
  });
}
