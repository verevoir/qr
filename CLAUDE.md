# @verevoir/qr — QR Code Engine

QR code encoding engine and SVG renderers. Turns text into scannable QR codes with multiple visual styles. Zero runtime dependencies.

## What It Does

- **Encode** — text to QR matrix. Supports versions 1-40, error correction levels L/M/Q/H, numeric/alphanumeric/byte encoding modes.
- **Multi-candidate** — returns multiple mask variants above a quality threshold (default: within 30% of best penalty score) so consumers can pick aesthetically.
- **SVG rendering** — ten visual styles, three corner styles, line width options, optional layer separation for 3D printing/laser cutting.
- **PNG export** — browser-only `svgToPng()` renders SVG to PNG via canvas. `downloadPng()` convenience helper triggers a file download. Zero dependencies — uses native browser APIs.

## SVG Styles

| Style | Description |
|-------|-------------|
| `square` | Simple filled squares per module (default) |
| `dots` | Small round dots — both dark and light on separate layers |
| `horizontal` | Horizontal line segments for consecutive dark modules |
| `vertical` | Vertical line segments for consecutive dark modules |
| `diagonal` | Diagonal line segments (both `\` and `/` directions) |
| `grid` | Connected dark regions traced as filled outline paths |
| `lines` | Diagonal-first tubemap-style paths, then horizontal and vertical |
| `metro` | Horizontal over vertical over diagonal layered lines |
| `scribble` | Connected component walking with diagonal zigzag and bezier-smoothed turns |
| `scribble-alt` | Connected component walking with horizontal zigzag and angular turns |

## Corner Styles

- `square` — sharp-cornered rectangles
- `rounded` — rounded stroke paths (default)
- `round` — circular finder and alignment patterns

## Setup

```bash
npm install
```

## Commands

- `make build` — compile TypeScript (ESM + CJS + .d.ts)
- `make test` — run vitest
- `make lint` — eslint + prettier check

## Architecture

- `src/galois.ts` — GF(256) arithmetic, Reed-Solomon error correction
- `src/data.ts` — encoding modes, data codewords, EC interleaving, version selection
- `src/matrix.ts` — QR matrix construction, module placement, format/version info
- `src/mask.ts` — mask evaluation, penalty scoring, multi-candidate ranking
- `src/encode.ts` — top-level `encode()` entry point
- `src/svg/` — SVG renderers (square, dots, horizontal, vertical, diagonal, grid, lines, metro, scribble, scribble-alt, corners)
- `src/png.ts` — PNG export via browser canvas (`svgToPng`, `downloadPng`)
- `src/types.ts` — public type definitions

## Dependencies

Zero runtime dependencies. Pure TypeScript.

## Acknowledgements

The encoding engine was built with the help of Massimo Artizzu's excellent ["Let's Develop a QR Code Generator"](https://dev.to/maxart2501/let-s-develop-a-qr-code-generator-part-i-basic-concepts-510a) series on Dev.to, which walks through the QR specification from first principles.
