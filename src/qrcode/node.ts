/**
 * `@verevoir/qr/qrcode/node` — Node extensions to the node-qrcode shim.
 *
 * Adds `toFile`, `toBuffer`, and `toDataURL` with the same signatures
 * as `node-qrcode`'s Node API. Re-exports the universal surface from
 * `../qrcode/index` so `import QRCode from '@verevoir/qr/qrcode/node'`
 * gives you the full shim.
 */

import { writeFile } from 'node:fs/promises';
import { toString, create, type QRCodeOptions } from './index.js';

export { create, toString };
export type { QRCodeOptions };

/**
 * Write a QR code to a file. Extension picks the format:
 * `.svg` writes the SVG string, `.png` rasterises via
 * `@resvg/resvg-js` (optional peer dependency).
 */
export async function toFile(
  path: string,
  text: string,
  options: QRCodeOptions = {},
): Promise<void> {
  if (path.endsWith('.svg')) {
    const svg = await toString(text, { ...options, type: 'svg' });
    await writeFile(path, svg, 'utf8');
    return;
  }
  if (path.endsWith('.png')) {
    const svg = await toString(text, { ...options, type: 'svg' });
    const png = await renderPng(svg);
    await writeFile(path, png);
    return;
  }
  throw new Error(
    `toFile: unsupported extension for '${path}'. Supported: .svg, .png`,
  );
}

/** Render the QR code to a PNG `Buffer`. Requires `@resvg/resvg-js`. */
export async function toBuffer(
  text: string,
  options: QRCodeOptions = {},
): Promise<Buffer> {
  const svg = await toString(text, { ...options, type: 'svg' });
  return Buffer.from(await renderPng(svg));
}

/**
 * Render the QR code to a PNG `data:` URL. Requires `@resvg/resvg-js`.
 * Matches `node-qrcode.toDataURL` for the default PNG type.
 */
export async function toDataURL(
  text: string,
  options: QRCodeOptions = {},
): Promise<string> {
  const png = await toBuffer(text, options);
  return `data:image/png;base64,${png.toString('base64')}`;
}

export default { create, toString, toFile, toBuffer, toDataURL };

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
