import { polyRest } from './galois.js';
import { getAlignmentTracks } from './data.js';

export function getSize(version: number): number {
  return version * 4 + 17;
}

export function getNewMatrix(version: number): Uint8Array[] {
  return getNewMatrixFromSize(getSize(version));
}

export function getNewMatrixFromSize(size: number): Uint8Array[] {
  return Array.from({ length: size }, () => new Uint8Array(size));
}

export function fillArea(
  matrix: Uint8Array[],
  row: number,
  column: number,
  width: number,
  height: number,
  fill = 1,
): void {
  const fillRow = new Uint8Array(width).fill(fill);
  for (let index = row; index < row + height; index++) {
    matrix[index].set(fillRow, column);
  }
}

function maskFixedFeatures(
  matrix: Uint8Array[],
  version: number,
): Uint8Array[] {
  const size = getSize(version);

  // Finder patterns + separators
  fillArea(matrix, 0, 0, 9, 9);
  fillArea(matrix, 0, size - 8, 8, 9);
  fillArea(matrix, size - 8, 0, 9, 8);

  // Alignment patterns
  const alignmentTracks = getAlignmentTracks(version);
  const lastTrack = alignmentTracks.length - 1;
  alignmentTracks.forEach((row, rowIndex) => {
    alignmentTracks.forEach((column, columnIndex) => {
      if (
        (rowIndex === 0 && (columnIndex === 0 || columnIndex === lastTrack)) ||
        (columnIndex === 0 && rowIndex === lastTrack)
      ) {
        return;
      }
      fillArea(matrix, row - 2, column - 2, 5, 5);
    });
  });

  // Timing patterns
  fillArea(matrix, 6, 9, version * 4, 1);
  fillArea(matrix, 9, 6, 1, version * 4);
  // Dark module
  matrix[size - 8][8] = 1;

  // Version info
  if (version > 6) {
    fillArea(matrix, 0, size - 11, 3, 6);
    fillArea(matrix, size - 11, 0, 6, 3);
  }
  return matrix;
}

type MaskFunction = (row: number, column: number) => boolean;

const MASK_FNS: MaskFunction[] = [
  (row, column) => ((row + column) & 1) === 0,
  (row) => (row & 1) === 0,
  (_, column) => column % 3 === 0,
  (row, column) => (row + column) % 3 === 0,
  (row, column) => (((row >> 1) + Math.floor(column / 3)) & 1) === 0,
  (row, column) => ((row * column) & 1) + ((row * column) % 3) === 0,
  (row, column) => ((((row * column) & 1) + ((row * column) % 3)) & 1) === 0,
  (row, column) => ((((row + column) & 1) + ((row * column) % 3)) & 1) === 0,
];

function getModuleSequence(
  matrix: Uint8Array[],
  version: number,
): [number, number][] {
  const size = getSize(version);
  let rowStep = -1;
  let row = size - 1;
  let column = size - 1;
  const sequence: [number, number][] = [];
  let index = 0;
  while (column >= 0) {
    if (matrix[row][column] === 0) {
      sequence.push([row, column]);
    }
    if (index & 1) {
      row += rowStep;
      if (row === -1 || row === size) {
        rowStep = -rowStep;
        row += rowStep;
        column -= column === 7 ? 2 : 1;
      } else {
        column++;
      }
    } else {
      column--;
    }
    index++;
  }
  return sequence;
}

export function getMaskedMatrix(
  version: number,
  codewords: Uint8Array,
  maskIndex: number,
): Uint8Array[] {
  let matrixMask = getNewMatrix(version);
  matrixMask = maskFixedFeatures(matrixMask, version);

  const sequence = getModuleSequence(matrixMask, version);
  const matrix = getNewMatrix(version);

  sequence.forEach(([row, column], index) => {
    const codeword = codewords[index >> 3];
    const bitShift = 7 - (index & 7);
    const moduleBit = (codeword >> bitShift) & 1;
    matrix[row][column] =
      moduleBit ^ (MASK_FNS[maskIndex](row, column) ? 1 : 0);
  });

  return matrix;
}

export function getFinderPatternCoordinates(
  version: number,
): [number, number][] {
  const size = getSize(version);
  return [
    [0, 0],
    [size - 7, 0],
    [0, size - 7],
  ];
}

export function placeFinderPatterns(
  matrix: Uint8Array[],
  coordinates: [number, number][],
): void {
  coordinates.forEach(([row, col]) => {
    fillArea(matrix, row, col, 7, 7);
    fillArea(matrix, row + 1, col + 1, 5, 5, 0);
    fillArea(matrix, row + 2, col + 2, 3, 3);
  });
}

export function getAlignmentCoordinates(version: number): [number, number][] {
  const alignmentTracks = getAlignmentTracks(version);
  const lastTrack = alignmentTracks.length - 1;
  const coordinates: [number, number][] = [];
  alignmentTracks.forEach((row, rowIndex) => {
    alignmentTracks.forEach((column, columnIndex) => {
      if (
        (rowIndex === 0 && (columnIndex === 0 || columnIndex === lastTrack)) ||
        (columnIndex === 0 && rowIndex === lastTrack)
      ) {
        return;
      }
      coordinates.push([row - 2, column - 2]);
    });
  });
  return coordinates;
}

