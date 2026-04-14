/**
 * Parity tests: our `/qrcode` shim vs real `node-qrcode`.
 *
 * Rather than comparing SVG strings byte-for-byte (node-qrcode emits
 * a <rect>-grid, we emit paths; byte-equal would never hold), we
 * assert behavioural equivalence:
 *
 * - Encoded matrix dimensions match for the same inputs.
 * - Both libraries' outputs decode to the same text when rasterised
 *   and passed through jsqr.
 * - Option shapes behave the same way (errorCorrectionLevel,
 *   margin, color, callback vs promise).
 *
 * Doubles as a regression guard: if node-qrcode bumps a version
 * and we re-run this suite in CI, we'll notice if swap-in behaviour
 * starts drifting.
 */
import { describe, it, expect } from 'vitest';
import { Resvg } from '@resvg/resvg-js';
import jsQR from 'jsqr';
import QRCode from 'qrcode';
import * as shim from '../src/qrcode/index.js';

const URLS = [
  'https://verevoir.io',
  'https://example.com/products/widget-123',
  'https://tickets.example.com/e/summer-conf-2026?src=qr&medium=badge',
];

const ERROR_LEVELS = ['L', 'M', 'Q', 'H'] as const;

/** Rasterise an SVG at 20× zoom and decode via jsqr. */
function decodeSvg(svg: string): string | null {
  const resvg = new Resvg(svg, {
    background: '#ffffff',
    fitTo: { mode: 'zoom', value: 20 },
  });
  const rendered = resvg.render();
  const pixels = new Uint8ClampedArray(rendered.pixels);
  return jsQR(pixels, rendered.width, rendered.height)?.data ?? null;
}

// ---------------------------------------------------------------------------
// API signature parity
// ---------------------------------------------------------------------------

describe('API signature parity', () => {
  it('both toString return Promise<string> with no callback', async () => {
    const realP = QRCode.toString('hello', { type: 'svg' });
    const shimP = shim.toString('hello');
    expect(typeof realP.then).toBe('function');
    expect(typeof shimP.then).toBe('function');
    expect(typeof (await realP)).toBe('string');
    expect(typeof (await shimP)).toBe('string');
  });

  it('both toString accept (err, result) callback form', () => {
    return Promise.all([
      new Promise<void>((resolve, reject) => {
        QRCode.toString('hello', { type: 'svg' }, (err, result) => {
          if (err) return reject(err);
          expect(typeof result).toBe('string');
          resolve();
        });
      }),
      new Promise<void>((resolve, reject) => {
        shim.toString('hello', (err, result) => {
          if (err) return reject(err);
          expect(typeof result).toBe('string');
          resolve();
        });
      }),
    ]);
  });

  it('both create return a matrix-like object with dimension info', () => {
    const real = QRCode.create('hello');
    const shimQr = shim.create('hello');
    // Real has `modules.size`, our shim returns a QrMatrix with `size`.
    // Both must expose the dimension somewhere.
    expect(typeof real.modules.size).toBe('number');
    expect(typeof shimQr.size).toBe('number');
  });
});

// ---------------------------------------------------------------------------
// Matrix-level parity: same input → same dimensions
// ---------------------------------------------------------------------------

describe('matrix parity across URL lengths and error levels', () => {
  for (const url of URLS) {
    for (const level of ERROR_LEVELS) {
      it(`dimensions match for ${level}: ${url.slice(0, 40)}${url.length > 40 ? '…' : ''}`, () => {
        const real = QRCode.create(url, { errorCorrectionLevel: level });
        const shimQr = shim.create(url, { errorCorrectionLevel: level });
        expect(shimQr.size).toBe(real.modules.size);
      });
    }
  }
});

// ---------------------------------------------------------------------------
// Decodability parity: both libraries' output must decode to the input
// ---------------------------------------------------------------------------

describe('decodability parity', () => {
  for (const url of URLS) {
    it(`real node-qrcode output decodes correctly for ${url.slice(0, 40)}${url.length > 40 ? '…' : ''}`, async () => {
      const svg = await QRCode.toString(url, { type: 'svg' });
      expect(decodeSvg(svg)).toBe(url);
    });

    it(`our shim output decodes correctly for ${url.slice(0, 40)}${url.length > 40 ? '…' : ''}`, async () => {
      const svg = await shim.toString(url);
      expect(decodeSvg(svg)).toBe(url);
    });
  }
});

// ---------------------------------------------------------------------------
// Option-translation parity
// ---------------------------------------------------------------------------

describe('option translation', () => {
  it('errorCorrectionLevel: H produces a denser matrix than L for the same input', () => {
    const urlForEcc = 'https://example.com/products/widget-123';
    const low = shim.create(urlForEcc, { errorCorrectionLevel: 'L' });
    const high = shim.create(urlForEcc, { errorCorrectionLevel: 'H' });
    // H requires more error-correction bytes → needs same or larger QR.
    expect(high.size).toBeGreaterThanOrEqual(low.size);
  });

  it('color.dark override is applied in the output SVG', async () => {
    const svg = await shim.toString('hello', {
      color: { dark: '#ff0000' },
    });
    expect(svg).toContain('#ff0000');
  });

  it('color.light override replaces both the finder middle and adds a background', async () => {
    const svg = await shim.toString('hello', {
      color: { light: '#eeeeee' },
    });
    expect(svg).toContain('#eeeeee');
    // Background rect added when light is non-transparent
    expect(svg).toMatch(/<rect width="\d+" height="\d+" fill="#eeeeee"\/>/);
  });

  it('output with identical options decodes to the same URL regardless of shim vs real', async () => {
    const url = 'https://verevoir.io';
    const opts = { errorCorrectionLevel: 'M' as const };
    const realSvg = await QRCode.toString(url, { type: 'svg', ...opts });
    const shimSvg = await shim.toString(url, opts);
    expect(decodeSvg(realSvg)).toBe(url);
    expect(decodeSvg(shimSvg)).toBe(url);
  });
});

// ---------------------------------------------------------------------------
// Callback error-path parity
// ---------------------------------------------------------------------------

describe('callback error paths', () => {
  it('our shim invokes callback with Error on malformed input (large payload at H)', () => {
    // Forcing H on an extremely long payload exceeds the QR capacity.
    const tooBig = 'x'.repeat(10000);
    return new Promise<void>((resolve) => {
      shim.toString(tooBig, { errorCorrectionLevel: 'H' }, (err) => {
        expect(err).toBeInstanceOf(Error);
        resolve();
      });
    });
  });
});
