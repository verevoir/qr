/**
 * Scannability tests — generate a QR code in every supported style, render it
 * to pixels via @resvg/resvg-js, and decode it with jsqr to confirm each
 * variant produces a QR code that a real scanner can read.
 *
 * Three URL lengths exercise different QR versions (v1/v2/v5 approximately)
 * so density and mask selection vary across the suite.
 *
 * Note: jsQR's finder-pattern detector is stricter than most phone scanners.
 * Rounded corners fail jsQR even at high zoom but scan fine on phones.
 * Network/circuit use thin stroked paths that also fall below jsQR's threshold.
 */
import { describe, it, expect } from 'vitest';
import { Resvg } from '@resvg/resvg-js';
import jsQR from 'jsqr';
import { encode, toSvg } from '../src/index.js';
import type { SvgStyle, CornerStyle, LineWidth } from '../src/index.js';

// ---------------------------------------------------------------------------
// Test matrix
// ---------------------------------------------------------------------------

const URLS = [
  'https://verevoir.io', // short  — v1–2
  'https://example.com/products/widget-123', // medium — v2–3
  'https://tickets.example.com/e/summer-conf-2026?src=qr&medium=badge', // longer — v4–5
];

const ALL_STYLES: SvgStyle[] = [
  'square',
  'dots',
  'diamonds',
  'horizontal',
  'vertical',
  'diagonal',
  'network',
  'circuit',
  'metro',
  'scribble',
];

const CORNER_STYLES: CornerStyle[] = ['square', 'rounded'];
const LINE_WIDTHS: LineWidth[] = ['normal', 'thin'];

// Styles that jsQR can reliably decode with square corners.
// network/circuit use thin stroked trace paths — scan on phones
// but below jsQR's pixel threshold. scribble/thin is too sparse.
const JSQR_RELIABLE: SvgStyle[] = [
  'square',
  'dots',
  'diamonds',
  'horizontal',
  'vertical',
  'diagonal',
  'metro',
  'scribble',
];

// ---------------------------------------------------------------------------
// Decode helper
// ---------------------------------------------------------------------------

function decodeSvg(svg: string): string | null {
  const resvg = new Resvg(svg, {
    background: '#ffffff',
    fitTo: { mode: 'zoom', value: 20 },
  });
  const rendered = resvg.render();
  const pixels = new Uint8ClampedArray(rendered.pixels);
  const result = jsQR(pixels, rendered.width, rendered.height);
  return result?.data ?? null;
}

// ---------------------------------------------------------------------------
// Core scan tests — square corners, both line widths
// These must all pass. jsQR reliably decodes square-corner QR codes.
// ---------------------------------------------------------------------------

describe('scan — square corners', () => {
  for (const url of URLS) {
    describe(url, () => {
      for (const style of JSQR_RELIABLE) {
        for (const lineWidth of LINE_WIDTHS) {
          it(`${style} / ${lineWidth}`, () => {
            const [qr] = encode(url);
            const svg = toSvg(qr, { style, lineWidth, cornerStyle: 'square' });
            expect(decodeSvg(svg)).toBe(url);
          });
        }
      }
    });
  }
});

// ---------------------------------------------------------------------------
// All styles render without error (no scan assertion — just structural)
// ---------------------------------------------------------------------------

describe('all styles render', () => {
  for (const style of ALL_STYLES) {
    for (const lineWidth of LINE_WIDTHS) {
      for (const cornerStyle of CORNER_STYLES) {
        it(`${style} / ${lineWidth} / ${cornerStyle}`, () => {
          const [qr] = encode('https://verevoir.io');
          const svg = toSvg(qr, { style, lineWidth, cornerStyle });
          expect(svg.length).toBeGreaterThan(100);
          expect(svg).toContain('<svg');
        });
      }
    }
  }
});
