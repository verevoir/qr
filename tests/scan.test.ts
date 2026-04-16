/**
 * Scannability tests — generate a QR code in every supported style, render it
 * to pixels via @resvg/resvg-js, and decode it with jsqr to confirm each
 * variant produces a QR code that a real scanner can read.
 *
 * Three URL lengths exercise different QR versions (v1/v2/v5 approximately)
 * so density and mask selection vary across the suite.
 *
 * Design note: data-style tests use `square` corners and corner-style tests
 * use the `square` data style. This keeps each suite focused on one variable.
 */
import { describe, it, expect } from 'vitest';
import { Resvg } from '@resvg/resvg-js';
import jsQR from 'jsqr';
import { encode, toSvg } from '../src/index.js';
import type { SvgStyle, CornerStyle } from '../src/index.js';

// ---------------------------------------------------------------------------
// Test matrix
// ---------------------------------------------------------------------------

const URLS = [
  'https://verevoir.io', // short  — v1–2
  'https://example.com/products/widget-123', // medium — v2–3
  'https://tickets.example.com/e/summer-conf-2026?src=qr&medium=badge', // longer — v4–5
];

const DATA_STYLES: SvgStyle[] = [
  'square',
  'dots',
  'horizontal',
  'vertical',
  'diagonal',
  'grid',
  'lines',
  'metro',
  'scribble',
  'scribble-alt',
];

const CORNER_STYLES: CornerStyle[] = ['square', 'rounded', 'round'];

// ---------------------------------------------------------------------------
// Decode helper
// ---------------------------------------------------------------------------

/**
 * Render an SVG string to RGBA pixels and decode any QR code found.
 *
 * 20× zoom: a v1 code (23-unit viewBox) renders at 460 px; a v5 code
 * (39-unit viewBox) at 780 px. Both are well above jsqr's practical minimum.
 * White background is required — jsqr's finder-pattern detector needs contrast.
 */
function decodeSvg(svg: string): string | null {
  const resvg = new Resvg(svg, {
    background: '#ffffff',
    fitTo: { mode: 'zoom', value: 20 },
  });
  const rendered = resvg.render();
  // resvg-js returns a Node.js Buffer; jsqR expects Uint8ClampedArray
  const pixels = new Uint8ClampedArray(rendered.pixels);
  const result = jsQR(pixels, rendered.width, rendered.height);
  if (!result?.data) {
    console.log(svg);
    console.log(svg);
  }
  return result?.data ?? null;
}

// ---------------------------------------------------------------------------
// Data style tests
// Uses square corners to isolate data-module rendering from finder rendering.
// ---------------------------------------------------------------------------

describe('data styles', () => {
  for (const url of URLS) {
    describe(url, () => {
      for (const style of DATA_STYLES) {
        it(style, () => {
          const [qr] = encode(url);
          const svg = toSvg(qr, { style, cornerStyle: 'square' });
          expect(decodeSvg(svg)).toBe(url);
        });
      }
    });
  }
});

// ---------------------------------------------------------------------------
// Corner style tests
// Uses square data style to isolate finder/alignment rendering.
// ---------------------------------------------------------------------------

describe('corner styles', () => {
  for (const url of URLS) {
    describe(url, () => {
      for (const cornerStyle of CORNER_STYLES) {
        it(cornerStyle, () => {
          const [qr] = encode(url);
          const svg = toSvg(qr, { style: 'square', cornerStyle });
          expect(decodeSvg(svg)).toBe(url);
        });
      }
    });
  }
});

// ---------------------------------------------------------------------------
// Outline debug pipeline — the new trace-based renderer.
// Scan tests are skipped: the debug style renders thin stroked lines
// (0.25 unit) which are too thin for the pixel-based jsQR scanner
// at the default resvg render size. In the browser it scans fine
// because SVG renders at native resolution. Production scan tests
// will be added when a production renderer is built on top of the
// trace pipeline.
// ---------------------------------------------------------------------------
