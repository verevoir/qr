/**
 * `@verevoir/qr/qrcode` — a `node-qrcode`-compatible shim over the
 * v2 engine. Lets projects swap `import QRCode from 'qrcode'` for
 * `import QRCode from '@verevoir/qr/qrcode'` with their existing
 * code mostly unchanged.
 *
 * The shim is intentionally thin — it translates option names and
 * return shapes; all the QR generation and rendering goes through
 * the v2 `encode` + `toSvg` pipeline.
 *
 * This entry point is universal (works in Node and browsers). For
 * platform-specific extensions see `./qrcode/node` (toFile, toBuffer)
 * and `./qrcode/web` (toCanvas).
 *
 * Coverage vs `node-qrcode`:
 *
 * - ✅ `create` — returns a QR matrix description
 * - ✅ `toString(text, { type: 'svg' })`
 * - ⏳ `toString(text, { type: 'terminal' | 'utf8' })` — not yet
 *   implemented, falls through to SVG
 * - ✅ `errorCorrectionLevel`, `margin`, `color.dark`, `color.light`
 *   options
 * - ⏳ `version` / `maskPattern` pin options — ignored (the v2 engine
 *   picks the best fit)
 * - Callbacks are not supported — every function returns a Promise
 */

import { encode } from '../encode.js';
import { toSvg } from '../svg/index.js';
import type { ErrorLevel, QrResult, SvgOptions } from '../types.js';

/** Subset of `node-qrcode`'s option bag that the shim understands. */
export interface QRCodeOptions {
  errorCorrectionLevel?: ErrorLevel;
  /** Size of the quiet-zone margin in modules. Default `4`. */
  margin?: number;
  /** Output width in pixels. Applied to the SVG `width`/`height`. */
  width?: number;
  /**
   * Colours. Only `dark` is applied to the rendered modules; `light`
   * becomes the SVG background. Both accept any CSS colour string.
   */
  color?: { dark?: string; light?: string };
  /** Output type when calling `toString`. Defaults to `'svg'`. */
  type?: 'svg' | 'utf8' | 'terminal';
  /** Passed through to the v2 `toSvg` when set. */
  style?: SvgOptions['style'];
  /** Passed through to the v2 `toSvg` when set. */
  cornerStyle?: SvgOptions['cornerStyle'];
}

/**
 * Return a `QRCode`-like matrix description. Shaped to match the
 * object `node-qrcode`'s `create()` returns closely enough that
 * simple callers can treat them interchangeably.
 */
export function create(
  text: string,
  options: Pick<QRCodeOptions, 'errorCorrectionLevel'> = {},
): QrResult {
  const [qr] = encode(text, {
    minErrorLevel: options.errorCorrectionLevel ?? 'M',
  });
  return qr;
}

/**
 * Produce a string representation of the QR code. Matches
 * `node-qrcode.toString(text, opts)` for `type: 'svg'`.
 */
export async function toString(
  text: string,
  options: QRCodeOptions = {},
): Promise<string> {
  const [qr] = encode(text, {
    minErrorLevel: options.errorCorrectionLevel ?? 'M',
  });
  let svg = toSvg(qr, {
    style: options.style,
    cornerStyle: options.cornerStyle,
  });
  svg = applyColours(svg, options.color);
  svg = applyMargin(svg, options.margin);
  svg = applyWidth(svg, options.width);
  return svg;
}

/** Default export mimicking `node-qrcode`'s module shape. */
export default { create, toString };

// ---------------------------------------------------------------------------
// Option-to-SVG translators
// ---------------------------------------------------------------------------

/**
 * Substitute the default black fill and transparent background with
 * the user's colours. Matches the common `node-qrcode` usage.
 */
function applyColours(
  svg: string,
  color: QRCodeOptions['color'] | undefined,
): string {
  if (!color) return svg;
  let out = svg;
  if (color.dark && color.dark !== '#000000' && color.dark !== '#000') {
    out = out.replaceAll('fill="#000"', `fill="${color.dark}"`);
    out = out.replaceAll('fill="#000000"', `fill="${color.dark}"`);
  }
  if (color.light && color.light !== 'transparent') {
    // Insert a background rect as the first child of the <svg>
    out = out.replace(
      /(<svg[^>]*>)/,
      `$1<rect width="100%" height="100%" fill="${color.light}"/>`,
    );
  }
  return out;
}

/**
 * Pad the viewBox by `margin` modules on every side. `node-qrcode`
 * defaults to 4 modules; the v2 engine already includes a 1-module
 * padding, so we add the difference.
 */
function applyMargin(
  svg: string,
  margin: number | undefined,
): string {
  if (margin === undefined) return svg;
  const viewBoxMatch = svg.match(/viewBox="0 0 (\d+(?:\.\d+)?) \1"/);
  if (!viewBoxMatch) return svg;
  const currentSize = Number(viewBoxMatch[1]);
  const baseModules = currentSize - 2; //   engine already pads by 1 on each side
  const newSize = baseModules + margin * 2;
  const offset = margin - 1;
  return svg
    .replace(
      /viewBox="0 0 \d+(?:\.\d+)?\s\d+(?:\.\d+)?"/,
      `viewBox="${-offset} ${-offset} ${newSize} ${newSize}"`,
    );
}

/** Explicit width/height override in pixels. */
function applyWidth(svg: string, width: number | undefined): string {
  if (width === undefined) return svg;
  return svg.replace(
    /(<svg[^>]*)>/,
    `$1 width="${width}" height="${width}">`,
  );
}
