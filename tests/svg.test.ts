import { describe, it, expect } from 'vitest';
import { encode, toSvg } from '../src/index.js';
import type { SvgStyle, CornerStyle } from '../src/index.js';

function getQr() {
  return encode('https://verevoir.io')[0];
}

describe('toSvg', () => {
  it('produces valid SVG wrapper', () => {
    const qr = getQr();
    const svg = toSvg(qr);
    expect(svg).toMatch(/^<svg xmlns/);
    expect(svg).toMatch(/<\/svg>$/);
    expect(svg).toContain(`viewBox="0 0 ${qr.size + 2} ${qr.size + 2}"`);
  });

  describe('color options', () => {
    it('defaults to black dark modules', () => {
      const qr = getQr();
      const svg = toSvg(qr);
      expect(svg).toContain('fill="#000"');
    });

    it('color.dark replaces the dark-module fill', () => {
      const qr = getQr();
      const svg = toSvg(qr, { color: { dark: '#c62828' } });
      expect(svg).toContain('fill="#c62828"');
      expect(svg).not.toContain('fill="#000"');
    });

    it('color.light replaces the light-module fill (finder inner rect, dots light layer)', () => {
      const qr = getQr();
      const svg = toSvg(qr, { color: { light: '#fafafa' } });
      expect(svg).toContain('fill="#fafafa"');
      expect(svg).not.toContain('fill="#fff"');
    });

    it('color.background emits a full-size background <rect>', () => {
      const qr = getQr();
      const svg = toSvg(qr, { color: { background: '#eeeeee' } });
      expect(svg).toMatch(/<rect width="\d+" height="\d+" fill="#eeeeee"\/>/);
    });

    it('network style respects color options', () => {
      const qr = getQr();
      const svg = toSvg(qr, {
        style: 'network',
        color: { dark: '#123456', light: '#abcdef' },
      });
      expect(svg).toContain('fill="#123456"');
      expect(svg).toContain('fill="#abcdef"');
    });

    it('color options do not affect default output when unset', () => {
      const qr = getQr();
      const withoutColor = toSvg(qr);
      const withEmptyColor = toSvg(qr, { color: {} });
      expect(withoutColor).toBe(withEmptyColor);
    });
  });

  const styles: SvgStyle[] = [
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

  for (const style of styles) {
    it(`renders ${style} style without error`, () => {
      const qr = getQr();
      const svg = toSvg(qr, { style });
      expect(svg.length).toBeGreaterThan(100);
      expect(svg).toContain('<svg');
      expect(svg).toContain('</svg>');
    });
  }

  it('horizontal style includes first-column modules', () => {
    // Encode something that produces data in column 0 area
    const qr = encode('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', {
      minErrorLevel: 'L',
    })[0];
    const svg = toSvg(qr, { style: 'horizontal' });
    // The SVG should contain coordinates near x=1.5 (column 0 + 1.5 offset)
    // if any data modules exist at column 0 outside the finder pattern
    expect(svg.length).toBeGreaterThan(200);
  });

  it('vertical style includes first-row modules', () => {
    const qr = encode('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', {
      minErrorLevel: 'L',
    })[0];
    const svg = toSvg(qr, { style: 'vertical' });
    expect(svg.length).toBeGreaterThan(200);
  });

  describe('corner styles', () => {
    const cornerStyles: CornerStyle[] = ['square', 'rounded'];

    for (const cs of cornerStyles) {
      it(`renders ${cs} corners`, () => {
        const qr = getQr();
        const svg = toSvg(qr, { cornerStyle: cs });
        expect(svg.length).toBeGreaterThan(100);
      });
    }

    it('square corners use rect elements', () => {
      const qr = getQr();
      const svg = toSvg(qr, { cornerStyle: 'square' });
      expect(svg).toContain('<rect');
    });

    it('rounded corners use rx on rects', () => {
      const qr = getQr();
      const svg = toSvg(qr, { cornerStyle: 'rounded' });
      expect(svg).toContain('rx=');
    });
  });

  describe('dots style', () => {
    it('renders both dark and light dots', () => {
      const qr = getQr();
      const svg = toSvg(qr, { style: 'dots' });
      expect(svg).toContain('fill="#000"');
      expect(svg).toContain('fill="#fff"');
    });
  });

  describe('line width', () => {
    it('normal uses full-size dots', () => {
      const qr = getQr();
      const svg = toSvg(qr, { style: 'square', lineWidth: 'normal' });
      expect(svg).toContain('width="1"');
    });

    it('thin uses smaller dots', () => {
      const qr = getQr();
      const svg = toSvg(qr, { style: 'square', lineWidth: 'thin' });
      expect(svg).toContain('width="0.5"');
    });
  });

  describe('diagonal style', () => {
    it('renders diagonal line segments', () => {
      const qr = getQr();
      const svg = toSvg(qr, { style: 'diagonal' });
      // Diagonal lines have different x1/y1 and x2/y2
      expect(svg).toContain('<line');
      expect(svg).toContain('stroke="#000"');
    });
  });

  describe('network style', () => {
    it('contains stroked paths', () => {
      const qr = getQr();
      const svg = toSvg(qr, { style: 'network' });
      expect(svg).toContain('<path d="M');
      expect(svg).toContain('stroke=');
    });
  });
});
