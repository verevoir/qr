/**
 * `@verevoir/qr/qrcode/node` — Node extensions to the node-qrcode shim.
 *
 * Adds `toFile`, `toBuffer`, and `toDataURL` with the same
 * positional-argument shape as `node-qrcode`'s Node API. Each
 * function accepts either a final `(err, result)` callback or
 * returns a Promise — pick whichever matches your call-site style.
 *
 * Re-exports the universal surface from `./index` so
 * `import QRCode from '@verevoir/qr/qrcode/node'` is the full shim.
 */

import { writeFile } from 'node:fs/promises';
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
// toFile
// ---------------------------------------------------------------------------

/* eslint-disable no-redeclare */
export function toFile(path: string, text: string): Promise<void>;
export function toFile(
  path: string,
  text: string,
  options: QRCodeOptions,
): Promise<void>;
export function toFile(
  path: string,
  text: string,
  cb: Callback<void>,
): void;
export function toFile(
  path: string,
  text: string,
  options: QRCodeOptions,
  cb: Callback<void>,
): void;
export function toFile(
  path: string,
  text: string,
  a?: QRCodeOptions | Callback<void>,
  b?: Callback<void>,
): Promise<void> | void {
  const { options, cb } = normaliseArgs(a, b);
  const promise = writeFileFromOptions(path, text, options);
  return handle(promise, cb);
}
/* eslint-enable no-redeclare */

async function writeFileFromOptions(
  path: string,
  text: string,
  options: QRCodeOptions,
): Promise<void> {
  const svg = buildString(text, { ...options, format: 'svg' });
  if (path.endsWith('.svg')) {
    await writeFile(path, svg, 'utf8');
    return;
  }
  if (path.endsWith('.png')) {
    await writeFile(path, await renderPng(svg));
    return;
  }
  throw new Error(
    `toFile: unsupported extension for '${path}'. Supported: .svg, .png`,
  );
}

// ---------------------------------------------------------------------------
// toBuffer — defaults to PNG to match node-qrcode
// ---------------------------------------------------------------------------

/* eslint-disable no-redeclare */
export function toBuffer(text: string): Promise<Buffer>;
export function toBuffer(
  text: string,
  options: QRCodeOptions,
): Promise<Buffer>;
export function toBuffer(text: string, cb: Callback<Buffer>): void;
export function toBuffer(
  text: string,
  options: QRCodeOptions,
  cb: Callback<Buffer>,
): void;
export function toBuffer(
  text: string,
  a?: QRCodeOptions | Callback<Buffer>,
  b?: Callback<Buffer>,
): Promise<Buffer> | void {
  const { options, cb } = normaliseArgs(a, b);
  const promise = bufferFromOptions(text, options);
  return handle(promise, cb);
}
/* eslint-enable no-redeclare */

async function bufferFromOptions(
  text: string,
  options: QRCodeOptions,
): Promise<Buffer> {
  const svg = buildString(text, { ...options, format: 'svg' });
  return Buffer.from(await renderPng(svg));
}

// ---------------------------------------------------------------------------
// toDataURL — PNG data: URL, matching node-qrcode's default
// ---------------------------------------------------------------------------

/* eslint-disable no-redeclare */
export function toDataURL(text: string): Promise<string>;
export function toDataURL(
  text: string,
  options: QRCodeOptions,
): Promise<string>;
export function toDataURL(text: string, cb: Callback<string>): void;
export function toDataURL(
  text: string,
  options: QRCodeOptions,
  cb: Callback<string>,
): void;
export function toDataURL(
  text: string,
  a?: QRCodeOptions | Callback<string>,
  b?: Callback<string>,
): Promise<string> | void {
  const { options, cb } = normaliseArgs(a, b);
  const promise = dataUrlFromOptions(text, options);
  return handle(promise, cb);
}
/* eslint-enable no-redeclare */

async function dataUrlFromOptions(
  text: string,
  options: QRCodeOptions,
): Promise<string> {
  const buffer = await bufferFromOptions(text, options);
  return `data:image/png;base64,${buffer.toString('base64')}`;
}

export default { create, toString, toFile, toBuffer, toDataURL };

// ---------------------------------------------------------------------------
// Shared plumbing
// ---------------------------------------------------------------------------

/**
 * Bridge a Promise-returning async implementation into node-qrcode's
 * dual callback/Promise shape. If a callback is provided, invoke it
 * with `(err, result)` and return `undefined`. Otherwise return the
 * Promise directly.
 */
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

async function renderPng(svg: string): Promise<Uint8Array> {
  let Resvg: typeof import('@resvg/resvg-js').Resvg;
  try {
    ({ Resvg } = await import('@resvg/resvg-js'));
  } catch {
    throw new Error(
      'PNG output requires @resvg/resvg-js — install it as a peer dependency',
    );
  }
  return new Resvg(svg).render().asPng();
}
