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
 * platform-specific extensions see `./qrcode/node` (toFile, toBuffer,
 * toDataURL) and `./qrcode/web` (toCanvas, toDataURL).
 *
 * ## API shape
 *
 * Every entry point preserves `node-qrcode`'s type contract so
 * existing call sites keep their inferred types. `toString` returns
 * `Promise<string>` when no callback is given (even though the work
 * is synchronous internally) so code like
 * `const p: Promise<string> = QRCode.toString(...)` or
 * `QRCode.toString(text).then(...)` ports across unchanged.
 *
 * The node-qrcode-style `(err, result)` callback form is accepted
 * everywhere it is in node-qrcode; the return type narrows to
 * `void` via function overloads when a callback is passed.
 *
 * ## What's covered
 *
 * - ✅ `create` — returns a QR matrix description (sync; same as
 *      node-qrcode's `create`).
 * - ✅ `toString(text, opts)` → `Promise<string>`,
 *      `toString(text, opts, cb)` → `void`. Matches node-qrcode.
 *      `format: 'svg' | 'utf8' | 'terminal'` (aliased as `type` for
 *      source compatibility). `'svg'` is the default.
 * - ✅ `errorCorrectionLevel`, `margin`, `width`, `color.dark`,
 *      `color.light` options.
 * - ⚠️  `version` / `maskPattern` not honoured — node-qrcode ignores
 *      them in practice for most callers too. The v2 engine always
 *      picks the best fit.
 * - ⚠️  `color.dark` / `color.light` are applied by string-replacing
 *      the emitted SVG. Works for the default `'square'` style;
 *      less reliable for the fancier styles. Proper fill plumbing
 *      arrives once the render options settle.
 */

import { encode } from '../encode.js';
import { toSvg } from '../svg/index.js';
import type {
  ErrorLevel,
  QrMatrix,
  QrResult,
  SvgOptions,
} from '../types.js';

/** node-style callback: `(err, result)`. Error is `null` on success. */
export type Callback<T = void> = (err: Error | null, result?: T) => void;

/** String-output formats supported by `toString`. */
export type QRCodeFormat = 'svg' | 'utf8' | 'terminal';

/** Subset of `node-qrcode`'s option bag that the shim understands. */
export interface QRCodeOptions {
  errorCorrectionLevel?: ErrorLevel;
  /** Size of the quiet-zone margin in modules. Default `4`. */
  margin?: number;
  /** Output width in pixels. Applied to the SVG `width` / `height`. */
  width?: number;
  /** Colours. `dark` replaces the fill; `light` becomes the background. */
  color?: { dark?: string; light?: string };
  /**
   * Output format for `toString`. Defaults to `'svg'` — the natural
   * output of the v2 engine. `'utf8'` and `'terminal'` render the
   * matrix as text characters.
   */
  format?: QRCodeFormat;
  /** Alias for `format` — kept so `node-qrcode` call sites port unchanged. */
  type?: QRCodeFormat;
  /** Passed through to the v2 `toSvg`. */
  style?: SvgOptions['style'];
  /** Passed through to the v2 `toSvg`. */
  cornerStyle?: SvgOptions['cornerStyle'];
}

// ---------------------------------------------------------------------------
// create
// ---------------------------------------------------------------------------

/**
 * Return a `QRCode`-like matrix description. Shape mirrors
 * `node-qrcode.create()` closely enough for simple callers.
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

// ---------------------------------------------------------------------------
// toString
// ---------------------------------------------------------------------------

/* eslint-disable no-redeclare */
export function toString(text: string): Promise<string>;
export function toString(
  text: string,
  options: QRCodeOptions,
): Promise<string>;
export function toString(text: string, cb: Callback<string>): void;
export function toString(
  text: string,
  options: QRCodeOptions,
  cb: Callback<string>,
): void;
export function toString(
  text: string,
  a?: QRCodeOptions | Callback<string>,
  b?: Callback<string>,
): Promise<string> | void {
  const { options, cb } = normaliseArgs(a, b);
  // The underlying work is synchronous; wrap in Promise.resolve /
  // Promise.reject so the return type stays `Promise<string>` and
  // node-qrcode's type contract ports over unchanged. Callers who
  // want the raw sync result can use `create()` + the v2 `toSvg` /
  // `toSvgOutline` directly.
  let result: string;
  try {
    result = buildString(text, options);
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    if (cb) {
      cb(error);
      return;
    }
    return Promise.reject(error);
  }
  if (cb) {
    cb(null, result);
    return;
  }
  return Promise.resolve(result);
}
/* eslint-enable no-redeclare */

export default { create, toString };

// ---------------------------------------------------------------------------
// Internal helpers — exported so the platform subpaths can share them
// ---------------------------------------------------------------------------

/**
 * Split the `(options?, callback?)` / `(callback?)` positional
 * argument shape used by every node-qrcode entry point into a
 * normalised `{ options, cb }` pair.
 */
export function normaliseArgs<O extends object, T>(
  a: O | Callback<T> | undefined,
  b: Callback<T> | undefined,
): { options: O; cb: Callback<T> | undefined } {
  if (typeof a === 'function') {
    return { options: {} as O, cb: a };
  }
  return { options: (a ?? ({} as O)) as O, cb: b };
}

/** Build the full string output for `toString`. Sync, format-aware. */
export function buildString(text: string, options: QRCodeOptions): string {
  const format = options.format ?? options.type ?? 'svg';
  const [qr] = encode(text, {
    minErrorLevel: options.errorCorrectionLevel ?? 'M',
  });
  if (format === 'utf8') return buildUtf8(qr, options.margin ?? 1);
  if (format === 'terminal') return buildTerminal(qr, options.margin ?? 1);
  // Colour and margin are now handled by SvgOptions — no more
  // post-emit string substitution. Width (pixel dimensions) still
  // applies as an attribute rewrite since SvgOptions doesn't carry
  // a pixel-size concept, only the module-unit viewBox.
  let svg = toSvg(qr, {
    style: options.style,
    cornerStyle: options.cornerStyle,
    color: options.color
      ? {
          dark: options.color.dark,
          light: options.color.light,
          // node-qrcode treats `color.light` as the background for
          // raster outputs; mirror that by doubling light → background
          // when a light colour is explicitly set, unless it's
          // transparent (in which case no background rect).
          background:
            options.color.light && options.color.light !== 'transparent'
              ? options.color.light
              : undefined,
        }
      : undefined,
  });
  svg = applyMargin(svg, options.margin);
  svg = applyWidth(svg, options.width);
  return svg;
}

// ---------------------------------------------------------------------------
// Format renderers
// ---------------------------------------------------------------------------

/**
 * UTF-8 rendering: each dark module as two "█" characters, each light
 * as two spaces. Doubling the width keeps the aspect ratio correct in
 * a monospace terminal (characters are typically twice as tall as
 * wide).
 */
function buildUtf8(qr: QrMatrix, margin: number): string {
  const DARK = '██';
  const LIGHT = '  ';
  const totalWidth = qr.size + margin * 2;
  const borderRow = LIGHT.repeat(totalWidth) + '\n';
  let out = borderRow.repeat(margin);
  for (let r = 0; r < qr.size; r++) {
    out += LIGHT.repeat(margin);
    for (let c = 0; c < qr.size; c++) {
      out += qr.matrix[r][c] === 1 ? DARK : LIGHT;
    }
    out += LIGHT.repeat(margin) + '\n';
  }
  out += borderRow.repeat(margin);
  return out;
}

/**
 * Terminal rendering: uses ANSI colour escapes so the QR shows with
 * contrast on dark-on-light terminals. Identical matrix layout as
 * `buildUtf8`.
 */
function buildTerminal(qr: QrMatrix, margin: number): string {
  const DARK = '\x1b[40m  \x1b[0m';
  const LIGHT = '\x1b[47m  \x1b[0m';
  const totalWidth = qr.size + margin * 2;
  const borderRow = LIGHT.repeat(totalWidth) + '\n';
  let out = borderRow.repeat(margin);
  for (let r = 0; r < qr.size; r++) {
    out += LIGHT.repeat(margin);
    for (let c = 0; c < qr.size; c++) {
      out += qr.matrix[r][c] === 1 ? DARK : LIGHT;
    }
    out += LIGHT.repeat(margin) + '\n';
  }
  out += borderRow.repeat(margin);
  return out;
}

// ---------------------------------------------------------------------------
// Option-to-SVG translators
// ---------------------------------------------------------------------------

/**
 * Pad the viewBox by `margin` modules on every side. `node-qrcode`
 * defaults to 4 modules; the v2 engine already includes a 1-module
 * padding, so we adjust relative to that.
 */
function applyMargin(svg: string, margin: number | undefined): string {
  if (margin === undefined) return svg;
  const viewBoxMatch = svg.match(/viewBox="0 0 (\d+(?:\.\d+)?) \1"/);
  if (!viewBoxMatch) return svg;
  const currentSize = Number(viewBoxMatch[1]);
  const baseModules = currentSize - 2; //   engine pads by 1 on each side
  const newSize = baseModules + margin * 2;
  const offset = margin - 1;
  return svg.replace(
    /viewBox="0 0 \d+(?:\.\d+)?\s\d+(?:\.\d+)?"/,
    `viewBox="${-offset} ${-offset} ${newSize} ${newSize}"`,
  );
}

/** Explicit pixel width/height on the `<svg>` root. */
function applyWidth(svg: string, width: number | undefined): string {
  if (width === undefined) return svg;
  return svg.replace(/(<svg[^>]*)>/, `$1 width="${width}" height="${width}">`);
}
