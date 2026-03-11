const precalculateExpArrays = (): [Uint8Array, Uint8Array] => {
  const log = new Uint8Array(256);
  const exp = new Uint8Array(256);
  for (let exponent = 1, value = 1; exponent < 256; exponent++) {
    value = value > 127 ? (value << 1) ^ 285 : value << 1;
    log[value] = exponent % 255;
    exp[exponent % 255] = value;
  }
  return [log, exp];
};

const [LOG, EXP] = precalculateExpArrays();

export function mul(a: number, b: number): number {
  return a && b ? EXP[(LOG[a] + LOG[b]) % 255] : 0;
}

export function div(a: number, b: number): number {
  return EXP[(LOG[a] + LOG[b] * 254) % 255];
}

export function polyMul(
  poly1: Uint8Array,
  poly2: Uint8Array | number[],
): Uint8Array {
  const coeffs = new Uint8Array(poly1.length + poly2.length - 1);
  for (let index = 0; index < coeffs.length; index++) {
    let coeff = 0;
    for (let p1index = 0; p1index <= index; p1index++) {
      const p2index = index - p1index;
      coeff ^= mul(poly1[p1index], poly2[p2index]);
    }
    coeffs[index] = coeff;
  }
  return coeffs;
}

export function polyRest(
  dividend: Uint8Array,
  divisor: Uint8Array,
): Uint8Array {
  const quotientLength = dividend.length - divisor.length + 1;
  let rest = new Uint8Array(dividend);
  for (let count = 0; count < quotientLength; count++) {
    if (rest[0]) {
      const factor = div(rest[0], divisor[0]);
      const subtr = new Uint8Array(rest.length);
      subtr.set(polyMul(divisor, [factor]), 0);
      rest = rest.map((value, index) => value ^ subtr[index]).slice(1);
    } else {
      rest = rest.slice(1);
    }
  }
  return rest;
}

export function getGeneratorPoly(degree: number): Uint8Array {
  let lastPoly = new Uint8Array([1]);
  for (let index = 0; index < degree; index++) {
    lastPoly = polyMul(lastPoly, new Uint8Array([1, EXP[index]]));
  }
  return lastPoly;
}

export function getEDC(data: Uint8Array, codewords: number): Uint8Array {
  const degree = codewords - data.length;
  const messagePoly = new Uint8Array(codewords);
  messagePoly.set(data, 0);
  return polyRest(messagePoly, getGeneratorPoly(degree));
}
