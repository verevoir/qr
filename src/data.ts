import { getEDC } from './galois.js';

const NUMERIC_RE = /^\d*$/;
const ALPHANUMERIC_RE = /^[\dA-Z $%*+\-./:]*$/;
// eslint-disable-next-line no-control-regex
const LATIN1_RE = /^[\x00-\xff]*$/;
const KANJI_RE =
  /^[\p{Script_Extensions=Han}\p{Script_Extensions=Hiragana}\p{Script_Extensions=Katakana}]*$/u;

export function getEncodingMode(content: string): number {
  if (NUMERIC_RE.test(content)) return 0b0001;
  if (ALPHANUMERIC_RE.test(content)) return 0b0010;
  if (LATIN1_RE.test(content)) return 0b0100;
  if (KANJI_RE.test(content)) return 0b1000;
  return 0b0111;
}

const LENGTH_BITS = [
  [10, 12, 14],
  [9, 11, 13],
  [8, 16, 16],
  [8, 10, 12],
];

export function getLengthBits(mode: number, version: number): number {
  const modeIndex = 31 - Math.clz32(mode);
  const bitsIndex = version > 26 ? 2 : version > 9 ? 1 : 0;
  return LENGTH_BITS[modeIndex][bitsIndex];
}

type TranslatedContent = { value: number; bitLength: number };

function putBits(
  buffer: Uint8Array,
  value: number,
  bitLength: number,
  offset: number,
): void {
  const byteStart = offset >> 3;
  const byteEnd = (offset + bitLength - 1) >> 3;
  let remainingBits = bitLength;
  for (let index = byteStart; index <= byteEnd; index++) {
    const availableBits = index === byteStart ? 8 - (offset & 7) : 8;
    const bitMask = (1 << availableBits) - 1;
    const rightShift = Math.max(0, remainingBits - availableBits);
    const leftShift = Math.max(0, availableBits - remainingBits);
    const chunk = ((value >> rightShift) & bitMask) << leftShift;
    buffer[index] |= chunk;
    remainingBits -= availableBits;
  }
}

function* getByteValues(content: string): Generator<TranslatedContent> {
  for (const char of content) {
    yield { value: char.charCodeAt(0), bitLength: 8 };
  }
}

const BIT_WIDTHS = [0, 4, 7, 10];
function* getNumericValues(content: string): Generator<TranslatedContent> {
  for (let index = 0; index < content.length; index += 3) {
    const chunk = content.substring(index, index + 3);
    const bitLength = BIT_WIDTHS[chunk.length];
    yield { value: parseInt(chunk, 10), bitLength };
  }
}

const ALPHACHAR_MAP = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';
function* getAlphanumericValues(content: string): Generator<TranslatedContent> {
  for (let index = 0; index < content.length; index += 2) {
    const chunk = content.substring(index, index + 2);
    const bitLength = chunk.length === 1 ? 6 : 11;
    const codes = chunk.split('').map((char) => ALPHACHAR_MAP.indexOf(char));
    const value =
      chunk.length === 1
        ? codes[0]
        : codes[0] * ALPHACHAR_MAP.length + codes[1];
    yield { value, bitLength };
  }
}

const valueGenMap: {
  [key: number]: (content: string) => Generator<TranslatedContent>;
} = {
  [0b0001]: getNumericValues,
  [0b0010]: getAlphanumericValues,
  [0b0100]: getByteValues,
};

export function getData(
  content: string,
  lengthBits: number,
  dataCodewords: number,
): Uint8Array {
  const encodingMode = getEncodingMode(content);
  let offset = 4 + lengthBits;
  const data = new Uint8Array(dataCodewords);
  putBits(data, encodingMode, 4, 0);
  putBits(data, content.length, lengthBits, 4);
  const dataGenerator = valueGenMap[encodingMode];
  for (const { value, bitLength } of dataGenerator(content)) {
    putBits(data, value, bitLength, offset);
    offset += bitLength;
  }
  const remainderBits = 8 - (offset & 7);
  const fillerStart = (offset >> 3) + (remainderBits < 4 ? 2 : 1);
  for (let index = 0; index < dataCodewords - fillerStart; index++) {
    const byte = index & 1 ? 17 : 236;
    data[fillerStart + index] = byte;
  }
  return data;
}

// Error correction table: [ecBlockSize, blocks] per version per level
type EcSpec = [blocks: number, ecBlockSize: number];
type EcChoice = { [level: string]: EcSpec };

