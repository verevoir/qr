/**
 * `@verevoir/qr/web` — browser-only extensions to the universal core.
 *
 * Anything here depends on browser APIs (`document`, `Image`, `canvas`,
 * `URL.createObjectURL`, `DOMParser`). Importing this entry point in a
 * Node environment will work at import time — the functions throw
 * lazily when called — but the subpath is marked browser-first so
 * bundlers that respect the exports map will resolve it correctly in
 * web builds.
 *
 * For the universal API (encode, toSvg, types), import
 * from `@verevoir/qr` instead.
 */

export { svgToPng, downloadPng } from './png.js';
export type { PngOptions } from './png.js';

import type { PhotoSampler } from './types.js';

/**
 * Build a `PhotoSampler` from any source the browser can draw to a
 * canvas — `HTMLImageElement`, `SVGImageElement`, `HTMLCanvasElement`,
 * `ImageBitmap`, or a `CanvasImageSource` in general. The source must
 * already be loaded (e.g. `await img.decode()` on an `HTMLImageElement`).
 *
 * The returned sampler rasterises once per call to `toSvg`, at the QR's
 * module resolution, letterboxing the source so its aspect ratio is
 * preserved. Each cell reads back the Rec. 709 luminance of the rendered
 * pixel.
 */
export function imageToSampler(source: CanvasImageSource): PhotoSampler {
  if (typeof document === 'undefined') {
    throw new Error('imageToSampler: requires a browser environment');
  }
  return (size: number) => {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('imageToSampler: failed to acquire 2D canvas context');
    }
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, size, size);

    const srcW = sourceWidth(source);
    const srcH = sourceHeight(source);
    const scale = Math.min(size / srcW, size / srcH);
    const drawW = srcW * scale;
    const drawH = srcH * scale;
    const dx = (size - drawW) / 2;
    const dy = (size - drawH) / 2;
    ctx.drawImage(source, dx, dy, drawW, drawH);

    const data = ctx.getImageData(0, 0, size, size).data;
    return (row: number, col: number) => {
      const i = (row * size + col) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      // Rec. 709 luminance, normalised to [0, 1].
      const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
      return { luminance };
    };
  };
}

function sourceWidth(source: CanvasImageSource): number {
  if ('naturalWidth' in source && source.naturalWidth) return source.naturalWidth;
  if ('videoWidth' in source && source.videoWidth) return source.videoWidth;
  if ('width' in source) {
    const w = source.width;
    return typeof w === 'number' ? w : w.baseVal.value;
  }
  throw new Error('imageToSampler: could not determine source width');
}

function sourceHeight(source: CanvasImageSource): number {
  if ('naturalHeight' in source && source.naturalHeight)
    return source.naturalHeight;
  if ('videoHeight' in source && source.videoHeight) return source.videoHeight;
  if ('height' in source) {
    const h = source.height;
    return typeof h === 'number' ? h : h.baseVal.value;
  }
  throw new Error('imageToSampler: could not determine source height');
}

/**
 * Parse an SVG string into a live `SVGSVGElement` the caller can
 * insert into the DOM or manipulate further. Uses `DOMParser`.
 */
export function createSvgElement(svgString: string): SVGSVGElement {
  if (typeof DOMParser === 'undefined') {
    throw new Error(
      'createSvgElement: requires a browser environment (DOMParser unavailable)',
    );
  }
  const doc = new DOMParser().parseFromString(svgString, 'image/svg+xml');
  const root = doc.documentElement;
  if (root.nodeName !== 'svg') {
    throw new Error(
      `createSvgElement: parsed root is <${root.nodeName}>, expected <svg>`,
    );
  }
  return root as unknown as SVGSVGElement;
}

/**
 * Replace the contents of `container` with the given SVG string.
 * Convenience wrapper around `container.innerHTML = svgString` that
 * guards against a non-browser environment.
 */
export function renderIntoElement(container: Element, svgString: string): void {
  if (typeof document === 'undefined') {
    throw new Error('renderIntoElement: requires a browser environment');
  }
  container.innerHTML = svgString;
}
