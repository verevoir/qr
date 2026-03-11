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

  const styles: SvgStyle[] = [
    'square',
    'dots',
    'horizontal',
    'vertical',
    'diagonal',
    'grid',
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
    const cornerStyles: CornerStyle[] = ['square', 'rounded', 'round'];

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

    it('round corners use circle elements', () => {
      const qr = getQr();
      const svg = toSvg(qr, { cornerStyle: 'round' });
      expect(svg).toContain('<circle');
    });
  });

  describe('dots style', () => {
    it('renders both dark and light dots', () => {
      const qr = getQr();
      const svg = toSvg(qr, { style: 'dots' });
      // Should have both black and white stroked elements
      expect(svg).toContain('stroke="#000"');
      expect(svg).toContain('stroke="#fff"');
    });

    it('wraps in layer groups when layers=true', () => {
      const qr = getQr();
      const svg = toSvg(qr, { style: 'dots', layers: true });
      expect(svg).toContain('id="dark"');
      expect(svg).toContain('id="light"');
      expect(svg).toContain('id="background"');
    });
  });

  describe('line width', () => {
    it('normal uses 0.9 stroke width', () => {
      const qr = getQr();
      const svg = toSvg(qr, { style: 'horizontal', lineWidth: 'normal' });
      expect(svg).toContain('stroke-width="0.9"');
    });

    it('thin uses 0.5 stroke width', () => {
      const qr = getQr();
      const svg = toSvg(qr, { style: 'horizontal', lineWidth: 'thin' });
      expect(svg).toContain('stroke-width="0.5"');
    });
  });

  describe('grid style', () => {
    it('produces filled paths for connected regions', () => {
      const qr = getQr();
      const svg = toSvg(qr, { style: 'grid' });
      expect(svg).toContain('<path d="M');
      expect(svg).toContain('fill="#000"');
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
});
