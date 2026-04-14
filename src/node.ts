/**
 * `@verevoir/qr/node` — Node-only extensions to the universal core.
 *
 * Uses `node:fs/promises` for file I/O and optionally `@resvg/resvg-js`
 * for raster output (PNG). The resvg dependency is imported lazily,
 * so callers who only use SVG output don't need it installed — declare
 * it as an optional peer dependency in the consuming app.
 *
 * For the universal API, import from `@verevoir/qr` instead.
 */

import { writeFile } from 'node:fs/promises';
import { encode } from './encode.js';
import { toSvg } from './svg/index.js';
import type { EncodeOptions, SvgOptions } from './types.js';

export interface ToFileOptions extends SvgOptions {
  /** Encode options passed through to `encode()`. */
  encode?: EncodeOptions;
}

/**
 * Write a QR code to a file. The output format is chosen from the
 * path extension:
 *
 * - `.svg` — write the raw SVG string (no dependencies).
 * - `.png` — rasterise via `@resvg/resvg-js` (optional peer dep).
 *
 * Other extensions throw. For more formats add your own rasteriser
 * around `toSvg()` — SVG is the portable output.
 */
export async function toFile(
  path: string,
  text: string,
  options: ToFileOptions = {},
): Promise<void> {
  const [qr] = encode(text, options.encode);
  const svg = toSvg(qr, options);
  if (path.endsWith('.svg')) {
    await writeFile(path, svg, 'utf8');
    return;
  }
  if (path.endsWith('.png')) {
    const png = await renderPng(svg);
    await writeFile(path, png);
    return;
  }
  throw new Error(
    `toFile: unsupported extension for '${path}'. Supported: .svg, .png`,
  );
}

/**
 * Render a QR code as a PNG `Buffer`. Requires `@resvg/resvg-js` to
 * be installed as a peer dependency.
 */
export async function toBuffer(
  text: string,
  options: ToFileOptions = {},
): Promise<Buffer> {
  const [qr] = encode(text, options.encode);
  const png = await renderPng(toSvg(qr, options));
  return Buffer.from(png);
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
