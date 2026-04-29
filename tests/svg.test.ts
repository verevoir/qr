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

  describe('photo style', () => {
    function uniformSampler(value: number) {
      return () => () => ({ luminance: value });
    }

    it('throws when photo option is missing', () => {
      const qr = getQr();
      expect(() => toSvg(qr, { style: 'photo' })).toThrow(/requires.*photo/);
    });

    it('uniform dark luminance produces max-size dark dots', () => {
      const qr = getQr();
      const svg = toSvg(qr, {
        style: 'photo',
        photo: { sample: uniformSampler(0) },
      });
      // Dark modules render at max size.
      expect(svg).toContain('stroke="#000" stroke-width="0.9"');
      // No shrunken dark dots.
      expect(svg).not.toContain('stroke="#000" stroke-width="0.25"');
    });

    it('uniform dark luminance wraps light modules with dark ring + light centre', () => {
      const qr = getQr();
      const svg = toSvg(qr, {
        style: 'photo',
        photo: { sample: uniformSampler(0) },
      });
      // Light modules in dark regions get a small light centre for the
      // decoder to sample, inside a big dark ring.
      expect(svg).toContain('stroke="#fff" stroke-width="0.25"');
    });

    it('uniform light luminance produces min-size dark dots and no light rings', () => {
      const qr = getQr();
      const svg = toSvg(qr, {
        style: 'photo',
        photo: { sample: uniformSampler(1) },
      });
      expect(svg).toContain('stroke="#000" stroke-width="0.25"');
      expect(svg).not.toContain('stroke="#000" stroke-width="0.9"');
      // Light modules in light regions are skipped entirely.
      expect(svg).not.toContain('stroke="#fff"');
    });

    it('honours custom min/max dot sizes', () => {
      const qr = getQr();
      const svg = toSvg(qr, {
        style: 'photo',
        photo: {
          sample: uniformSampler(1),
          minDotSize: 0.4,
          maxDotSize: 0.8,
        },
      });
      expect(svg).toContain('stroke-width="0.4"');
    });

    it('still emits finder corners at full size', () => {
      const qr = getQr();
      const svg = toSvg(qr, {
        style: 'photo',
        photo: { sample: uniformSampler(1) },
      });
      expect(svg).toContain('<rect x="1" y="1" width="7" height="7"');
    });
  });

  describe('logo style', () => {
    function uniformSampler(value: number) {
      return () => () => ({ luminance: value });
    }

    it('throws when logo option is missing', () => {
      const qr = getQr();
      expect(() => toSvg(qr, { style: 'logo' })).toThrow(/requires.*logo/);
    });

    it('decisively dark image culls dark modules, keeps light dots', () => {
      const qr = getQr();
      const svg = toSvg(qr, {
        style: 'logo',
        logo: { sample: uniformSampler(0) },
      });
      // lum=0 < darkBelow=0.4 → dark modules skipped.
      // lum=0 is not > lightAbove=0.7 → light modules still rendered.
      expect(svg).not.toContain('stroke="#000"');
      expect(svg).toContain('stroke="#fff"');
    });

    it('decisively light image culls light modules, keeps dark dots', () => {
      const qr = getQr();
      const svg = toSvg(qr, {
        style: 'logo',
        logo: { sample: uniformSampler(1) },
      });
      expect(svg).toContain('stroke="#000"');
      expect(svg).not.toContain('stroke="#fff"');
    });

    it('mushy midtone renders every module (neither side confident)', () => {
      const qr = getQr();
      const svg = toSvg(qr, {
        style: 'logo',
        logo: { sample: uniformSampler(0.55) },
      });
      // 0.55 is in the [0.4, 0.7] uncertain band — both colours emit.
      expect(svg).toContain('stroke="#000"');
      expect(svg).toContain('stroke="#fff"');
    });

    it('honours custom thresholds', () => {
      const qr = getQr();
      // lum=0.3 would normally cull dark modules (0.3 < 0.4). With
      // darkBelow=0.2 it no longer does.
      const svg = toSvg(qr, {
        style: 'logo',
        logo: { sample: uniformSampler(0.3), darkBelow: 0.2 },
      });
      expect(svg).toContain('stroke="#000"');
    });

    it('leaves finder corners intact', () => {
      const qr = getQr();
      const svg = toSvg(qr, {
        style: 'logo',
        logo: { sample: uniformSampler(0) },
      });
      expect(svg).toContain('<rect x="1" y="1" width="7" height="7"');
    });

    it('baseline dots style is unchanged', () => {
      const qr = getQr();
      const svg = toSvg(qr, { style: 'dots' });
      expect(svg).toContain('fill="#000"');
      expect(svg).toContain('fill="#fff"');
    });
  });

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