const EC_TABLE: EcChoice[] = [
  { L: [7, 1], M: [10, 1], Q: [13, 1], H: [17, 1] },
  { L: [10, 1], M: [16, 1], Q: [22, 1], H: [28, 1] },
  { L: [15, 1], M: [26, 1], Q: [18, 2], H: [22, 2] },
  { L: [20, 1], M: [18, 2], Q: [26, 2], H: [16, 4] },
  { L: [26, 1], M: [24, 2], Q: [18, 4], H: [22, 4] },
  { L: [18, 2], M: [16, 4], Q: [24, 4], H: [28, 4] },
  { L: [20, 2], M: [18, 4], Q: [18, 6], H: [26, 5] },
  { L: [24, 2], M: [22, 4], Q: [22, 6], H: [26, 6] },
  { L: [30, 2], M: [22, 5], Q: [20, 8], H: [24, 8] },
  { L: [18, 4], M: [26, 5], Q: [24, 8], H: [28, 8] },
  { L: [20, 4], M: [30, 5], Q: [28, 8], H: [24, 11] },
  { L: [24, 4], M: [22, 8], Q: [26, 10], H: [28, 11] },
  { L: [26, 4], M: [22, 9], Q: [24, 12], H: [22, 16] },
  { L: [30, 4], M: [24, 9], Q: [20, 16], H: [24, 16] },
  { L: [22, 6], M: [24, 10], Q: [30, 12], H: [24, 18] },
  { L: [24, 6], M: [28, 10], Q: [24, 17], H: [30, 16] },
  { L: [28, 6], M: [28, 11], Q: [28, 16], H: [28, 19] },
  { L: [30, 6], M: [26, 13], Q: [28, 18], H: [28, 21] },
  { L: [28, 7], M: [26, 14], Q: [26, 21], H: [26, 25] },
  { L: [28, 8], M: [26, 16], Q: [30, 20], H: [28, 25] },
  { L: [28, 8], M: [26, 17], Q: [28, 23], H: [30, 25] },
  { L: [28, 9], M: [28, 17], Q: [30, 23], H: [24, 34] },
  { L: [30, 9], M: [28, 18], Q: [30, 25], H: [30, 30] },
  { L: [30, 10], M: [28, 20], Q: [30, 27], H: [30, 32] },
  { L: [26, 12], M: [28, 21], Q: [30, 29], H: [30, 35] },
  { L: [28, 12], M: [28, 23], Q: [28, 34], H: [30, 37] },
  { L: [30, 12], M: [28, 25], Q: [30, 34], H: [30, 40] },
  { L: [30, 13], M: [28, 26], Q: [30, 35], H: [30, 42] },
  { L: [30, 14], M: [28, 28], Q: [30, 38], H: [30, 45] },
  { L: [30, 15], M: [28, 29], Q: [30, 40], H: [30, 48] },
  { L: [30, 16], M: [28, 31], Q: [30, 43], H: [30, 51] },
  { L: [30, 17], M: [28, 33], Q: [30, 45], H: [30, 54] },
  { L: [30, 18], M: [28, 35], Q: [30, 48], H: [30, 57] },
  { L: [30, 19], M: [28, 37], Q: [30, 51], H: [30, 60] },
  { L: [30, 19], M: [28, 38], Q: [30, 53], H: [30, 63] },
  { L: [30, 20], M: [28, 40], Q: [30, 56], H: [30, 66] },
  { L: [30, 21], M: [28, 43], Q: [30, 59], H: [30, 70] },
  { L: [30, 22], M: [28, 45], Q: [30, 62], H: [30, 74] },
  { L: [30, 24], M: [28, 47], Q: [30, 65], H: [30, 77] },
  { L: [30, 25], M: [28, 49], Q: [30, 68], H: [30, 81] },
];

export function getAlignmentTracks(version: number): number[] {
  if (version === 1) return [];
  const intervals = Math.floor(version / 7) + 1;
  const distance = 4 * version + 4;
  const step = Math.ceil(distance / intervals / 2) * 2;
  return [6].concat(
    Array.from(
      { length: intervals },
      (_, index) => distance + 6 - (intervals - 1 - index) * step,
    ),
  );
}

function getAvailableModules(version: number): number {
  if (version === 1) {
    return 21 * 21 - 3 * 8 * 8 - 2 * 15 - 1 - 2 * 5;
  }
  const alignmentCount = Math.floor(version / 7) + 2;
  return (
    (version * 4 + 17) ** 2 -
    3 * 8 * 8 -
    (alignmentCount ** 2 - 3) * 5 * 5 -
    2 * (version * 4 + 1) +
    (alignmentCount - 2) * 5 * 2 -
    2 * 15 -
    1 -
    (version > 6 ? 2 * 3 * 6 : 0)
  );
}

