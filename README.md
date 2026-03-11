# @verevoir/qr

Text to QR code in TypeScript. Eight SVG styles, zero dependencies.

## Styles

There are a number fo style variations but these are some examples.
| squares | dots<br />(photo overlay) | horizontal | diagonal | metro |
| --- | --- | --- | --- | --- |
| squares<br /><img src="docs/style-square.svg" width="130" alt="Square style"> | <img src="docs/style-dots.svg" width="130" alt="Square style"> | <img src="docs/style-horizontal.svg" width="130" alt="Horizontal style"> | <img src="docs/style-diagonal.svg" width="130" alt="Square style"> | <img src="docs/style-metro.svg" width="130" alt="Square style"> |

## What It Does

- **Encode** — text in, QR matrix out. Versions 1–40, all four error correction levels, auto mode selection.
- **Multiple masks** — gives you several mask variants ranked by quality, so you pick the one that looks best for your use case.
- **SVG rendering** — eight styles, three corner shapes, two line weights. Most styles output closed paths directly.
- **PNG export** — `svgToPng()` and `downloadPng()` for browser use. No server needed.

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

| Type          | Values                                                                                                           | Default    |
| ------------- | ---------------------------------------------------------------------------------------------------------------- | ---------- |
| `SvgStyle`    | `'square'` \| `'dots'` \| `'horizontal'` \| `'vertical'` \| `'diagonal'` \| `'grid'` \| `'tubemap'` \| `'metro'` | `'square'` |
| `CornerStyle` | `'square'` \| `'rounded'` \| `'round'`                                                                           | `'square'` |
| `LineWidth`   | `'normal'` \| `'thin'`                                                                                           | `'normal'` |
| `ErrorLevel`  | `'L'` \| `'M'` \| `'Q'` \| `'H'`                                                                                 | `'L'`      |

### SVG Styles

| Style        | Description                                           |
| ------------ | ----------------------------------------------------- |
| `square`     | Filled rectangles per module                          |
| `dots`       | Dark and light circles on separate layers             |
| `horizontal` | Horizontal line segments for consecutive dark modules |
| `vertical`   | Vertical line segments for consecutive dark modules   |
| `diagonal`   | Diagonal line segments in both directions             |
| `grid`       | Connected dark regions traced as filled outline paths |
| `tubemap`    | Diagonal-first lines, then horizontal and vertical    |
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

- **Multiple masks, not just one.** Most QR libraries pick the "best" mask for you. This one gives you all the good options — what looks best depends on the style and context.
- **SVG only.** QR codes are grids — vectors scale perfectly. No bitmap rendering built in (use the browser PNG export if you need pixels).
- **Outline tracing.** The square and grid styles trace connected regions as single paths rather than individual rectangles. Cleaner SVG, works in CAD tools without conversion.
- **Layer separation.** The dots renderer outputs dark and light as separate `<g id="dark">` / `<g id="light">` groups.
- **No dependencies.** Everything — GF(256) maths, Reed-Solomon, rendering — is self-contained TypeScript.

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
