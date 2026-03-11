import type { EncodeOptions, ErrorLevel, QrResult } from './types.js';
import { getCodewords } from './data.js';
import { rankMasks } from './mask.js';

export function encode(text: string, options?: EncodeOptions): QrResult[] {
  const minErrorLevel: ErrorLevel = options?.minErrorLevel ?? 'L';
  const { codewords, version, errorLevel } = getCodewords(text, minErrorLevel);
  return rankMasks(version, codewords, errorLevel, options?.threshold);
}
