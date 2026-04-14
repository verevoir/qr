import { describe, it, expect } from 'vitest';
import { svgToPng, downloadPng } from '../src/web.js';
import type { PngOptions } from '../src/web.js';

describe('svgToPng', () => {
  it('is exported as a function', () => {
    expect(typeof svgToPng).toBe('function');
  });

  it('throws for empty svgString', () => {
    expect(() => svgToPng('', 100)).toThrow(
      'svgString must be a non-empty string',
    );
  });

  it('throws for non-string svgString', () => {
    expect(() => svgToPng(null as unknown as string, 100)).toThrow(
      'svgString must be a non-empty string',
    );
    expect(() => svgToPng(undefined as unknown as string, 100)).toThrow(
      'svgString must be a non-empty string',
    );
    expect(() => svgToPng(42 as unknown as string, 100)).toThrow(
      'svgString must be a non-empty string',
    );
  });

  it('throws for non-positive size', () => {
    expect(() => svgToPng('<svg></svg>', 0)).toThrow(
      'size must be a positive finite number',
    );
    expect(() => svgToPng('<svg></svg>', -1)).toThrow(
      'size must be a positive finite number',
    );
  });

  it('throws for non-finite size', () => {
    expect(() => svgToPng('<svg></svg>', NaN)).toThrow(
      'size must be a positive finite number',
    );
    expect(() => svgToPng('<svg></svg>', Infinity)).toThrow(
      'size must be a positive finite number',
    );
  });

  it('throws in Node environment (no document/Image)', () => {
    expect(() => svgToPng('<svg></svg>', 100)).toThrow(
      'requires a browser environment',
    );
  });
});

describe('downloadPng', () => {
  it('is exported as a function', () => {
    expect(typeof downloadPng).toBe('function');
  });
});

describe('PngOptions type', () => {
  it('is a valid type with size property', () => {
    const options: PngOptions = { size: 512 };
    expect(options.size).toBe(512);
  });
});
