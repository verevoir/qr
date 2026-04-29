import type {
  QrMatrix,
  SvgOptions,
  SvgStyle,
  CornerStyle,
  LineWidth,
} from '../types.js';
import { wrapSvg } from './shared.js';
import { renderCorners } from './corners.js';
import { renderHorizontal } from './horizontal.js';
import { renderVertical } from './vertical.js';
import { renderDiagonal } from './diagonal.js';
import { renderCells, renderOutline, renderCircuit } from './outline.js';
import { renderTubemap } from './tubemap.js';
import { renderScribble } from './scribble.js';
import { renderPhoto, renderLogo } from './photo.js';

export function toSvg(qr: QrMatrix, options?: SvgOptions): string {
  const style: SvgStyle = options?.style ?? 'square';
  const cornerStyle: CornerStyle = options?.cornerStyle ?? 'rounded';
  const lineWidth: LineWidth = options?.lineWidth ?? 'normal';
  const color = options?.color;

  // Corner patterns (finder + alignment)
  let content = renderCorners(qr, cornerStyle);

  // Data modules in the chosen style.
  const dotSize = lineWidth === 'thin' ? 0.5 : 1;

  switch (style) {
    case 'square':
      content += renderCells(qr, 'square', dotSize);
      break;
    case 'dots':
      content += renderCells(qr, 'circle', dotSize, true);
      break;
    case 'diamonds':
      content += renderCells(qr, 'diamond', dotSize);
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
    case 'network':
      content += renderOutline(qr, lineWidth === 'thin' ? 0.25 : 0.5);
      break;
    case 'circuit':
      content += renderCircuit(qr, lineWidth === 'thin' ? 0.25 : 0.5);
      break;
    case 'metro':
      content += renderTubemap(qr, lineWidth);
      break;
    case 'scribble':
      content += renderScribble(qr, lineWidth);
      break;
    case 'photo':
      if (!options?.photo) {
        throw new Error("toSvg: style 'photo' requires a `photo` option");
      }
      content += renderPhoto(qr, options.photo);
      break;
    case 'logo':
      if (!options?.logo) {
        throw new Error("toSvg: style 'logo' requires a `logo` option");
      }
      content += renderLogo(qr, dotSize, options.logo);
      break;
    default:
      content += renderCells(qr, 'square', dotSize);
      break;
  }

  return wrapSvg(qr.size, content, color);
}
