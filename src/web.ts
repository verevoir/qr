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
