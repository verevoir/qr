import type { EncodeOptions, ErrorLevel, QrResult } from './types.js';
import { getCodewords } from './data.js';
import { rankMasks } from './mask.js';

export function encode(text: string, options?: EncodeOptions): QrResult[] {
  const logoArea = options?.logoArea ?? 0;
  if (logoArea < 0 || logoArea >= 1) {
    throw new Error(
      `encode: logoArea must be in [0, 1), got ${logoArea}`,
    );
  }
  // A logo covering the centre eats error-correction capacity; H is the
  // only level with enough recovery budget to survive, so reserving any
  // logo area implicitly boosts EC to H.
  const minErrorLevel: ErrorLevel =
    options?.boostErrorCorrection || logoArea > 0
      ? 'H'
      : (options?.minErrorLevel ?? 'L');
  const { codewords, version, errorLevel } = getCodewords(
    text,
    minErrorLevel,
    logoArea,
  );
  return rankMasks(version, codewords, errorLevel, options?.threshold);
}
