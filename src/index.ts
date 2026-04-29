/**
 * `@verevoir/qr` — universal v2 entry point.
 *
 * QR encoding engine + SVG renderers, no runtime dependencies. Works
 * identically in Node and browsers. Platform-specific helpers live at
 * sibling subpaths:
 *
 * - `@verevoir/qr/node` — `toFile`, `toBuffer` for the filesystem.
 * - `@verevoir/qr/web` — `svgToPng`, `downloadPng`, DOM helpers.
 * - `@verevoir/qr/qrcode` — `node-qrcode`-compatible shim (universal).
 * - `@verevoir/qr/qrcode/node` — shim + Node file/buffer helpers.
 * - `@verevoir/qr/qrcode/web` — shim + canvas helpers.
 */

export { encode } from './encode.js';
export { toSvg } from './svg/index.js';
export type {
  ErrorLevel,
  SvgStyle,
  CornerStyle,
  LineWidth,
  SvgOptions,
  SvgColor,
  PhotoOptions,
  PhotoSampler,
  PhotoSample,
  LogoOptions,
  QrMatrix,
  QrResult,
  EncodeOptions,
} from './types.js';
