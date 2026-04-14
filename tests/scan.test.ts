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
import {
  toSvgOutline,
  SHARP,
  ROUNDED,
  SHARP_DIAGONAL,
  ROUNDED_DIAGONAL,
} from '../src/svg/outline.js';
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
// Outline pipeline tests (this branch)
// Exercises both the direct toSvgOutline API and the toSvg 'outline' /
// 'outline-round' style aliases to confirm they are wired up end-to-end.
// ---------------------------------------------------------------------------

describe('outline pipeline', () => {
  for (const url of URLS) {
    describe(url, () => {
      it('SHARP (direct)', () => {
        const [qr] = encode(url);
        expect(decodeSvg(toSvgOutline(qr, { treatment: SHARP }))).toBe(url);
      });

      it('ROUNDED (direct)', () => {
        const [qr] = encode(url);
        expect(decodeSvg(toSvgOutline(qr, { treatment: ROUNDED }))).toBe(url);
      });

      it("style: 'outline'", () => {
        const [qr] = encode(url);
        expect(decodeSvg(toSvg(qr, { style: 'outline' }))).toBe(url);
      });

      it("style: 'outline-round'", () => {
        const [qr] = encode(url);
        expect(decodeSvg(toSvg(qr, { style: 'outline-round' }))).toBe(url);
      });

      it('SHARP_DIAGONAL (direct)', () => {
        const [qr] = encode(url);
        expect(decodeSvg(toSvgOutline(qr, { treatment: SHARP_DIAGONAL }))).toBe(
          url,
        );
      });

      it('ROUNDED_DIAGONAL (direct)', () => {
        const [qr] = encode(url);
        expect(
          decodeSvg(toSvgOutline(qr, { treatment: ROUNDED_DIAGONAL })),
        ).toBe(url);
      });

      it("style: 'outline-diagonal'", () => {
        const [qr] = encode(url);
        console.log(`outline-diagonal ${url}`);
        expect(decodeSvg(toSvg(qr, { style: 'outline-diagonal' }))).toBe(url);
      });

      it("style: 'outline-round-diagonal'", () => {
        const [qr] = encode(url);
        console.log(`outline-round-diagonal ${url}`);
        expect(decodeSvg(toSvg(qr, { style: 'outline-round-diagonal' }))).toBe(
          url,
        );
      });
    });
  }
});
