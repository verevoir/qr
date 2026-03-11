import type { QrMatrix, CornerStyle } from '../types.js';

export function renderCorners(qr: QrMatrix, style: CornerStyle): string {
  let out = '';

  for (const coord of qr.finderCoordinates) {
    const x = coord[1] + 1;
    const y = coord[0] + 1;
    out += renderFinderPattern(x, y, style);
  }

  for (const coord of qr.alignmentCoordinates) {
    const x = coord[1] + 1;
    const y = coord[0] + 1;
    out += renderAlignmentPattern(x, y, style);
  }

  return out;
}

function renderFinderPattern(x: number, y: number, style: CornerStyle): string {
  switch (style) {
    case 'square':
      return renderSquareFinder(x, y);
    case 'round':
      return renderRoundFinder(x, y);
    case 'rounded':
    default:
      return renderRoundedFinder(x, y);
  }
}

function renderAlignmentPattern(
  x: number,
  y: number,
  style: CornerStyle,
): string {
  switch (style) {
    case 'square':
      return renderSquareAlignment(x, y);
    case 'round':
      return renderRoundAlignment(x, y);
    case 'rounded':
    default:
      return renderRoundedAlignment(x, y);
  }
}

// Square (sharp corners)
function renderSquareFinder(x: number, y: number): string {
  return (
    `<rect x="${x}" y="${y}" width="7" height="7" fill="none" stroke="#000" stroke-width="1"/>` +
    `<rect x="${x + 2}" y="${y + 2}" width="3" height="3" fill="#000"/>`
  );
}

function renderSquareAlignment(x: number, y: number): string {
  return (
    `<rect x="${x}" y="${y}" width="5" height="5" fill="none" stroke="#000" stroke-width="1"/>` +
    `<rect x="${x + 1.75}" y="${y + 1.75}" width="1.5" height="1.5" fill="#000"/>`
  );
}

// Rounded (stroke with round linecap — current style)
function renderRoundedFinder(x: number, y: number): string {
  return (
    `<path d="M${x + 0.5},${y + 0.5}h6v6h-6z" fill="none" stroke="#000" stroke-width="0.9" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<rect x="${x + 2.25}" y="${y + 2.25}" width="2.5" height="2.5" rx="0.3" fill="#000"/>`
  );
}

function renderRoundedAlignment(x: number, y: number): string {
  return (
    `<path d="M${x + 0.5},${y + 0.5}h4v4h-4z" fill="none" stroke="#000" stroke-width="0.9" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<rect x="${x + 1.75}" y="${y + 1.75}" width="1.5" height="1.5" rx="0.2" fill="#000"/>`
  );
}

// Round (circular)
function renderRoundFinder(x: number, y: number): string {
  const cx = x + 3.5;
  const cy = y + 3.5;
  return (
    `<circle cx="${cx}" cy="${cy}" r="3" fill="none" stroke="#000" stroke-width="0.9"/>` +
    `<circle cx="${cx}" cy="${cy}" r="1.25" fill="#000"/>`
  );
}

function renderRoundAlignment(x: number, y: number): string {
  const cx = x + 2.5;
  const cy = y + 2.5;
  return (
    `<circle cx="${cx}" cy="${cy}" r="2" fill="none" stroke="#000" stroke-width="0.9"/>` +
    `<circle cx="${cx}" cy="${cy}" r="0.75" fill="#000"/>`
  );
}
