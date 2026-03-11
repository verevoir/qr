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

export function toSvg(qr: QrMatrix, options?: SvgOptions): string {
  const style: SvgStyle = options?.style ?? 'square';
  const cornerStyle: CornerStyle = options?.cornerStyle ?? 'rounded';
  const lineWidth: LineWidth = options?.lineWidth ?? 'normal';
  const layers = options?.layers ?? false;

  let content = '';

  // Corner patterns (finder + alignment)
  content += renderCorners(qr, cornerStyle);

  // Data modules in the chosen style
  switch (style) {
    case 'dots':
      content += renderDots(qr, layers, lineWidth);
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
    case 'square':
    default:
      content += renderSquare(qr);
      break;
  }

  return wrapSvg(qr.size, content, layers);
}
