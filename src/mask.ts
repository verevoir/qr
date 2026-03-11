import type { ErrorLevel, QrResult } from './types.js';
import { getMaskedQRCode, combineMatrices } from './matrix.js';

const RULE_3_PATTERN = new Uint8Array([1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0]);
const RULE_3_REVERSED = RULE_3_PATTERN.slice().reverse();

function getLinePenalty(line: number[] | Uint8Array): number {
  let count = 0;
  let counting = 0;
  let penalty = 0;
  for (const cell of line) {
    if (cell !== counting) {
      counting = cell;
      count = 1;
    } else {
      count++;
      if (count === 5) {
        penalty += 3;
      } else if (count > 5) {
        penalty++;
      }
    }
  }
  return penalty;
}

function getPenaltyScore(
  dataMatrix: Uint8Array[],
  fixedMatrix: Uint8Array[],
): number {
  const combined = combineMatrices(dataMatrix, fixedMatrix);
  const size = combined.length;
  let totalPenalty = 0;

  // Rule 1: consecutive same-color modules
  totalPenalty += combined.reduce((sum, row) => sum + getLinePenalty(row), 0);
  totalPenalty += combined.reduce((sum, _, colIndex) => {
    const column = combined.map((row) => row[colIndex]);
    return sum + getLinePenalty(column);
  }, 0);

  // Rule 2: 2x2 blocks
  let blocks = 0;
  for (let row = 0; row < size - 1; row++) {
    for (let col = 0; col < size - 1; col++) {
      const module = combined[row][col];
      if (
        combined[row][col + 1] === module &&
        combined[row + 1][col] === module &&
        combined[row + 1][col + 1] === module
      ) {
        blocks++;
      }
    }
  }
  totalPenalty += blocks * 3;

  // Rule 3: finder-like patterns
  let patterns = 0;
  for (let index = 0; index < size; index++) {
    const row = combined[index];
    for (let colIndex = 0; colIndex < size - 11; colIndex++) {
      if (
        [RULE_3_PATTERN, RULE_3_REVERSED].some((pattern) =>
          pattern.every((cell, ptr) => cell === row[colIndex + ptr]),
        )
      ) {
        patterns++;
      }
    }
    for (let rowIndex = 0; rowIndex < size - 11; rowIndex++) {
      if (
        [RULE_3_PATTERN, RULE_3_REVERSED].some((pattern) =>
          pattern.every(
            (cell, ptr) => cell === combined[rowIndex + ptr][index],
          ),
        )
      ) {
        patterns++;
      }
    }
  }
  totalPenalty += patterns * 40;

  // Rule 4: dark/light balance
  const totalModules = size * size;
  const darkModules = combined.reduce(
    (sum, line) => sum + line.reduce((lineSum, cell) => lineSum + cell, 0),
    0,
  );
  const percentage = (darkModules * 100) / totalModules;
  totalPenalty += Math.abs(Math.trunc(percentage / 5 - 10)) * 10;

  return totalPenalty;
}

export function rankMasks(
  version: number,
  codewords: Uint8Array,
  errorLevel: string,
  threshold?: number,
): QrResult[] {
  const all: {
    dataMatrix: Uint8Array[];
    fixedMatrix: Uint8Array[];
    finderCoordinates: [number, number][];
    alignmentCoordinates: [number, number][];
    mask: number;
    penalty: number;
  }[] = [];

  for (let i = 0; i < 8; i++) {
    const qr = getMaskedQRCode(version, codewords, errorLevel, i);
    const penalty = getPenaltyScore(qr.dataMatrix, qr.fixedMatrix);
    all.push({ ...qr, mask: i, penalty });
  }

  all.sort((a, b) => a.penalty - b.penalty);
  const bestPenalty = all[0].penalty;
  const cutoff = threshold ?? bestPenalty * 1.3;

  return all
    .filter((c) => c.penalty <= cutoff)
    .map((c) => ({
      matrix: combineMatrices(c.dataMatrix, c.fixedMatrix),
      size: c.dataMatrix.length,
      dataMatrix: c.dataMatrix,
      fixedMatrix: c.fixedMatrix,
      finderCoordinates: c.finderCoordinates,
      alignmentCoordinates: c.alignmentCoordinates,
      version,
      errorLevel: errorLevel as ErrorLevel,
      maskIndex: c.mask,
      penalty: c.penalty,
    }));
}