export function placeAlignmentPatterns(
  matrix: Uint8Array[],
  coordinates: [number, number][],
): void {
  coordinates.forEach(([r, c]) => {
    fillArea(matrix, r, c, 5, 5);
    fillArea(matrix, r + 1, c + 1, 3, 3, 0);
    matrix[r + 2][c + 2] = 1;
  });
}

export function placeTimingPatterns(matrix: Uint8Array[]): void {
  const size = matrix.length;
  for (let pos = 8; pos <= size - 9; pos += 2) {
    matrix[6][pos] = 1;
    matrix[6][pos + 1] = 0;
    matrix[pos][6] = 1;
    matrix[pos + 1][6] = 0;
  }
  // Dark module
  matrix[size - 8][8] = 1;
}

const EDC_ORDER = 'MLHQ';
const FORMAT_DIVISOR = new Uint8Array([1, 0, 1, 0, 0, 1, 1, 0, 1, 1, 1]);
const FORMAT_MASK = new Uint8Array([
  1, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0,
]);

function getFormatModules(errorLevel: string, maskIndex: number): Uint8Array {
  const formatPoly = new Uint8Array(15);
  const errorLevelIndex = EDC_ORDER.indexOf(errorLevel);
  formatPoly[0] = errorLevelIndex >> 1;
  formatPoly[1] = errorLevelIndex & 1;
  formatPoly[2] = maskIndex >> 2;
  formatPoly[3] = (maskIndex >> 1) & 1;
  formatPoly[4] = maskIndex & 1;
  const rest = polyRest(formatPoly, FORMAT_DIVISOR);
  formatPoly.set(rest, 5);
  return formatPoly.map((bit, index) => bit ^ FORMAT_MASK[index]);
}

export function placeFormatModules(
  matrix: Uint8Array[],
  errorLevel: string,
  maskIndex: number,
): void {
  const formatModules = getFormatModules(errorLevel, maskIndex);
  matrix[8].set(formatModules.subarray(0, 6), 0);
  matrix[8].set(formatModules.subarray(6, 8), 7);
  matrix[8].set(formatModules.subarray(7), matrix.length - 8);
  matrix[7][8] = formatModules[8];
  formatModules
    .subarray(0, 7)
    .forEach((cell, index) => (matrix[matrix.length - index - 1][8] = cell));
  formatModules
    .subarray(9)
    .forEach((cell, index) => (matrix[5 - index][8] = cell));
}

const VERSION_DIVISOR = new Uint8Array([1, 1, 1, 1, 1, 0, 0, 1, 0, 0, 1, 0, 1]);

function getVersionInformation(version: number): Uint8Array {
  const versionText = version.toString(2).padStart(6, '0') + '000000000000';
  const poly = Uint8Array.from(
    versionText.split('').map((letter) => Number(letter)),
  );
  poly.set(polyRest(poly, VERSION_DIVISOR), 6);
  return poly;
}

export function placeVersionModules(matrix: Uint8Array[]): void {
  const size = matrix.length;
  const version = (size - 17) >> 2;
  if (version < 7) return;
  getVersionInformation(version).forEach((bit, index) => {
    const row = Math.floor(index / 3);
    const col = index % 3;
    matrix[5 - row][size - 9 - col] = bit;
    matrix[size - 11 + col][row] = bit;
  });
}

export interface QrCode {
  dataMatrix: Uint8Array[];
  fixedMatrix: Uint8Array[];
  finderCoordinates: [number, number][];
  alignmentCoordinates: [number, number][];
}

export function getMaskedQRCode(
  version: number,
  codewords: Uint8Array,
  errorLevel: string,
  maskIndex: number,
): QrCode {
  const dataMatrix = getMaskedMatrix(version, codewords, maskIndex);
  placeFormatModules(dataMatrix, errorLevel, maskIndex);
  placeTimingPatterns(dataMatrix);
  placeVersionModules(dataMatrix);

  const fixedMatrix = getNewMatrix(version);
  const finderCoordinates = getFinderPatternCoordinates(version);
  const alignmentCoordinates = getAlignmentCoordinates(version);
  placeFinderPatterns(fixedMatrix, finderCoordinates);
  placeAlignmentPatterns(fixedMatrix, alignmentCoordinates);

  return {
    dataMatrix,
    fixedMatrix,
    finderCoordinates,
    alignmentCoordinates,
  };
}

export function combineMatrices(
  leftMatrix: ReadonlyArray<Uint8Array>,
  rightMatrix: ReadonlyArray<Uint8Array>,
): Uint8Array[] {
  const size = leftMatrix.length;
  const combined = getNewMatrixFromSize(size);
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      combined[row][col] =
        leftMatrix[row][col] || rightMatrix[row][col] ? 1 : 0;
    }
  }
  return combined;
}
