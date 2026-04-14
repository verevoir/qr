/**
 * `@verevoir/qr/qrcode/web` — browser extensions to the node-qrcode shim.
 *
 * Adds `toCanvas` and `toDataURL` matching `node-qrcode`'s browser
 * API. Each accepts either a `(err, result)` callback or returns a
 * Promise. Re-exports the universal shim so a single import gives
 * the full surface.
 */

import { svgToPng } from '../png.js';
import {
  buildString,
  create,
  normaliseArgs,
  toString,
  type Callback,
  type QRCodeOptions,
} from './index.js';

export { create, toString };
export type { Callback, QRCodeOptions };

// ---------------------------------------------------------------------------
// toCanvas
// ---------------------------------------------------------------------------

export interface ToCanvasOptions extends QRCodeOptions {
  /** Pixel size of the canvas. Defaults to `width` or `canvas.width`. */
  size?: number;
}

export function toCanvas(
  canvas: HTMLCanvasElement,
  text: string,
): Promise<HTMLCanvasElement>;
export function toCanvas(
  canvas: HTMLCanvasElement,
  text: string,
  options: ToCanvasOptions,
): Promise<HTMLCanvasElement>;
export function toCanvas(
  canvas: HTMLCanvasElement,
  text: string,
  cb: Callback<HTMLCanvasElement>,
): void;
export function toCanvas(
  canvas: HTMLCanvasElement,
  text: string,
  options: ToCanvasOptions,
  cb: Callback<HTMLCanvasElement>,
): void;
export function toCanvas(
  canvas: HTMLCanvasElement,
  text: string,
  a?: ToCanvasOptions | Callback<HTMLCanvasElement>,
  b?: Callback<HTMLCanvasElement>,
): Promise<HTMLCanvasElement> | void {
  const { options, cb } = normaliseArgs<ToCanvasOptions, HTMLCanvasElement>(
    a,
    b,
  );
  const promise = drawCanvas(canvas, text, options);
  return handle(promise, cb);
}

async function drawCanvas(
  canvas: HTMLCanvasElement,
  text: string,
  options: ToCanvasOptions,
): Promise<HTMLCanvasElement> {
  const size = options.size ?? options.width ?? canvas.width ?? 256;
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('toCanvas: failed to acquire 2d context on canvas');
  }
  const svg = buildString(text, { ...options, format: 'svg' });
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

// ---------------------------------------------------------------------------
// toDataURL
// ---------------------------------------------------------------------------

export function toDataURL(text: string): Promise<string>;
export function toDataURL(
  text: string,
  options: ToCanvasOptions,
): Promise<string>;
export function toDataURL(text: string, cb: Callback<string>): void;
export function toDataURL(
  text: string,
  options: ToCanvasOptions,
  cb: Callback<string>,
): void;
export function toDataURL(
  text: string,
  a?: ToCanvasOptions | Callback<string>,
  b?: Callback<string>,
): Promise<string> | void {
  const { options, cb } = normaliseArgs<ToCanvasOptions, string>(a, b);
  const promise = dataUrlFromOptions(text, options);
  return handle(promise, cb);
}

async function dataUrlFromOptions(
  text: string,
  options: ToCanvasOptions,
): Promise<string> {
  const svg = buildString(text, { ...options, format: 'svg' });
  const size = options.size ?? options.width ?? 256;
  const blob = await svgToPng(svg, size);
  return await blobToDataUrl(blob);
}

export default { create, toString, toCanvas, toDataURL };

// ---------------------------------------------------------------------------
// Shared plumbing
// ---------------------------------------------------------------------------

function handle<T>(
  promise: Promise<T>,
  cb: Callback<T> | undefined,
): Promise<T> | void {
  if (!cb) return promise;
  promise.then(
    (result) => cb(null, result),
    (err: unknown) => cb(err instanceof Error ? err : new Error(String(err))),
  );
  return undefined;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () =>
      reject(new Error('blobToDataUrl: FileReader failed'));
    reader.readAsDataURL(blob);
  });
}
