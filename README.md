# @verevoir/qr

QR code encoding engine and SVG renderers. Multiple visual styles, fabrication-ready layers, multi-candidate mask selection. Zero runtime dependencies.

## Styles

<p>
  <img src="docs/style-square.svg" width="130" alt="Square style">
  <img src="docs/style-dots.svg" width="130" alt="Dots style">
  <img src="docs/style-horizontal.svg" width="130" alt="Horizontal style">
  <img src="docs/style-diagonal.svg" width="130" alt="Diagonal style">
  <img src="docs/style-metro.svg" width="130" alt="Metro style">
</p>

## What It Does

- **Encode** — text to QR matrix, versions 1–40, error correction levels L/M/Q/H, numeric/alphanumeric/byte modes
- **Multi-candidate** — returns multiple mask variants above a quality threshold so you can choose aesthetically, not just technically
- **SVG rendering** — eight visual styles, three corner treatments, two line widths, optional layer separation for fabrication
- **PNG export** — browser-only `svgToPng()` renders via canvas, `downloadPng()` triggers a file download

## Install

```bash
npm install @verevoir/qr
```

## Quick Example

```typescript
import { encode, toSvg } from '@verevoir/qr';

// Encode text — returns multiple mask candidates
const results = encode('https://example.com');

// Render the first candidate as SVG
const svg = toSvg(results[0], {
  style: 'dots',
  cornerStyle: 'rounded',
});

// svg is a complete SVG string — write to file, set as innerHTML, etc.
```

### Choosing a Style

```typescript
import { encode, toSvg } from '@verevoir/qr';
import type { SvgStyle } from '@verevoir/qr';

const results = encode('https://example.com');
const qr = results[0];

// All eight styles from the same QR data
const styles: SvgStyle[] = [
  'square',
  'dots',
  'horizontal',
  'vertical',
  'diagonal',
  'grid',
  'tubemap',
  'metro',
];

for (const style of styles) {
  const svg = toSvg(qr, { style, cornerStyle: 'round' });
  // Each produces a distinct visual treatment of the same data
}
```

### Fabrication Layers

```typescript
import { encode, toSvg } from '@verevoir/qr';

const results = encode('https://example.com');
const svg = toSvg(results[0], { style: 'dots', layers: true });

// SVG contains separate <g id="dark">, <g id="light">, <g id="background"> groups
// Export each layer independently for 3D printing, laser cutting, or CNC engraving
```

### PNG Export (Browser)

```typescript
import { encode, toSvg, svgToPng, downloadPng } from '@verevoir/qr';

const svg = toSvg(encode('https://example.com')[0], { style: 'square' });

// Get a PNG blob
const blob = await svgToPng(svg, { size: 1024 });

// Or trigger a file download directly
await downloadPng(svg, { size: 1024, filename: 'qr-code.png' });
```

## API

### Encoding

| Export                   | Description                                                                                          |
| ------------------------ | ---------------------------------------------------------------------------------------------------- |
| `encode(text, options?)` | Encode text into QR matrix. Returns `QrResult[]` — multiple mask candidates sorted by penalty score. |

### Rendering

| Export                       | Description                                             |
| ---------------------------- | ------------------------------------------------------- |
| `toSvg(qrResult, options?)`  | Render a QR result as an SVG string.                    |
| `svgToPng(svg, options?)`    | Convert SVG string to PNG blob (browser only).          |
| `downloadPng(svg, options?)` | Render to PNG and trigger file download (browser only). |

### Options

| Type          | Values                                                                               | Default    |
| ------------- | ------------------------------------------------------------------------------------ | ---------- |
| `SvgStyle`    | `'square'` \| `'dots'` \| `'horizontal'` \| `'vertical'` \| `'diagonal'` \| `'grid'` \| `'tubemap'` \| `'metro'` | `'square'` |
| `CornerStyle` | `'square'` \| `'rounded'` \| `'round'`                                               | `'square'` |
| `LineWidth`   | `'normal'` \| `'thin'`                                                               | `'normal'` |
| `ErrorLevel`  | `'L'` \| `'M'` \| `'Q'` \| `'H'`                                                     | `'L'`      |

### SVG Styles

| Style        | Description                                           |
| ------------ | ----------------------------------------------------- |
| `square`     | Filled rectangles per module                          |
| `dots`       | Dark and light circles on separate layers             |
| `horizontal` | Horizontal line segments for consecutive dark modules |
| `vertical`   | Vertical line segments for consecutive dark modules   |
| `diagonal`   | Diagonal line segments in both directions             |
| `grid`       | Connected dark regions traced as filled outline paths |
| `tubemap`    | Diagonal-first lines, then horizontal and vertical   |
| `metro`      | Horizontal over vertical over diagonal layered lines  |

## Architecture

| File            | Responsibility                                                              |
| --------------- | --------------------------------------------------------------------------- |
| `src/types.ts`  | Public interfaces: QrResult, SvgOptions, EncodeOptions                      |
| `src/galois.ts` | GF(256) arithmetic, Reed-Solomon error correction                           |
| `src/data.ts`   | Encoding modes, data codewords, EC interleaving, version selection          |
| `src/matrix.ts` | QR matrix construction, module placement, format/version info               |
| `src/mask.ts`   | Mask evaluation, penalty scoring, multi-candidate ranking                   |
| `src/encode.ts` | Top-level `encode()` entry point                                            |
| `src/svg/`      | SVG renderers (square, dots, horizontal, vertical, diagonal, grid, corners) |
| `src/png.ts`    | PNG export via browser canvas                                               |

## Design Decisions

- **Multi-candidate output.** Most QR libraries return a single "best" result. This engine returns all masks within a quality threshold because aesthetic preferences are subjective and context-dependent.
- **Vector-only output.** SVG only — no bitmap generation. QR codes are inherently grid-based; vector output scales perfectly for print, screen, and fabrication.
- **Fabrication-ready layers.** The dots renderer emits dark, light, and background as separate SVG `<g>` groups. This enables direct use in laser cutting, CNC engraving, and 3D printing workflows.
- **Connected-component grid renderer.** The grid style uses flood-fill to identify connected dark regions and traces their boundaries as filled paths — clean outlines, not overlapping lines.
- **Zero runtime dependencies.** Pure TypeScript. GF(256) arithmetic, Reed-Solomon encoding, and all rendering is self-contained.

## Acknowledgements

The encoding engine was built with the help of Massimo Artizzu's excellent ["Let's Develop a QR Code Generator"](https://dev.to/maxart2501/let-s-develop-a-qr-code-generator-part-i-basic-concepts-510a) series on Dev.to, which walks through the QR specification from first principles.

## Documentation

- [QR & Link Tracking](https://verevoir.io/docs/qr) — encoding, rendering, link tracking, and integration patterns

## Development

```bash
npm install    # Install dependencies
make build     # Compile TypeScript
make test      # Run test suite
make lint      # Check formatting
```
