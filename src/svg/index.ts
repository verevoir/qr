import type {
  QrMatrix,
  SvgOptions,
  SvgStyle,
  CornerStyle,
  LineWidth,
} from '../types.js';
import { wrapSvg } from './shared.js';
import { renderCorners } from './corners.js';
import { renderSquare } from './square.js';
import { renderDots } from './dots.js';
import { renderHorizontal } from './horizontal.js';
import { renderVertical } from './vertical.js';
import { renderDiagonal } from './diagonal.js';
import { renderGrid } from './grid.js';
import { renderTubemap } from './tubemap.js';

export function toSvg(qr: QrMatrix, options?: SvgOptions): string {
  const style: SvgStyle = options?.style ?? 'square';
  const cornerStyle: CornerStyle = options?.cornerStyle ?? 'rounded';
  const lineWidth: LineWidth = options?.lineWidth ?? 'normal';
  const layers = options?.layers ?? false;

  let content = '';

  // Corner patterns (finder + alignment)
  content += renderCorners(qr, cornerStyle);

  // Timing patterns (row 6 and col 6 between finders)
  // Dots renderer handles its own timing marks, so skip for dots.
  if (style !== 'dots') {
    content += renderTimingPatterns(qr);
  }

  // Data modules in the chosen style
  switch (style) {
    case 'dots':
      content += renderDots(qr, layers, 'thin');
      break;
    case 'horizontal':
      content += renderHorizontal(qr, lineWidth);
      break;
    case 'vertical':
      content += renderVertical(qr, lineWidth);
      break;
    case 'diagonal':
      content += renderDiagonal(qr, lineWidth);
      break;
    case 'grid':
      content += renderGrid(qr);
      break;
    case 'tubemap':
      content += renderTubemap(qr, lineWidth);
      break;
    case 'square':
    default:
      content += renderSquare(qr);
      break;
  }

  return wrapSvg(qr.size, content, layers);
}

/**
 * Render timing pattern modules between the finder regions.
 * Row 6 (horizontal) and column 6 (vertical), only the portions
 * between the 9-module finder+separator blocks.
 */
function renderTimingPatterns(qr: QrMatrix): string {
  const size = qr.size;
  let out = '';

  // Horizontal timing (row 6, cols 8 to size-9)
  for (let col = 8; col < size - 8; col++) {
    if (qr.matrix[6][col] === 1) {
      out += `<rect x="${col + 1}" y="${7}" width="1" height="1" fill="#000"/>`;
    }
  }

  // Vertical timing (col 6, rows 8 to size-9)
  for (let row = 8; row < size - 8; row++) {
    if (qr.matrix[row][6] === 1) {
      out += `<rect x="${7}" y="${row + 1}" width="1" height="1" fill="#000"/>`;
    }
  }

  return out;
}
