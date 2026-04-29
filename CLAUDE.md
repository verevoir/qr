# @verevoir/qr — QR Code Engine

QR code encoding engine and SVG renderers. Turns text into scannable QR codes with multiple visual styles. Zero runtime dependencies.

## What It Does

- **Encode** — text to QR matrix. Supports versions 1-40, error correction levels L/M/Q/H, numeric/alphanumeric/byte encoding modes. `logoArea` option reserves capacity for a centre-covering logo (forces H, bumps the version).
- **Multi-candidate** — returns multiple mask variants above a quality threshold (default: within 30% of best penalty score) so consumers can pick aesthetically.
- **SVG rendering** — twelve visual styles, two corner styles, line width options, optional layer separation for 3D printing/laser cutting.
- **PNG export** — browser-only `svgToPng()` renders SVG to PNG via canvas. `downloadPng()` convenience helper triggers a file download. Zero dependencies — uses native browser APIs.

## SVG Styles

| Style        | Description                                            |
| ------------ | ------------------------------------------------------ |
| `square`     | Filled squares per module (default)                    |
| `dots`       | Round dots — dark and light on the same layer          |
| `diamonds`   | Diamond-shaped modules rotated 45°                     |
| `horizontal` | Horizontal line segments                               |
| `vertical`   | Vertical line segments                                 |
| `diagonal`   | Diagonal line segments                                 |
| `network`    | Connected traced paths with diamond tips               |
| `circuit`    | Connected traced paths with circular tips              |
| `metro`      | Layered horizontal, vertical and diagonal lines        |
| `scribble`   | Connected component walking with bezier-smoothed turns |
| `photo`      | Dot-density modulation from an image sampler — dark-dot size tracks local darkness; light modules in dark regions render as a dark ring with a light centre |
| `logo`      | Sparse dots overlaid on a composited source image — modules cull where image luminance already provides correct contrast (two-threshold rule, `lum < 0.4` / `lum > 0.7` by default, per ISO/IEC 15415) |

`photo` and `logo` require a `PhotoSampler` — a curried callback `(size) => (row, col) => { luminance, color? }`. Core library is DOM-free; `imageToSampler` in `@verevoir/qr/web` wraps any `CanvasImageSource` into a sampler. Neither style is surfaced by the `node-qrcode` shim — its API can't carry a sampler callback.

Fabrication note: `metro`, `photo`, and `logo` are the only styles that can't go directly to single-path fabrication without further processing (overlapping shapes, rings, modulation bands).

## Corner Styles

- `square` — sharp-cornered rectangles
- `rounded` — rounded stroke paths (default)

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
- `src/svg/` — SVG renderers (square, dots, diamonds, horizontal, vertical, diagonal, network, circuit, metro, scribble, photo, logo, corners)
- `src/png.ts` — PNG export via browser canvas (`svgToPng`, `downloadPng`)
- `src/types.ts` — public type definitions

## Dependencies

Zero runtime dependencies. Pure TypeScript.

## Acknowledgements

The encoding engine was built with the help of Massimo Artizzu's excellent ["Let's Develop a QR Code Generator"](https://dev.to/maxart2501/let-s-develop-a-qr-code-generator-part-i-basic-concepts-510a) series on Dev.to, which walks through the QR specification from first principles.
