import type { QrMatrix, CornerStyle } from '../types.js';
import { renderCorners } from './corners.js';
import { traceUniform, cellKey } from './trace.js';
import type { CellKey, CellSet } from './trace.js';
import { render } from './render.js';

// ---------------------------------------------------------------------------
// Public treatment API
// ---------------------------------------------------------------------------

/** How 90° corners on connected regions are rendered. */
export type CornerTreatment = 'sharp' | 'rounded';

/**
 * Composable visual treatment for the data-module layer.
 *
 * - `corners` — how miter corners are drawn. Default `'sharp'`.
 * - `inset` — inward offset from the true module edge, in module
 *   units. `0` fills each cell fully; `0.05` fills ~90% (equivalent
 *   to the old `stroke-width: 0.9`); `0.175` fills ~65% (thin).
 *   Default `0`.
 * - `diagonal` — when `true`, cells that share only a corner count as
 *   connected and a small 0.125-module chamfer at each saddle corner
 *   gives the outline a crystalline, linked appearance. Default
 *   `false`.
 */
export interface TreatmentOptions {
  corners?: CornerTreatment;
  inset?: number;
  diagonal?: boolean;
}

/**
 * Sharp corners, no inset — fully-filled cells with crisp 90° joins.
 * The successor to the v1 `metro` style.
 */
export const SHARP: TreatmentOptions = { corners: 'sharp', inset: 0 };

/**
 * Rounded corners, no inset — fully-filled cells with smoothed joins.
 * The successor to the v1 `grid` style.
 */
export const ROUNDED: TreatmentOptions = { corners: 'rounded', inset: 0 };

/**
 * Sharp corners + diagonal-touch chamfering. Cells that meet only at a
 * corner are visually linked by a small 45° bevel at each saddle.
 */
export const SHARP_DIAGONAL: TreatmentOptions = {
  corners: 'sharp',
  inset: 0,
  diagonal: true,
};

/**
 * Rounded corners + diagonal-touch chamfering.
 */
export const ROUNDED_DIAGONAL: TreatmentOptions = {
  corners: 'rounded',
  inset: 0,
  diagonal: true,
};

export interface OutlineOptions {
  /**
   * Visual style of the finder patterns (the three large corner squares).
   * Defaults to `'rounded'`.
   */
  cornerStyle?: CornerStyle;
  /**
   * Visual treatment applied to all data modules and alignment patterns.
   * Defaults to `SHARP` (sharp corners, no inset, no diagonal).
   */
  treatment?: TreatmentOptions;
}

/**
 * Render a QR matrix using the two-layer trace + render pipeline.
 *
 * The data modules go through `traceUniform` (the Stage 8 faithful
 * tracer — no creative Stage 3–7 shape reinterpretations, so QR
 * cells render cells-exactly at `offset: 0`) and then `render`,
 * which inflates each path edge outward by the requested offset.
 *
 * The finder patterns are rendered separately by `renderCorners`
 * because they always want an identifiable three-square look that's
 * independent of the data-module treatment.
 *
 * Produces an SVG with two named groups so consumers can target
 * each layer independently with CSS or downstream tooling:
 *
 * - `<g id="finder">` — the three finder patterns (`cornerStyle`)
 * - `<g id="data">` — data modules + alignment patterns (`treatment`)
 *
 * Alignment patterns are part of the data group so they pick up the
 * same treatment as surrounding modules.
 */
export function toSvgOutline(
  qr: QrMatrix,
  options: OutlineOptions = {},
): string {
  const cornerStyle = options.cornerStyle ?? 'rounded';
  const treatment = options.treatment ?? SHARP;
  const diagonals = treatment.diagonal ?? false;
  // Treatment.inset shrinks the rendered shape inward by that much on
  // each side; the new per-edge offset is outward-positive, so we
  // negate. `inset: 0` → `offset: 0` → cells-exactly.
  const offset = -(treatment.inset ?? 0);
  const corners = treatment.corners ?? 'sharp';

  // Finder patterns unchanged from the previous pipeline — pass a view
  // with no alignment coordinates so renderCorners ignores them.
  const finderOnlyQr: QrMatrix = { ...qr, alignmentCoordinates: [] };
  const finderContent = renderCorners(finderOnlyQr, cornerStyle);

  // Data modules + alignment patterns via trace + render. At each
  // saddle corner, a tiny 0.125-module chamfer trims the two filled
  // cells — the visual "diagonal connection" lives in that narrow
  // bevel, leaving the empty cells between them still empty so QR
  // scanners see the correct module pattern.
  const cells = buildDataCellSet(qr);
  const paths = traceUniform(cells, {
    diagonals,
    saddleNotch: diagonals ? 0.125 : 0,
  });
  const pathData = render(paths, {
    offset,
    corners,
    translate: [1, 1], //                      1-module padding inside the viewBox
  });
  // `evenodd` rather than the SVG default `nonzero`: when adjacent
  // saddle chamfers produce short overlapping edge fragments on the
  // same cell face, `evenodd` cancels them out correctly. The
  // trade-off is that outer-CW + inner-CCW holes would also punch
  // through — but our trace emits both outer and inner loops as CW
  // for chained `buildBoundaryEdges` output; `evenodd` happens to
  // still punch holes correctly in that case via crossing counts.
  const dataContent = pathData
    ? `<path d="${pathData}" fill="#000" fill-rule="evenodd"/>`
    : '';

  const viewSize = qr.size + 2;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewSize} ${viewSize}">` +
    `<g id="finder">${finderContent}</g>` +
    `<g id="data">${dataContent}</g>` +
    `</svg>`
  );
}

/**
 * Collect every dark data module (and alignment module) into a
 * `CellSet`, excluding the three 7×7 finder regions which are
 * rendered separately.
 */
function buildDataCellSet(qr: QrMatrix): CellSet {
  const { size, matrix, finderCoordinates } = qr;
  const excluded = new Set<string>();
  for (const [fr, fc] of finderCoordinates) {
    for (let r = fr; r < Math.min(fr + 7, size); r++) {
      for (let c = fc; c < Math.min(fc + 7, size); c++) {
        excluded.add(`${r},${c}`);
      }
    }
  }
  const cells = new Set<CellKey>();
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (matrix[r][c] === 1 && !excluded.has(`${r},${c}`)) {
        cells.add(cellKey(r, c));
      }
    }
  }
  return cells;
}