export function getDataCodewords(version: number, errorLevel: string): number {
  const totalCodewords = getAvailableModules(version) >> 3;
  const [blocks, ecBlockSize] = EC_TABLE[version - 1][errorLevel];
  return totalCodewords - blocks * ecBlockSize;
}

function getNumericCapacity(availableBits: number): number {
  const remainderBits = availableBits % 10;
  return (
    Math.floor(availableBits / 10) * 3 +
    (remainderBits > 6 ? 2 : remainderBits > 3 ? 1 : 0)
  );
}

function getAlphanumericCapacity(availableBits: number): number {
  return Math.floor(availableBits / 11) * 2 + (availableBits % 11 > 5 ? 1 : 0);
}

function getByteCapacity(availableBits: number): number {
  return availableBits >> 3;
}

function getKanjiCapacity(availableBits: number): number {
  return Math.floor(availableBits / 13);
}

const capacityFnMap: { [key: number]: (availableBits: number) => number } = {
  [0b0001]: getNumericCapacity,
  [0b0010]: getAlphanumericCapacity,
  [0b0100]: getByteCapacity,
  [0b1000]: getKanjiCapacity,
};

function getCapacity(
  version: number,
  errorLevel: string,
  encodingMode: number,
): number {
  const dataCodewords = getDataCodewords(version, errorLevel);
  const lengthBits = getLengthBits(encodingMode, version);
  const availableBits = (dataCodewords << 3) - lengthBits - 4;
  return capacityFnMap[encodingMode](availableBits);
}

export function getVersionAndErrorLevel(
  encodingMode: number,
  contentLength: number,
  minErrorLevel = 'L',
): [version: number, errorLevel: string] {
  const errorLevels = 'HQML'.slice(0, 'HQML'.indexOf(minErrorLevel) + 1);
  for (let version = 1; version <= 40; version++) {
    for (const errorLevel of errorLevels) {
      const capacity = getCapacity(version, errorLevel, encodingMode);
      if (capacity >= contentLength) {
        return [version, errorLevel];
      }
    }
  }
  throw new Error('content is too large');
}

function reorderData(data: Uint8Array, blocks: number): Uint8Array {
  const blockSize = Math.floor(data.length / blocks);
  const group1 = blocks - (data.length % blocks);
  const blockStartIndexes = Array.from({ length: blocks }, (_, index) =>
    index < group1 ? blockSize * index : (blockSize + 1) * index - group1,
  );
  return Uint8Array.from(data, (_, index) => {
    const blockOffset = Math.floor(index / blocks);
    const blockIndex =
      (index % blocks) + (blockOffset === blockSize ? group1 : 0);
    const codewordIndex = blockStartIndexes[blockIndex] + blockOffset;
    return data[codewordIndex];
  });
}

function getECData(
  data: Uint8Array,
  blocks: number,
  ecBlockSize: number,
): Uint8Array {
  const dataBlockSize = Math.floor(data.length / blocks);
  const group1 = blocks - (data.length % blocks);
  const ecData = new Uint8Array(ecBlockSize * blocks);
  for (let offset = 0; offset < blocks; offset++) {
    const start =
      offset < group1
        ? dataBlockSize * offset
        : (dataBlockSize + 1) * offset - group1;
    const end = start + dataBlockSize + (offset < group1 ? 0 : 1);
    const dataBlock = data.subarray(start, end);
    const ecCodewords = getEDC(dataBlock, dataBlock.length + ecBlockSize);
    ecCodewords.forEach((codeword, index) => {
      ecData[index * blocks + offset] = codeword;
    });
  }
  return ecData;
}

export interface CodewordResult {
  codewords: Uint8Array;
  version: number;
  errorLevel: string;
  encodingMode: number;
}

export function getCodewords(
  content: string,
  minErrorLevel = 'L',
  reservedCapacityRatio = 0,
): CodewordResult {
  const encodingMode = getEncodingMode(content);
  const targetLength =
    reservedCapacityRatio > 0
      ? Math.ceil(content.length / (1 - reservedCapacityRatio))
      : content.length;
  const [version, errorLevel] = getVersionAndErrorLevel(
    encodingMode,
    targetLength,
    minErrorLevel,
  );
  const lengthBits = getLengthBits(encodingMode, version);
  const dataCodewords = getDataCodewords(version, errorLevel);
  const [ecBlockSize, blocks] = EC_TABLE[version - 1][errorLevel];

  const rawData = getData(content, lengthBits, dataCodewords);
  const data = reorderData(rawData, blocks);
  const ecData = getECData(rawData, blocks, ecBlockSize);

  const codewords = new Uint8Array(data.length + ecData.length);
  codewords.set(data, 0);
  codewords.set(ecData, data.length);

  return { codewords, version, errorLevel, encodingMode };
}
