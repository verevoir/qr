import { describe, it, expect } from 'vitest';
import { encode } from '../src/index.js';

describe('encode', () => {
  it('encodes a simple URL', () => {
    const results = encode('https://verevoir.io');
    expect(results.length).toBeGreaterThan(0);
    const best = results[0];
    expect(best.version).toBeGreaterThanOrEqual(1);
    expect(best.version).toBeLessThanOrEqual(40);
    expect(best.penalty).toBeGreaterThanOrEqual(0);
    expect(best.maskIndex).toBeGreaterThanOrEqual(0);
    expect(best.maskIndex).toBeLessThan(8);
  });

  it('returns multiple candidates sorted by penalty', () => {
    const results = encode('https://example.com/test');
    expect(results.length).toBeGreaterThanOrEqual(1);
    for (let i = 1; i < results.length; i++) {
      expect(results[i].penalty).toBeGreaterThanOrEqual(results[i - 1].penalty);
    }
  });

  it('filters candidates by threshold', () => {
    const all = encode('HELLO', { threshold: Infinity });
    expect(all.length).toBe(8); // all masks pass infinite threshold

    const strict = encode('HELLO', { threshold: all[0].penalty });
    expect(strict.length).toBe(1); // only the best
  });

  it('respects minimum error level', () => {
    const resultL = encode('test', { minErrorLevel: 'L' });
    const resultH = encode('test', { minErrorLevel: 'H' });
    // H level should have at least as high a version for the same content
    expect(resultH[0].version).toBeGreaterThanOrEqual(resultL[0].version);
  });

  describe('boostErrorCorrection', () => {
    it('always produces H-level error correction', () => {
      const results = encode('https://example.com', { boostErrorCorrection: true });
      expect(results[0].errorLevel).toBe('H');
    });

    it('is equivalent to minErrorLevel H', () => {
      const boosted = encode('https://example.com', { boostErrorCorrection: true });
      const explicit = encode('https://example.com', { minErrorLevel: 'H' });
      expect(boosted[0].version).toBe(explicit[0].version);
      expect(boosted[0].errorLevel).toBe(explicit[0].errorLevel);
    });

    it('may use a larger version than the default to achieve H level', () => {
      // Find text that fits in a smaller version at L/M but needs a larger one
      // for H. The long URL requires more capacity; with boost it may step up.
      const defaultResult = encode('https://tickets.example.com/e/summer-conf-2026?src=qr&medium=badge');
      const boostedResult = encode('https://tickets.example.com/e/summer-conf-2026?src=qr&medium=badge', {
        boostErrorCorrection: true,
      });
      expect(boostedResult[0].errorLevel).toBe('H');
      expect(boostedResult[0].version).toBeGreaterThanOrEqual(defaultResult[0].version);
    });
  });

  it('produces a square matrix', () => {
    const [result] = encode('QR');
    expect(result.matrix.length).toBe(result.size);
    for (const row of result.matrix) {
      expect(row.length).toBe(result.size);
    }
  });

  it('matrix size matches version formula', () => {
    const [result] = encode('A');
    expect(result.size).toBe(result.version * 4 + 17);
  });

  it('combined matrix has finder pattern corners', () => {
    const [result] = encode('test');
    const s = result.size;
    // Top-left finder: 7x7 block starting at [0,0]
    expect(result.matrix[0][0]).toBe(1);
    expect(result.matrix[0][6]).toBe(1);
    expect(result.matrix[6][0]).toBe(1);
    expect(result.matrix[6][6]).toBe(1);
    // Top-right
    expect(result.matrix[0][s - 1]).toBe(1);
    expect(result.matrix[0][s - 7]).toBe(1);
    // Bottom-left
    expect(result.matrix[s - 1][0]).toBe(1);
    expect(result.matrix[s - 7][0]).toBe(1);
  });

  it('uses alphanumeric mode for uppercase', () => {
    const [result] = encode('HELLO WORLD');
    expect(result.errorLevel).toBeDefined();
    // Alphanumeric is more efficient than byte
    expect(result.version).toBe(1);
  });

  it('throws for content that is too large', () => {
    const huge = 'A'.repeat(5000);
    expect(() => encode(huge)).toThrow('content is too large');
  });

  it('handles empty string', () => {
    const results = encode('');
    expect(results.length).toBeGreaterThan(0);
  });
});
